using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using Arcadia.Agent.Core;
using Arcadia.Agent.Link;
using Arcadia.Contracts;
using Arcadia.HallServer;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Arcadia.HallServer.Tests;

internal sealed class PlainProtector : ISecretProtector
{
    public byte[] Protect(byte[] data) => data;
    public byte[] Unprotect(byte[] data) => data;
}

internal sealed class MemoryCreds : ICredentialStore
{
    private LinkCredentials? _c;
    public LinkCredentials? Load() => _c;
    public void Save(LinkCredentials credentials) => _c = credentials;
}

internal sealed class TestClock : IAgentClock
{
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
    public long MonotonicMs => Environment.TickCount64;
    public Guid BootId { get; } = Guid.NewGuid();
}

/// <summary>The real agent core logic behind the link, so these tests exercise revision/duplicate rules end to end.</summary>
internal sealed class TestSink(MemoryCreds creds) : ICommandSink
{
    private readonly TestClock _clock = new();
    private readonly object _gate = new();
    public AgentState State { get; } = new();
    public int Applied;
    public TimeSpan? Offset;

    public long LastDeviceSeq { get { lock (_gate) return State.LastDeviceSeq; } }
    public void SetServerOffset(TimeSpan? offset) => Offset = offset;

    public CommandResult Handle(CommandEnvelope cmd)
    {
        lock (_gate)
        {
            if (State.AgentId == Guid.Empty && creds.Load() is { } c)
            { State.AgentId = c.AgentId; State.TenantId = c.TenantId; State.StationId = c.StationId; }

            var d = CommandProcessor.Evaluate(cmd, State, DateTimeOffset.UtcNow);
            if (d.Kind == DecisionKind.Duplicate) return d.Stored!;
            if (d.Kind == DecisionKind.Reject)
            {
                var rej = new CommandResult(cmd.CommandId, CommandStatus.Rejected, d.Reason, LockState.Locked, SessionState.Pending, 0, _clock.BootId);
                State.Remember(rej);
                return rej;
            }
            CommandProcessor.Apply(cmd, State, _clock);
            Interlocked.Increment(ref Applied);
            var res = new CommandResult(cmd.CommandId, CommandStatus.Executed, FailureReason.None, LockState.Locked,
                State.Session?.State ?? SessionState.Pending, State.Session?.Revision ?? 0, _clock.BootId);
            State.Remember(res);
            return res;
        }
    }

    public LinkMessage Heartbeat(string type)
    {
        lock (_gate)
            return new LinkMessage(type, BootId: _clock.BootId, Utc: DateTimeOffset.UtcNow, Lock: LockState.Locked,
                Session: State.Session?.State, SessionId: State.Session?.SessionId, Revision: State.Session?.Revision ?? 0,
                Reliability: TimeReliability.Trusted);
    }
}

internal sealed class TestHall : IAsyncDisposable
{
    public string Dir = Path.Combine(Path.GetTempPath(), "arcadia-hs-" + Guid.NewGuid());
    public int Port;
    public string Url => $"https://127.0.0.1:{Port}";
    public DevCloudBridge Cloud = new();
    public WebApplication App = null!;
    public HallDb Db => App.Services.GetRequiredService<HallDb>();
    public LocalCa Ca => App.Services.GetRequiredService<LocalCa>();
    public Guid Tenant = Guid.NewGuid();

    public static async Task<TestHall> StartAsync(string? dir = null, DevCloudBridge? cloud = null)
    {
        var h = new TestHall();
        if (dir is not null) h.Dir = dir;
        if (cloud is not null) h.Cloud = cloud;
        h.Port = FreePort();
        await h.StartInternal();
        return h;
    }

    public async Task StartInternal()
    {
        App = HallServerHost.Build(new HallServerOptions
        {
            DataDir = Dir, BindAddress = "127.0.0.1", Port = Port,
            DnsNames = ["localhost"], IpAddresses = ["127.0.0.1"],
            PullInterval = TimeSpan.FromMilliseconds(100),
        }, Cloud, new PlainProtector(), logging: b => b.ClearProviders());
        await App.StartAsync();
    }

    public async Task StopAsync() { await App.StopAsync(); await App.DisposeAsync(); }

    public async ValueTask DisposeAsync()
    {
        try { await StopAsync(); } catch { }
        try { Directory.Delete(Dir, true); } catch { }
    }

    private static int FreePort()
    {
        var l = new TcpListener(IPAddress.Loopback, 0);
        l.Start();
        var p = ((IPEndPoint)l.LocalEndpoint).Port;
        l.Stop();
        return p;
    }

    public async Task<(LinkCredentials creds, MemoryCreds store)> PairAsync(Guid? station = null)
    {
        var store = new MemoryCreds();
        var code = Cloud.IssuePairingCode(Tenant);
        var creds = await HallPairing.PairAsync(Url, Ca.Fingerprint, code, station ?? Guid.NewGuid(), "test-machine", store);
        return (creds, store);
    }

    public static async Task<bool> WaitFor(Func<bool> cond, int ms = 8000)
    {
        var until = DateTime.UtcNow.AddMilliseconds(ms);
        while (DateTime.UtcNow < until)
        {
            if (cond()) return true;
            await Task.Delay(50);
        }
        return cond();
    }

    public static CloudCommand Cmd(Guid tenant, Guid station, CommandType type, object payload, string? key = null) =>
        new(Guid.NewGuid(), tenant, station, type, JsonSerializer.SerializeToElement(payload, ContractJson.Options), key ?? Guid.NewGuid().ToString());

    public static SessionPayload Session(Guid sid, int minutes) =>
        new(sid, 0, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddMinutes(minutes), minutes * 60_000L);
}

public class PairingTests
{
    [Fact]
    public async Task Pairing_with_the_right_fingerprint_issues_a_certificate_and_registers_the_agent()
    {
        await using var hall = await TestHall.StartAsync();
        var (creds, _) = await hall.PairAsync();
        Assert.NotEqual(Guid.Empty, creds.AgentId);
        Assert.Equal(hall.Tenant, creds.TenantId);
        using var cert = X509CertificateLoader.LoadPkcs12(creds.ClientPfx, creds.PfxPassword);
        Assert.True(hall.Ca.ChainsToCa(cert));
        Assert.NotNull(hall.Db.FindAgentByThumbprint(cert.Thumbprint));
    }

    [Fact]
    public async Task Wrong_ca_fingerprint_refuses_to_pair_and_does_not_burn_the_code()
    {
        await using var hall = await TestHall.StartAsync();
        var code = hall.Cloud.IssuePairingCode(hall.Tenant);
        var station = Guid.NewGuid();
        await Assert.ThrowsAsync<PairingException>(() =>
            HallPairing.PairAsync(hall.Url, new string('A', 64), code, station, "m", new MemoryCreds()));
        // The code was never sent, so it still works with the right fingerprint.
        var creds = await HallPairing.PairAsync(hall.Url, hall.Ca.Fingerprint, code, station, "m", new MemoryCreds());
        Assert.Equal(station, creds.StationId);
    }

    [Fact]
    public async Task A_pairing_code_is_one_time()
    {
        await using var hall = await TestHall.StartAsync();
        var code = hall.Cloud.IssuePairingCode(hall.Tenant);
        await HallPairing.PairAsync(hall.Url, hall.Ca.Fingerprint, code, Guid.NewGuid(), "m", new MemoryCreds());
        await Assert.ThrowsAsync<PairingException>(() =>
            HallPairing.PairAsync(hall.Url, hall.Ca.Fingerprint, code, Guid.NewGuid(), "m", new MemoryCreds()));
    }

    [Fact]
    public async Task Wrong_or_expired_code_is_refused()
    {
        await using var hall = await TestHall.StartAsync();
        await Assert.ThrowsAsync<PairingException>(() =>
            HallPairing.PairAsync(hall.Url, hall.Ca.Fingerprint, "000000", Guid.NewGuid(), "m", new MemoryCreds()));
        var expired = hall.Cloud.IssuePairingCode(hall.Tenant, TimeSpan.FromMilliseconds(-1));
        await Assert.ThrowsAsync<PairingException>(() =>
            HallPairing.PairAsync(hall.Url, hall.Ca.Fingerprint, expired, Guid.NewGuid(), "m", new MemoryCreds()));
    }

    [Fact]
    public async Task The_ca_survives_a_server_restart_so_agents_stay_paired()
    {
        var dir = Path.Combine(Path.GetTempPath(), "arcadia-hs-" + Guid.NewGuid());
        await using var hall = await TestHall.StartAsync(dir);
        var fp = hall.Ca.Fingerprint;
        await hall.StopAsync();
        await hall.StartInternal();
        Assert.Equal(fp, hall.Ca.Fingerprint);
    }
}

public class ConnectionSecurityTests
{
    [Fact]
    public async Task Websocket_without_a_client_certificate_is_refused()
    {
        await using var hall = await TestHall.StartAsync();
        using var ws = new ClientWebSocket();
        ws.Options.RemoteCertificateValidationCallback = (_, _, _, _) => true;
        var ex = await Assert.ThrowsAsync<WebSocketException>(() =>
            ws.ConnectAsync(new Uri($"wss://127.0.0.1:{hall.Port}/ws"), CancellationToken.None));
        Assert.Contains("401", ex.Message);
    }

    [Fact]
    public async Task Certificate_from_another_ca_is_rejected()
    {
        await using var hall = await TestHall.StartAsync();
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var req = new CertificateRequest("CN=evil", key, HashAlgorithmName.SHA256);
        using var self = req.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddDays(1));
        using var evil = X509CertificateLoader.LoadPkcs12(self.Export(X509ContentType.Pfx, "x"), "x");

        using var ws = new ClientWebSocket();
        ws.Options.ClientCertificates = [evil];
        ws.Options.RemoteCertificateValidationCallback = (_, _, _, _) => true;
        await Assert.ThrowsAnyAsync<Exception>(() =>
            ws.ConnectAsync(new Uri($"wss://127.0.0.1:{hall.Port}/ws"), CancellationToken.None));
    }

    [Fact]
    public async Task A_revoked_agent_cannot_connect()
    {
        await using var hall = await TestHall.StartAsync();
        var (creds, store) = await hall.PairAsync();
        hall.Db.RevokeAgent(creds.AgentId);

        using var ca = X509Certificate2.CreateFromPem(creds.CaPem);
        using var client = X509CertificateLoader.LoadPkcs12(creds.ClientPfx, creds.PfxPassword);
        using var ws = new ClientWebSocket();
        ws.Options.ClientCertificates = [client];
        ws.Options.RemoteCertificateValidationCallback = (_, _, _, _) => true;
        var ex = await Assert.ThrowsAsync<WebSocketException>(() =>
            ws.ConnectAsync(new Uri($"wss://127.0.0.1:{hall.Port}/ws"), CancellationToken.None));
        Assert.Contains("403", ex.Message);
        _ = store;
    }

    [Fact]
    public async Task The_agent_refuses_a_server_that_is_not_signed_by_the_pinned_ca()
    {
        await using var real = await TestHall.StartAsync();
        await using var impostor = await TestHall.StartAsync();
        var (creds, store) = await real.PairAsync();
        // Same credentials, but pointed at a different server with a different CA (a spoofed mDNS hit).
        store.Save(creds with { ServerUrl = impostor.Url });

        var sink = new TestSink(store);
        var link = new HallLinkClient(store, sink, NullLogger<HallLinkClient>.Instance);
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        await link.RunAsync(cts.Token); // keeps retrying and failing; must never connect
        Assert.Null(sink.Offset);
        Assert.Equal(0, sink.Applied);
    }
}

public class DeliveryTests
{
    private static async Task<(Task run, CancellationTokenSource cts, TestSink sink)> Connect(LinkCredentials creds, MemoryCreds store)
    {
        var sink = new TestSink(store);
        var link = new HallLinkClient(store, sink, NullLogger<HallLinkClient>.Instance) { HeartbeatEvery = TimeSpan.FromMilliseconds(200) };
        var cts = new CancellationTokenSource();
        var run = Task.Run(() => link.RunAsync(cts.Token));
        await Task.CompletedTask;
        return (run, cts, sink);
    }

    [Fact]
    public async Task A_cloud_command_reaches_the_agent_and_the_result_returns_to_the_cloud()
    {
        await using var hall = await TestHall.StartAsync();
        var (creds, store) = await hall.PairAsync();
        var (run, cts, sink) = await Connect(creds, store);

        var lockCmd = TestHall.Cmd(hall.Tenant, creds.StationId, CommandType.LOCK, new LockPayload("staff", null, null));
        hall.Cloud.Enqueue(lockCmd);

        Assert.True(await TestHall.WaitFor(() => sink.Applied == 1));
        Assert.True(await TestHall.WaitFor(() => hall.Cloud.Reports.Any(r => r.CommandId == lockCmd.CommandId && r.Status == CommandStatus.Executed)));
        Assert.Contains(hall.Cloud.Reports, r => r.CommandId == lockCmd.CommandId && r.Status == CommandStatus.Sent);
        cts.Cancel(); await run;
    }

    [Fact]
    public async Task Commands_queued_while_the_agent_is_offline_are_delivered_once_on_reconnect()
    {
        await using var hall = await TestHall.StartAsync();
        var (creds, store) = await hall.PairAsync();

        var sid = Guid.NewGuid();
        hall.Cloud.Enqueue(TestHall.Cmd(hall.Tenant, creds.StationId, CommandType.START_SESSION, TestHall.Session(sid, 60)));
        await TestHall.WaitFor(() => hall.Db.Pending(creds.StationId).Count == 1);
        Assert.Single(hall.Db.Pending(creds.StationId)); // durable while nobody is connected

        var (run, cts, sink) = await Connect(creds, store);
        Assert.True(await TestHall.WaitFor(() => sink.Applied == 1));
        await Task.Delay(500);
        Assert.Equal(1, sink.Applied);
        cts.Cancel(); await run;
    }

    [Fact]
    public async Task Reconnecting_never_executes_an_already_applied_command_twice()
    {
        await using var hall = await TestHall.StartAsync();
        var (creds, store) = await hall.PairAsync();
        var sink = new TestSink(store); // the SAME agent state survives the reconnect
        var cmd = TestHall.Cmd(hall.Tenant, creds.StationId, CommandType.SHUTDOWN, new PowerPayload(30, "staff"));
        hall.Cloud.Enqueue(cmd);

        for (var round = 0; round < 3; round++)
        {
            var link = new HallLinkClient(store, sink, NullLogger<HallLinkClient>.Instance);
            using var cts = new CancellationTokenSource();
            var run = Task.Run(() => link.RunAsync(cts.Token));
            await TestHall.WaitFor(() => sink.Applied >= 1);
            await Task.Delay(400);
            cts.Cancel(); await run;
        }
        Assert.Equal(1, sink.Applied);
    }

    [Fact]
    public async Task The_server_issues_increasing_revisions_and_the_agent_ends_on_the_newest()
    {
        await using var hall = await TestHall.StartAsync();
        var (creds, store) = await hall.PairAsync();
        var (run, cts, sink) = await Connect(creds, store);
        var sid = Guid.NewGuid();

        hall.Cloud.Enqueue(TestHall.Cmd(hall.Tenant, creds.StationId, CommandType.START_SESSION, TestHall.Session(sid, 30)));
        hall.Cloud.Enqueue(TestHall.Cmd(hall.Tenant, creds.StationId, CommandType.EXTEND_SESSION, TestHall.Session(sid, 90)));

        Assert.True(await TestHall.WaitFor(() => sink.Applied == 2));
        Assert.Equal(2, sink.State.Session!.Revision);
        Assert.Equal(90 * 60_000L, sink.State.Session.DurationMs);
        Assert.Equal(2, hall.Db.CurrentRevision(sid));
        cts.Cancel(); await run;
    }

    [Fact]
    public async Task Heartbeat_reply_gives_the_agent_a_server_time_offset()
    {
        await using var hall = await TestHall.StartAsync();
        var (creds, store) = await hall.PairAsync();
        var (run, cts, sink) = await Connect(creds, store);
        Assert.True(await TestHall.WaitFor(() => sink.Offset is not null));
        Assert.True(Math.Abs(sink.Offset!.Value.TotalSeconds) < 2);
        cts.Cancel(); await run;
    }

    [Fact]
    public async Task A_command_for_a_station_with_no_agent_is_rejected_to_the_cloud_and_never_queued()
    {
        await using var hall = await TestHall.StartAsync();
        var station = Guid.NewGuid();
        hall.Cloud.Enqueue(TestHall.Cmd(hall.Tenant, station, CommandType.LOCK, new LockPayload("staff", null, null)));
        Assert.True(await TestHall.WaitFor(() => hall.Cloud.Reports.Any(r => r.Status == CommandStatus.Rejected)));
        Assert.Empty(hall.Db.Pending(station));
    }

    [Fact]
    public async Task The_same_idempotency_key_creates_one_command_and_burns_one_revision()
    {
        await using var hall = await TestHall.StartAsync();
        var (creds, _) = await hall.PairAsync();
        var sid = Guid.NewGuid();
        var key = "dup-key";
        hall.Cloud.Enqueue(TestHall.Cmd(hall.Tenant, creds.StationId, CommandType.START_SESSION, TestHall.Session(sid, 30), key));
        hall.Cloud.Enqueue(TestHall.Cmd(hall.Tenant, creds.StationId, CommandType.START_SESSION, TestHall.Session(sid, 30), key));
        await TestHall.WaitFor(() => hall.Db.Pending(creds.StationId).Count >= 1);
        await Task.Delay(500);
        Assert.Single(hall.Db.Pending(creds.StationId));
        Assert.Equal(1, hall.Db.CurrentRevision(sid));
    }

    [Fact]
    public async Task Expired_commands_are_swept_and_never_delivered_late()
    {
        await using var hall = await TestHall.StartAsync();
        var (creds, store) = await hall.PairAsync();
        var id = Guid.NewGuid();
        hall.Db.Enqueue(id, hall.Tenant, creds.StationId, creds.AgentId, CommandType.LOCK, new LockPayload("staff", null, null),
            "k-exp", TimeSpan.FromMilliseconds(1), DateTimeOffset.UtcNow);
        await Task.Delay(50);
        Assert.True(await TestHall.WaitFor(() => hall.Db.GetStatus(id) == CommandStatus.Expired));

        var (run, cts, sink) = await Connect(creds, store);
        await Task.Delay(800);
        Assert.Equal(0, sink.Applied);
        cts.Cancel(); await run;
    }

    [Fact]
    public async Task Transitions_never_leave_a_terminal_state()
    {
        await using var hall = await TestHall.StartAsync();
        var (creds, _) = await hall.PairAsync();
        var id = Guid.NewGuid();
        hall.Db.Enqueue(id, hall.Tenant, creds.StationId, creds.AgentId, CommandType.LOCK, new LockPayload("staff", null, null),
            "k-t", TimeSpan.FromMinutes(1), DateTimeOffset.UtcNow);
        Assert.True(hall.Db.Transition(id, CommandStatus.Sent));
        Assert.True(hall.Db.Transition(id, CommandStatus.Executed));
        Assert.False(hall.Db.Transition(id, CommandStatus.Failed));   // terminal stays terminal
        Assert.False(hall.Db.Transition(id, CommandStatus.Executed)); // duplicate report is a no-op
        Assert.Equal(CommandStatus.Executed, hall.Db.GetStatus(id));
    }

    [Fact]
    public async Task Agent_reported_revision_raises_the_server_floor_after_a_restore()
    {
        await using var hall = await TestHall.StartAsync();
        var (creds, store) = await hall.PairAsync();
        var sink = new TestSink(store);
        var sid = Guid.NewGuid();
        // The agent already ran revision 7 (e.g. the server was restored from an old backup).
        sink.State.Session = new SessionRecord { SessionId = sid, Revision = 7, State = SessionState.Active, DurationMs = 60_000 };

        var link = new HallLinkClient(store, sink, NullLogger<HallLinkClient>.Instance);
        using var cts = new CancellationTokenSource();
        var run = Task.Run(() => link.RunAsync(cts.Token));
        Assert.True(await TestHall.WaitFor(() => hall.Db.CurrentRevision(sid) == 7));

        hall.Cloud.Enqueue(TestHall.Cmd(hall.Tenant, creds.StationId, CommandType.EXTEND_SESSION, TestHall.Session(sid, 90)));
        Assert.True(await TestHall.WaitFor(() => hall.Db.CurrentRevision(sid) == 8));
        cts.Cancel(); await run;
    }
}
