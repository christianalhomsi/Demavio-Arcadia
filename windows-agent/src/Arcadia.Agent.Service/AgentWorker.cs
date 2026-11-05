using System.Diagnostics;
using System.Text.Json;
using Arcadia.Agent.Core;
using Arcadia.Contracts;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Arcadia.Agent.Service;

/// <summary>
/// The privileged agent loop. Owns persisted state, runs the 1-second lock reconciler (the timer is never the only
/// source of lock state), recovers after reboot, and is the only component allowed to lock, log off or power off.
/// </summary>
public sealed class AgentWorker : BackgroundService, Arcadia.Agent.Link.ICommandSink
{
    private static readonly TimeSpan UiAckTimeout = TimeSpan.FromSeconds(3);
    private static readonly TimeSpan CheckpointEvery = TimeSpan.FromSeconds(15);

    private readonly AgentOptions _opt;
    private readonly Arcadia.Agent.Link.ICredentialStore _creds;
    private readonly ILogger<AgentWorker> _log;
    private readonly IAgentClock _clock;
    private readonly UiHost _ui;
    private readonly UiLauncher _launcher;
    private readonly StateStore _store;
    private readonly ClockMonitor _clockMon = new();
    private readonly AttemptLimiter _pinLimiter = new();
    private readonly object _lock = new();

    private AgentState _state = new();
    private LockState _actual = LockState.Unknown;
    private long _msgId;
    private long _pendingMsgId;
    private DateTimeOffset _pendingSince;
    private DateTimeOffset _lastCheckpoint = DateTimeOffset.MinValue;
    private TimeSpan? _serverOffset; // set once a Hall Server link exists
    private readonly HashSet<(Guid, long, long)> _warned = [];

    public AgentWorker(IOptions<AgentOptions> opt, ILogger<AgentWorker> log, IAgentClock clock, UiHost ui,
        UiLauncher launcher, Arcadia.Agent.Link.ICredentialStore creds)
    {
        _opt = opt.Value; _log = log; _clock = clock; _ui = ui; _launcher = launcher; _creds = creds;
        _store = new StateStore(_opt.StatePath);
        _ui.MessageReceived += OnUiMessage;
    }

    public long LastDeviceSeq { get { lock (_lock) return _state.LastDeviceSeq; } }

    /// <summary>Snapshot sent to the Hall Server. Type is HEARTBEAT or RECOVERED.</summary>
    public LinkMessage Heartbeat(string type)
    {
        lock (_lock)
        {
            var s = _state.Session;
            TimeEvaluation? t = s is { State: SessionState.Active }
                ? TimeEvaluator.Evaluate(s, _clock.UtcNow, _clock.MonotonicMs, _clock.BootId, _serverOffset) : null;
            return new LinkMessage(type, AgentId: _state.AgentId, BootId: _clock.BootId, Utc: _clock.UtcNow, Lock: _actual,
                Session: s?.State ?? SessionState.Pending, SessionId: s?.SessionId, Revision: s?.Revision ?? 0,
                RemainingMs: t?.RemainingMs ?? 0, Reliability: t?.Reliability);
        }
    }

    /// <summary>Called by the Hall Server link on every heartbeat with the measured server-minus-local offset.</summary>
    public void SetServerOffset(TimeSpan? offset) { lock (_lock) _serverOffset = offset; }

    /// <summary>Entry point for any transport (Hall Server link, dev file source). Thread-safe.</summary>
    public CommandResult Handle(CommandEnvelope cmd)
    {
        lock (_lock)
        {
            var now = _clock.UtcNow + (_serverOffset ?? TimeSpan.Zero);
            var d = CommandProcessor.Evaluate(cmd, _state, now);

            if (d.Kind == DecisionKind.Duplicate) return d.Stored!;
            if (d.Kind == DecisionKind.Reject)
            {
                _log.LogWarning("Command {Id} {Type} rejected: {Reason}", cmd.CommandId, cmd.Type, d.Reason);
                var rejected = Result(cmd.CommandId, CommandStatus.Rejected, d.Reason);
                _state.Remember(rejected);
                Persist();
                return rejected;
            }

            CommandProcessor.Apply(cmd, _state, _clock);
            // Persist BEFORE acknowledging / executing (contract section 5).
            var status = cmd.Type is CommandType.SHUTDOWN or CommandType.RESTART ? CommandStatus.Acknowledged : CommandStatus.Executed;
            var result = Result(cmd.CommandId, status, FailureReason.None);
            _state.Remember(result);
            Persist();
            _log.LogInformation("Command {Id} {Type} accepted (rev {Rev})", cmd.CommandId, cmd.Type, result.Revision);

            if (_state.PendingPower is { } p && p.CommandId == cmd.CommandId) ExecutePower(p);
            return result;
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        Recover();
        var pipeTask = _ui.RunAsync(stoppingToken);

        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));
        try
        {
            do { lock (_lock) Tick(); } while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException) { }
        // Never leave the machine unlocked on shutdown of the service: persist final state.
        lock (_lock) Persist();
        try { await pipeTask; } catch (OperationCanceledException) { }
    }

    // ---- Recovery (offline doc section 6): boot Locked, load, verify, re-evaluate, never unlock on uncertainty ----

    private void Recover()
    {
        var (loaded, usedBackup, corrupt) = _store.Load();
        if (loaded is null)
        {
            _state = NewState();
            if (corrupt)
            {
                _log.LogError("State file and backup are unreadable; session is Unknown and the PC stays locked.");
                _state.Session = new SessionRecord { State = SessionState.Unknown };
            }
        }
        else
        {
            _state = loaded;
            if (usedBackup) _log.LogWarning("Main state file was corrupt; recovered from backup.");
            ApplyIdentityFromOptions();
        }

        // Reconcile a power command that was pending before this process started (contract section 5).
        if (_state.PendingPower is { } p)
        {
            if (p.BootId != _clock.BootId)
            {
                var done = Result(p.CommandId, CommandStatus.Executed, FailureReason.None);
                _state.Remember(done);
                _log.LogInformation("Power command {Id} confirmed by a new boot id.", p.CommandId);
            }
            else if (_clock.UtcNow - p.RequestedAtUtc > TimeSpan.FromSeconds(p.GraceSeconds + 60))
            {
                _state.Remember(Result(p.CommandId, CommandStatus.Failed, FailureReason.POWER_DENIED));
                _log.LogWarning("Power command {Id} did not take effect.", p.CommandId);
            }
            _state.PendingPower = null; // never auto-retried
        }

        if (_state.Session is { State: SessionState.Active } s)
        {
            var t = TimeEvaluator.Evaluate(s, _clock.UtcNow, _clock.MonotonicMs, _clock.BootId, _serverOffset);
            _log.LogInformation("Recovered active session {Sid} rev {Rev}: remaining {Rem} ms, time {Rel}",
                s.SessionId, s.Revision, t.RemainingMs, t.Reliability);
            if (t.Reliability == TimeReliability.Uncertain)
            {
                s.State = SessionState.Unknown; // stays locked until staff or the server resolves it
                _log.LogWarning("Time is uncertain after recovery; session marked Unknown, PC stays locked.");
            }
            else
            {
                TimeEvaluator.Checkpoint(s, t, _clock.UtcNow, _clock.MonotonicMs, _clock.BootId);
            }
        }

        _actual = LockState.Unknown; // the reconciler will issue a Lock first, then Unlock if appropriate
        Persist();
    }

    private AgentState NewState()
    {
        var s = new AgentState();
        _state = s;
        ApplyIdentityFromOptions();
        return _state;
    }

    private void ApplyIdentityFromOptions()
    {
        // Paired identity (from the Hall Server pairing) wins over configuration.
        if (_creds.Load() is { } paired)
        {
            _state.AgentId = paired.AgentId; _state.TenantId = paired.TenantId; _state.StationId = paired.StationId;
            return;
        }
        if (_opt.AgentId != Guid.Empty) _state.AgentId = _opt.AgentId;
        if (_opt.TenantId != Guid.Empty) _state.TenantId = _opt.TenantId;
        if (_opt.StationId != Guid.Empty) _state.StationId = _opt.StationId;
        if (_state.AgentId == Guid.Empty) _state.AgentId = Guid.NewGuid(); // dev only; real identity comes from pairing
    }

    // ---- Per-second reconciler ----

    private void Tick()
    {
        var now = _clock.UtcNow;
        var mono = _clock.MonotonicMs;

        // Wall-clock jump detection (offline doc section 5).
        if (_clockMon.Observe(now, mono) is { } jump)
        {
            _log.LogWarning("Wall clock changed by {Jump} ms relative to the monotonic clock.", jump);
            if (_state.Session is { } sess) sess.ClockChangedSinceCheckpoint = true;
        }

        TimeEvaluation? t = null;
        if (_state.Session is { State: SessionState.Active } s)
        {
            t = TimeEvaluator.Evaluate(s, now, mono, _clock.BootId, _serverOffset);
            if (now - _lastCheckpoint >= CheckpointEvery)
            {
                if (t.Value.Reliability != TimeReliability.Uncertain)
                {
                    TimeEvaluator.Checkpoint(s, t.Value, now, mono, _clock.BootId);
                    Persist();
                }
                _lastCheckpoint = now;
            }
            if (t.Value.RemainingMs <= 0 || t.Value.Reliability == TimeReliability.Uncertain)
            {
                if (t.Value.RemainingMs <= 0) s.State = SessionState.Ended;
                else s.State = SessionState.Unknown;
                Persist();
            }
        }

        // The UI must be alive to be shown; otherwise escalate if it should be locked.
        var launcherSignedOut = _launcher.EnsureRunning(now);

        var desired = LockReconciler.Desired(_state, t);
        if (LockReconciler.IsViolation(_state.Session?.State ?? SessionState.Pending, _actual) && !_state.StaffUnlock)
            _log.LogCritical("Invalid state: lock {Lock} with session {Session}. Forcing lock.", _actual, _state.Session?.State);

        // Ack timeout for Locking/Unlocking transitions.
        if (_actual is LockState.Locking or LockState.Unlocking && now - _pendingSince > UiAckTimeout)
        {
            _log.LogError("UI did not acknowledge {State} within {S}s.", _actual, UiAckTimeout.TotalSeconds);
            if (desired == LockState.Locked) EscalateLock();
            else _actual = LockState.Error; // could not unlock; next tick retries
        }
        if (_actual == LockState.Error && desired == LockState.Locked) EscalateLock();

        switch (LockReconciler.NextAction(_actual, desired))
        {
            case LockAction.Lock when !launcherSignedOut:
                SendToUi(new ServiceToUi("Show_Lock", _opt.HallName, _opt.DeviceName, StatusFor(_state), MsgId: NextMsg()), LockState.Locking, now);
                break;
            case LockAction.Unlock when t is { } tt:
                SendToUi(new ServiceToUi("Show_Timer", _opt.HallName, _opt.DeviceName, RemainingMs: tt.RemainingMs, Revision: _state.Session!.Revision, MsgId: NextMsg()), LockState.Unlocking, now);
                break;
            case LockAction.Unlock: // staff unlock with no session
                SendToUi(new ServiceToUi("Hide", MsgId: NextMsg()), LockState.Unlocking, now);
                break;
        }

        if (_actual == LockState.Unlocked && t is { } time)
        {
            _ui.Send(new ServiceToUi("Show_Timer", _opt.HallName, _opt.DeviceName, RemainingMs: time.RemainingMs, Revision: _state.Session!.Revision));
            Warn(time);
        }
        else if (_actual == LockState.Locked)
        {
            // Keep the lock screen text fresh (status can change: reserved, ended, waiting for staff).
            _ui.Send(new ServiceToUi("Show_Lock", _opt.HallName, _opt.DeviceName, StatusFor(_state), MsgId: _pendingMsgId));
        }
    }

    private void Warn(TimeEvaluation t)
    {
        var s = _state.Session!;
        foreach (var warnAt in s.WarnAtMs)
        {
            if (t.RemainingMs <= warnAt && _warned.Add((s.SessionId, s.Revision, warnAt)))
                _ui.Send(new ServiceToUi("Warn", WarnKind: "time", WarnSeconds: (int)(warnAt / 1000)));
        }
    }

    private void SendToUi(ServiceToUi msg, LockState transition, DateTimeOffset now)
    {
        _pendingMsgId = msg.MsgId;
        _pendingSince = now;
        _actual = transition;
        _ui.Send(msg);
    }

    private void OnUiMessage(UiToService m)
    {
        lock (_lock)
        {
            switch (m.Kind)
            {
                case "Ack" when m.MsgId == _pendingMsgId:
                    if (_actual == LockState.Locking) _actual = LockState.Locked;
                    else if (_actual == LockState.Unlocking) _actual = LockState.Unlocked;
                    break;
                case "TechUnlockRequest":
                    TechUnlock(m.Pin);
                    break;
            }
        }
    }

    private void TechUnlock(string? pin)
    {
        if (!_pinLimiter.TryAcquire(_clock.UtcNow))
        {
            _log.LogWarning("AUDIT technician unlock rate-limited.");
            return;
        }
        if (!PinVerifier.Verify(pin ?? "", _opt.TechnicianPinHash))
        {
            _log.LogWarning("AUDIT technician unlock FAILED (wrong PIN or disabled).");
            return;
        }
        _log.LogWarning("AUDIT technician emergency unlock at {Time:o} on {Device}.", _clock.UtcNow, _opt.DeviceName);
        _state.StaffLock = false;
        _state.StaffUnlock = true;
        // A technician unlock resolves an Unknown session explicitly; the audit line above is shipped at sync.
        if (_state.Session is { State: SessionState.Unknown }) _state.Session = null;
        Persist();
    }

    private void EscalateLock()
    {
        // The overlay is not trusted: enforce through the OS. Disconnect = Windows logon screen.
        _log.LogError("Escalating lock through the OS (UI_UNAVAILABLE).");
        var ok = Native.DisconnectConsoleSession() || Native.LogoffConsoleSession();
        _actual = ok ? LockState.Locked : LockState.Error;
    }

    private void ExecutePower(PendingPower p)
    {
        // Fixed commands only; no user-supplied strings reach the shell.
        var flag = p.Kind == CommandType.RESTART ? "/r" : "/s";
        var psi = new ProcessStartInfo("shutdown.exe", $"{flag} /t {p.GraceSeconds} /c \"Arcadia: staff command\"")
        { CreateNoWindow = true, UseShellExecute = false };
        try { Process.Start(psi)?.Dispose(); _ui.Send(new ServiceToUi("Warn", WarnKind: "power", WarnSeconds: p.GraceSeconds)); }
        catch (Exception e) { _log.LogError(e, "Power command failed to start."); }
    }

    private static string StatusFor(AgentState s) => s.Session?.State switch
    {
        SessionState.Unknown => "Waiting for staff",
        SessionState.Ended => "Session ended",
        _ => s.StaffLock ? "Locked by staff" : "Available",
    };

    private long NextMsg() => Interlocked.Increment(ref _msgId);

    private CommandResult Result(Guid id, CommandStatus st, FailureReason why) =>
        new(id, st, why, _actual, _state.Session?.State ?? SessionState.Pending, _state.Session?.Revision ?? 0, _clock.BootId);

    private void Persist()
    {
        try { _store.Save(_state); }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            _log.LogError(e, "Could not persist agent state.");
        }
    }
}

/// <summary>
/// DEV ONLY transport: drop a command envelope JSON into <c>DevCommandDir</c>; the result is written beside it.
/// Disabled unless configured. Replaced by the Hall Server link (pairing + mTLS) in the next phase.
/// </summary>
public sealed class DevFileCommandSource(AgentOptions opt, AgentWorker worker, ILogger<DevFileCommandSource> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(opt.DevCommandDir)) return;
        Directory.CreateDirectory(opt.DevCommandDir);
        log.LogWarning("DEV command source ENABLED on {Dir}. Never enable in production.", opt.DevCommandDir);

        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(500));
        while (await timer.WaitForNextTickAsync(ct))
        {
            foreach (var file in Directory.EnumerateFiles(opt.DevCommandDir, "*.json")
                         .Where(f => !f.EndsWith(".result.json", StringComparison.OrdinalIgnoreCase)).ToArray())
            {
                try
                {
                    var cmd = JsonSerializer.Deserialize<CommandEnvelope>(File.ReadAllText(file), ContractJson.Options);
                    if (cmd is null) continue;
                    var res = worker.Handle(cmd);
                    File.WriteAllText(Path.ChangeExtension(file, ".result.json"), JsonSerializer.Serialize(res, ContractJson.Options));
                    File.Move(file, file + ".done", overwrite: true);
                }
                catch (Exception e) when (e is IOException or JsonException)
                {
                    log.LogError(e, "Bad dev command file {File}", file);
                    File.Move(file, file + ".bad", overwrite: true);
                }
            }
        }
    }
}
