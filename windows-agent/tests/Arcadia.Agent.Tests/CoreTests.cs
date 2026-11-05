using System.Text.Json;
using Arcadia.Agent.Core;
using Arcadia.Contracts;
using Xunit;

namespace Arcadia.Agent.Tests;

public sealed class FakeClock : IAgentClock
{
    public DateTimeOffset UtcNow { get; set; } = new(2026, 11, 5, 14, 0, 0, TimeSpan.Zero);
    public long MonotonicMs { get; set; } = 1_000;
    public Guid BootId { get; set; } = Guid.NewGuid();
    public void Advance(TimeSpan t) { UtcNow += t; MonotonicMs += (long)t.TotalMilliseconds; }
}

internal static class Make
{
    public static readonly Guid Tenant = Guid.NewGuid(), Agent = Guid.NewGuid(), Station = Guid.NewGuid();

    public static AgentState State() => new() { TenantId = Tenant, AgentId = Agent, StationId = Station };

    public static CommandEnvelope Cmd(CommandType type, object payload, long seq, FakeClock clock,
        Guid? id = null, TimeSpan? ttl = null, Guid? agent = null) =>
        new(id ?? Guid.NewGuid(), Guid.NewGuid(), "k", Tenant, null, Station, agent ?? Agent, seq,
            clock.UtcNow, clock.UtcNow + (ttl ?? TimeSpan.FromMinutes(2)), type, 1,
            JsonSerializer.SerializeToElement(payload, ContractJson.Options));

    public static SessionPayload Session(Guid sid, long rev, FakeClock c, int minutes = 60) =>
        new(sid, rev, c.UtcNow, c.UtcNow.AddMinutes(minutes), minutes * 60_000L);
}

// U-01 command validation, U-02 revision rules
public class CommandProcessorTests
{
    [Fact]
    public void Unknown_identity_is_rejected_as_unauthorized()
    {
        var c = new FakeClock(); var st = Make.State();
        var cmd = Make.Cmd(CommandType.LOCK, new LockPayload("staff", null, null), 1, c, agent: Guid.NewGuid());
        Assert.Equal(FailureReason.UNAUTHORIZED, CommandProcessor.Evaluate(cmd, st, c.UtcNow).Reason);
    }

    [Fact]
    public void Unsupported_payload_version_is_rejected()
    {
        var c = new FakeClock(); var st = Make.State();
        var cmd = Make.Cmd(CommandType.LOCK, new LockPayload("staff", null, null), 1, c) with { PayloadVersion = 2 };
        Assert.Equal(FailureReason.UNSUPPORTED_VERSION, CommandProcessor.Evaluate(cmd, st, c.UtcNow).Reason);
    }

    [Fact]
    public void Duplicate_command_returns_stored_result_and_is_not_reexecuted()
    {
        var c = new FakeClock(); var st = Make.State();
        var id = Guid.NewGuid();
        st.Remember(new CommandResult(id, CommandStatus.Executed, FailureReason.None, LockState.Locked, SessionState.Ended, 3, c.BootId));
        var cmd = Make.Cmd(CommandType.LOCK, new LockPayload("staff", null, null), 1, c, id);
        var d = CommandProcessor.Evaluate(cmd, st, c.UtcNow);
        Assert.Equal(DecisionKind.Duplicate, d.Kind);
        Assert.Equal(CommandStatus.Executed, d.Stored!.Status);
    }

    [Fact]
    public void Expired_command_is_rejected()
    {
        var c = new FakeClock(); var st = Make.State();
        var cmd = Make.Cmd(CommandType.LOCK, new LockPayload("staff", null, null), 1, c, ttl: TimeSpan.FromSeconds(30));
        Assert.Equal(FailureReason.EXPIRED, CommandProcessor.Evaluate(cmd, st, c.UtcNow.AddSeconds(31)).Reason);
    }

    [Fact]
    public void Out_of_order_unlock_is_rejected_but_lock_is_still_applied()
    {
        var c = new FakeClock(); var st = Make.State(); st.LastDeviceSeq = 10;
        var unlock = Make.Cmd(CommandType.UNLOCK, new LockPayload("staff", null, null), 5, c);
        var lck = Make.Cmd(CommandType.LOCK, new LockPayload("staff", null, null), 5, c);
        Assert.Equal(FailureReason.OUT_OF_ORDER, CommandProcessor.Evaluate(unlock, st, c.UtcNow).Reason);
        Assert.Equal(DecisionKind.Accept, CommandProcessor.Evaluate(lck, st, c.UtcNow).Kind);
    }

    [Fact]
    public void Stale_revision_is_rejected_and_old_end_time_is_never_applied()
    {
        var c = new FakeClock(); var st = Make.State(); var sid = Guid.NewGuid();
        var start = Make.Cmd(CommandType.START_SESSION, Make.Session(sid, 1, c, 30), 1, c);
        CommandProcessor.Apply(start, st, c);
        var extend = Make.Cmd(CommandType.EXTEND_SESSION, Make.Session(sid, 2, c, 90), 2, c);
        Assert.Equal(DecisionKind.Accept, CommandProcessor.Evaluate(extend, st, c.UtcNow).Kind);
        CommandProcessor.Apply(extend, st, c);

        // A delayed END from revision 1 (older end time) arrives after the extension.
        var staleEnd = Make.Cmd(CommandType.END_SESSION, Make.Session(sid, 1, c, 30), 3, c);
        Assert.Equal(FailureReason.STALE_REVISION, CommandProcessor.Evaluate(staleEnd, st, c.UtcNow).Reason);
        Assert.Equal(90 * 60_000L, st.Session!.DurationMs);
        Assert.Equal(SessionState.Active, st.Session.State);
    }

    [Fact]
    public void Equal_revision_with_a_different_command_is_stale()
    {
        var c = new FakeClock(); var st = Make.State(); var sid = Guid.NewGuid();
        CommandProcessor.Apply(Make.Cmd(CommandType.START_SESSION, Make.Session(sid, 4, c), 1, c), st, c);
        var again = Make.Cmd(CommandType.EXTEND_SESSION, Make.Session(sid, 4, c, 120), 2, c);
        Assert.Equal(FailureReason.STALE_REVISION, CommandProcessor.Evaluate(again, st, c.UtcNow).Reason);
    }

    [Fact]
    public void Revision_fuzz_final_end_time_always_matches_newest_revision()
    {
        var rng = new Random(42);
        for (var run = 0; run < 200; run++)
        {
            var c = new FakeClock(); var st = Make.State(); var sid = Guid.NewGuid();
            var cmds = new List<(long rev, CommandEnvelope cmd)>();
            long seq = 0;
            for (long rev = 1; rev <= 8; rev++)
            {
                var type = rev == 1 ? CommandType.START_SESSION : CommandType.EXTEND_SESSION;
                cmds.Add((rev, Make.Cmd(type, Make.Session(sid, rev, c, (int)(rev * 10)), ++seq + 1000, c)));
            }
            foreach (var (_, cmd) in cmds.OrderBy(_ => rng.Next()))
            {
                var d = CommandProcessor.Evaluate(cmd, st, c.UtcNow);
                // device_seq is intentionally ignored here: revision alone must protect the end time.
                if (d.Kind == DecisionKind.Accept || d.Reason == FailureReason.OUT_OF_ORDER)
                {
                    if (d.Kind == DecisionKind.Accept) CommandProcessor.Apply(cmd, st, c);
                }
            }
            // The applied state must never be older than the max revision it has accepted.
            Assert.Equal(st.MaxRevisionFor(sid), st.Session?.Revision ?? st.MaxRevisionFor(sid));
            if (st.Session is { } s) Assert.Equal(s.Revision * 10 * 60_000L, s.DurationMs);
        }
    }

    [Fact]
    public void Shutdown_records_pending_power_with_boot_id()
    {
        var c = new FakeClock(); var st = Make.State();
        var cmd = Make.Cmd(CommandType.SHUTDOWN, new PowerPayload(30, "staff"), 1, c);
        CommandProcessor.Apply(cmd, st, c);
        Assert.Equal(c.BootId, st.PendingPower!.BootId);
        Assert.Equal(cmd.CommandId, st.PendingPower.CommandId);
    }
}

// U-03 lock reconciler matrix
public class LockReconcilerTests
{
    private static AgentState ActiveState(FakeClock c)
    {
        var st = Make.State();
        CommandProcessor.Apply(Make.Cmd(CommandType.START_SESSION, Make.Session(Guid.NewGuid(), 1, c, 10), 1, c), st, c);
        return st;
    }

    [Fact]
    public void Active_with_time_left_is_unlocked()
    {
        var c = new FakeClock(); var st = ActiveState(c);
        var t = TimeEvaluator.Evaluate(st.Session!, c.UtcNow, c.MonotonicMs, c.BootId, null);
        Assert.Equal(LockState.Unlocked, LockReconciler.Desired(st, t));
    }

    [Fact]
    public void Time_running_out_locks()
    {
        var c = new FakeClock(); var st = ActiveState(c);
        c.Advance(TimeSpan.FromMinutes(10));
        var t = TimeEvaluator.Evaluate(st.Session!, c.UtcNow, c.MonotonicMs, c.BootId, null);
        Assert.Equal(0, t.RemainingMs);
        Assert.Equal(LockState.Locked, LockReconciler.Desired(st, t));
    }

    [Fact]
    public void Staff_lock_beats_an_active_session()
    {
        var c = new FakeClock(); var st = ActiveState(c);
        st.StaffLock = true;
        var t = TimeEvaluator.Evaluate(st.Session!, c.UtcNow, c.MonotonicMs, c.BootId, null);
        Assert.Equal(LockState.Locked, LockReconciler.Desired(st, t));
    }

    [Theory]
    [InlineData(SessionState.Pending)]
    [InlineData(SessionState.Ended)]
    [InlineData(SessionState.Unknown)]
    public void Non_active_sessions_are_always_locked(SessionState s)
    {
        var st = Make.State();
        st.Session = new SessionRecord { State = s, DurationMs = 60_000 };
        Assert.Equal(LockState.Locked, LockReconciler.Desired(st, null));
    }

    [Fact]
    public void Unknown_time_never_unlocks()
    {
        var c = new FakeClock(); var st = ActiveState(c);
        var t = new TimeEvaluation(0, 999_999, TimeReliability.Uncertain);
        Assert.Equal(LockState.Locked, LockReconciler.Desired(st, t));
    }

    [Theory]
    [InlineData(SessionState.Ended, LockState.Unlocked, true)]
    [InlineData(SessionState.Pending, LockState.Unlocked, true)]
    [InlineData(SessionState.Unknown, LockState.Unlocked, true)]
    [InlineData(SessionState.Active, LockState.Unlocked, false)]
    [InlineData(SessionState.Ended, LockState.Locked, false)]
    public void Violation_matrix(SessionState s, LockState l, bool violation) =>
        Assert.Equal(violation, LockReconciler.IsViolation(s, l));

    [Theory]
    [InlineData(LockState.Unlocked, LockState.Locked, LockAction.Lock)]
    [InlineData(LockState.Error, LockState.Locked, LockAction.Lock)]
    [InlineData(LockState.Unknown, LockState.Locked, LockAction.Lock)]
    [InlineData(LockState.Locked, LockState.Locked, LockAction.None)]
    [InlineData(LockState.Locking, LockState.Locked, LockAction.None)]
    [InlineData(LockState.Locked, LockState.Unlocked, LockAction.Unlock)]
    [InlineData(LockState.Unlocked, LockState.Unlocked, LockAction.None)]
    public void Next_action(LockState actual, LockState desired, LockAction expected) =>
        Assert.Equal(expected, LockReconciler.NextAction(actual, desired));
}

// U-04 time evaluation
public class TimeEvaluatorTests
{
    private static (SessionRecord s, FakeClock c) Started(int minutes = 60)
    {
        var c = new FakeClock(); var st = Make.State();
        CommandProcessor.Apply(Make.Cmd(CommandType.START_SESSION, Make.Session(Guid.NewGuid(), 1, c, minutes), 1, c), st, c);
        return (st.Session!, c);
    }

    [Fact]
    public void Same_boot_uses_the_monotonic_clock_even_if_the_wall_clock_is_changed()
    {
        var (s, c) = Started();
        c.MonotonicMs += 10 * 60_000;
        c.UtcNow = c.UtcNow.AddHours(5); // user moves the clock
        var t = TimeEvaluator.Evaluate(s, c.UtcNow, c.MonotonicMs, c.BootId, null);
        Assert.Equal(TimeReliability.Trusted, t.Reliability);
        Assert.Equal(10 * 60_000, t.ElapsedMs);
    }

    [Fact]
    public void Reboot_with_server_reachable_uses_server_time()
    {
        var (s, c) = Started();
        var later = c.UtcNow.AddMinutes(20);
        var t = TimeEvaluator.Evaluate(s, later, 5_000, Guid.NewGuid(), TimeSpan.Zero);
        Assert.Equal(TimeReliability.Trusted, t.Reliability);
        Assert.Equal(20 * 60_000, t.ElapsedMs);
    }

    [Fact]
    public void Reboot_with_server_offset_corrects_a_wrong_local_clock()
    {
        var (s, c) = Started();
        var localNow = c.UtcNow.AddMinutes(20).AddMinutes(30); // local clock 30 min fast
        var t = TimeEvaluator.Evaluate(s, localNow, 5_000, Guid.NewGuid(), TimeSpan.FromMinutes(-30));
        Assert.Equal(20 * 60_000, t.ElapsedMs);
    }

    [Fact]
    public void Reboot_without_server_and_no_clock_change_is_estimated()
    {
        var (s, c) = Started();
        var t = TimeEvaluator.Evaluate(s, c.UtcNow.AddMinutes(15), 5_000, Guid.NewGuid(), null);
        Assert.Equal(TimeReliability.Estimated, t.Reliability);
        Assert.Equal(15 * 60_000, t.ElapsedMs);
    }

    [Fact]
    public void Reboot_without_server_after_a_clock_change_is_uncertain_and_pessimistic()
    {
        var (s, c) = Started();
        s.ClockChangedSinceCheckpoint = true;
        var t = TimeEvaluator.Evaluate(s, c.UtcNow.AddMinutes(15), 5_000, Guid.NewGuid(), null);
        Assert.Equal(TimeReliability.Uncertain, t.Reliability);
        Assert.True(t.ElapsedMs >= 15 * 60_000);
    }

    [Fact]
    public void Wall_clock_going_backwards_across_reboot_is_uncertain()
    {
        var (s, c) = Started();
        var t = TimeEvaluator.Evaluate(s, c.UtcNow.AddMinutes(-30), 5_000, Guid.NewGuid(), null);
        Assert.Equal(TimeReliability.Uncertain, t.Reliability);
    }

    [Fact]
    public void Elapsed_is_capped_at_the_duration()
    {
        var (s, c) = Started(10);
        c.MonotonicMs += 3_600_000;
        var t = TimeEvaluator.Evaluate(s, c.UtcNow, c.MonotonicMs, c.BootId, null);
        Assert.Equal(0, t.RemainingMs);
    }

    [Theory]
    [InlineData(4_000, null)]
    [InlineData(7_000, 6_000)]   // wall moved 7 s while monotonic moved 1 s
    public void Clock_monitor_flags_jumps_over_5_seconds(long wallAdvanceMs, int? expectedJump)
    {
        var m = new ClockMonitor();
        var t0 = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
        Assert.Null(m.Observe(t0, 0));
        var jump = m.Observe(t0.AddMilliseconds(wallAdvanceMs), 1_000);
        if (expectedJump is null) Assert.Null(jump); else Assert.Equal((long)expectedJump, jump);
    }

    [Fact]
    public void Clock_monitor_flags_a_backwards_jump()
    {
        var m = new ClockMonitor();
        var t0 = new DateTimeOffset(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
        m.Observe(t0, 0);
        Assert.True(m.Observe(t0.AddHours(-1), 5_000) < 0);
    }
}

// U-06 state persistence
public class StateStoreTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "arcadia-test-" + Guid.NewGuid());
    private string File_ => Path.Combine(_dir, "state.json");
    public void Dispose() { try { Directory.Delete(_dir, true); } catch { } }

    [Fact]
    public void Round_trip_preserves_revision_and_session()
    {
        var c = new FakeClock(); var st = Make.State(); var sid = Guid.NewGuid();
        CommandProcessor.Apply(Make.Cmd(CommandType.START_SESSION, Make.Session(sid, 7, c), 9, c), st, c);
        new StateStore(File_).Save(st);
        var (loaded, usedBak, corrupt) = new StateStore(File_).Load();
        Assert.False(usedBak); Assert.False(corrupt);
        Assert.Equal(7, loaded!.MaxRevisionFor(sid));
        Assert.Equal(9, loaded.LastDeviceSeq);
        Assert.Equal(SessionState.Active, loaded.Session!.State);
    }

    [Fact]
    public void Corrupt_main_falls_back_to_backup()
    {
        var store = new StateStore(File_);
        var st = Make.State(); st.LastDeviceSeq = 1; store.Save(st);
        st.LastDeviceSeq = 2; store.Save(st); // creates .bak with seq 1
        File.WriteAllText(File_, "garbage");
        var (loaded, usedBak, _) = store.Load();
        Assert.True(usedBak);
        Assert.Equal(1, loaded!.LastDeviceSeq);
    }

    [Fact]
    public void Tampered_body_fails_checksum()
    {
        var store = new StateStore(File_);
        store.Save(Make.State());
        var text = File.ReadAllText(File_).Replace("\"lastDeviceSeq\":0", "\"lastDeviceSeq\":99");
        File.WriteAllText(File_, text);
        var (loaded, _, corrupt) = store.Load();
        Assert.Null(loaded); Assert.True(corrupt);
    }

    [Fact]
    public void Missing_files_are_not_reported_as_corrupt()
    {
        var (loaded, _, corrupt) = new StateStore(File_).Load();
        Assert.Null(loaded); Assert.False(corrupt);
    }

    [Fact]
    public void Seen_commands_are_bounded()
    {
        var st = Make.State(); var c = new FakeClock();
        for (var i = 0; i < AgentState.MaxSeen + 50; i++)
            st.Remember(new CommandResult(Guid.NewGuid(), CommandStatus.Executed, FailureReason.None, LockState.Locked, SessionState.Ended, 0, c.BootId));
        Assert.Equal(AgentState.MaxSeen, st.SeenCommands.Count);
    }
}

public class PinTests
{
    [Fact]
    public void Correct_pin_verifies_and_wrong_pin_does_not()
    {
        var h = PinVerifier.Hash("4821");
        Assert.True(PinVerifier.Verify("4821", h));
        Assert.False(PinVerifier.Verify("4822", h));
        Assert.DoesNotContain("4821", h);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("garbage")]
    [InlineData("pbkdf2$1$AAAA$AAAA")]
    public void Malformed_stored_hash_never_verifies(string? stored) => Assert.False(PinVerifier.Verify("1234", stored));

    [Fact]
    public void Limiter_allows_five_per_minute_then_recovers()
    {
        var l = new AttemptLimiter(); var t = DateTimeOffset.UnixEpoch;
        for (var i = 0; i < 5; i++) Assert.True(l.TryAcquire(t));
        Assert.False(l.TryAcquire(t.AddSeconds(30)));
        Assert.True(l.TryAcquire(t.AddSeconds(61)));
    }
}
