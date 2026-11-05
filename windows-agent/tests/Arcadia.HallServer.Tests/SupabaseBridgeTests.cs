using System.Net;
using System.Text;
using System.Text.Json;
using Arcadia.Contracts;
using Arcadia.HallServer;
using Xunit;

namespace Arcadia.HallServer.Tests;

internal sealed class FakeHandler(Func<HttpRequestMessage, string, HttpResponseMessage> respond) : HttpMessageHandler
{
    public List<(HttpRequestMessage Req, string Body)> Calls { get; } = [];

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(ct);
        Calls.Add((request, body));
        return respond(request, body);
    }
}

public class SupabaseBridgeTests
{
    private const string Url = "https://abc.supabase.co/functions/v1/agent-bridge";
    private static readonly CloudSettings Settings = new(Url, "secret-token");

    private static HttpResponseMessage Json(object o, HttpStatusCode code = HttpStatusCode.OK) =>
        new(code) { Content = new StringContent(JsonSerializer.Serialize(o), Encoding.UTF8, "application/json") };

    private static (SupabaseCloudBridge bridge, FakeHandler handler) Make(Func<HttpRequestMessage, string, HttpResponseMessage> r)
    {
        var h = new FakeHandler(r);
        return (new SupabaseCloudBridge(new HttpClient(h), Settings), h);
    }

    [Fact]
    public async Task Every_call_carries_the_bearer_token_and_nothing_else_secret()
    {
        var (b, h) = Make((_, _) => Json(new { commands = Array.Empty<object>(), cursor = 0 }));
        await b.PullCommandsAsync("", CancellationToken.None);
        var req = h.Calls[0].Req;
        Assert.Equal("Bearer", req.Headers.Authorization!.Scheme);
        Assert.Equal("secret-token", req.Headers.Authorization.Parameter);
        Assert.Equal(Url + "/pull", req.RequestUri!.ToString());
        Assert.DoesNotContain("secret-token", h.Calls[0].Body); // never in the body
    }

    [Fact]
    public async Task Pull_maps_wire_commands_and_the_cursor()
    {
        var id = Guid.NewGuid(); var hall = Guid.NewGuid(); var st = Guid.NewGuid(); var sid = Guid.NewGuid();
        var (b, h) = Make((_, _) => Json(new
        {
            commands = new[]
            {
                new { commandId = id, hallId = hall, stationId = st, type = "EXTEND_SESSION",
                      payload = new { sessionId = sid, sessionRevision = 0, durationMs = 3_600_000 }, idempotencyKey = id.ToString() },
            },
            cursor = 42,
        }));
        var r = await b.PullCommandsAsync("7", CancellationToken.None);

        Assert.Equal("42", r.Cursor);
        var c = Assert.Single(r.Commands);
        Assert.Equal(CommandType.EXTEND_SESSION, c.Type);
        Assert.Equal(hall, c.TenantId);
        Assert.Equal(st, c.StationId);
        Assert.Equal(id.ToString(), c.IdempotencyKey);
        Assert.Equal(3_600_000, c.Payload.GetProperty("durationMs").GetInt64());
        Assert.Contains("\"cursor\":7", h.Calls[0].Body);
    }

    [Fact]
    public async Task Pull_output_is_exactly_what_the_hall_server_ingest_expects()
    {
        // The SQL wire format (camelCase, enum strings, ISO timestamps with offset) must round-trip into SessionPayload.
        var sid = Guid.NewGuid();
        var (b, _) = Make((_, _) => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent($$$"""
            {"commands":[{"commandId":"{{{Guid.NewGuid()}}}","hallId":"{{{Guid.NewGuid()}}}","stationId":"{{{Guid.NewGuid()}}}",
              "type":"START_SESSION","idempotencyKey":"k",
              "payload":{"sessionId":"{{{sid}}}","sessionRevision":0,"startAtUtc":"2026-11-05T14:00:00+00:00",
                         "endAtUtc":"2026-11-05T15:00:00+00:00","durationMs":3600000,"warnAtMs":[300000,60000]}}],"cursor":1}
            """, Encoding.UTF8, "application/json"),
        });
        var cmd = (await b.PullCommandsAsync("", CancellationToken.None)).Commands[0];
        var p = cmd.Payload.Deserialize<SessionPayload>(ContractJson.Options)!;
        Assert.Equal(sid, p.SessionId);
        Assert.Equal(0, p.SessionRevision);
        Assert.Equal(3_600_000, p.DurationMs);
        Assert.Equal(new DateTimeOffset(2026, 11, 5, 15, 0, 0, TimeSpan.Zero), p.EndAtUtc);
        Assert.Equal(new long[] { 300_000L, 60_000L }, p.WarnAtMs!);
    }

    [Fact]
    public async Task An_open_session_payload_with_null_end_deserializes()
    {
        var (b, _) = Make((_, _) => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent($$$"""
            {"commands":[{"commandId":"{{{Guid.NewGuid()}}}","hallId":"{{{Guid.NewGuid()}}}","stationId":"{{{Guid.NewGuid()}}}",
              "type":"EXTEND_SESSION","idempotencyKey":"k",
              "payload":{"sessionId":"{{{Guid.NewGuid()}}}","sessionRevision":0,"startAtUtc":"2026-11-05T14:00:00+00:00",
                         "endAtUtc":null,"durationMs":0}}],"cursor":2}
            """, Encoding.UTF8, "application/json"),
        });
        var p = (await b.PullCommandsAsync("", CancellationToken.None)).Commands[0].Payload.Deserialize<SessionPayload>(ContractJson.Options)!;
        Assert.Null(p.EndAtUtc);
        Assert.Equal(0, p.DurationMs);
    }

    [Fact]
    public async Task Report_sends_the_status_name_and_the_result()
    {
        var id = Guid.NewGuid();
        var (b, h) = Make((_, _) => Json(new { changed = true }));
        var res = new CommandResult(id, CommandStatus.Rejected, FailureReason.STALE_REVISION, LockState.Locked, SessionState.Active, 5, Guid.NewGuid());
        await b.ReportAsync(id, CommandStatus.Rejected, res, CancellationToken.None);

        using var doc = JsonDocument.Parse(h.Calls[0].Body);
        Assert.Equal(id, doc.RootElement.GetProperty("commandId").GetGuid());
        Assert.Equal("Rejected", doc.RootElement.GetProperty("status").GetString());
        Assert.Equal("STALE_REVISION", doc.RootElement.GetProperty("error").GetString());
        Assert.Equal("STALE_REVISION", doc.RootElement.GetProperty("result").GetProperty("failureReason").GetString());
        Assert.Equal(Url + "/report", h.Calls[0].Req.RequestUri!.ToString());
    }

    [Fact]
    public async Task Heartbeat_items_use_the_names_the_sql_function_reads()
    {
        var (b, h) = Make((_, _) => Json(new { updated = 1 }));
        var st = Guid.NewGuid();
        await b.HeartbeatBatchAsync([new AgentHeartbeat(Guid.NewGuid(), st, DateTimeOffset.UtcNow, LockState.Locked,
            SessionState.Unknown, null, 0, TimeReliability.Uncertain, "0.1")], CancellationToken.None);

        using var doc = JsonDocument.Parse(h.Calls[0].Body);
        var item = doc.RootElement.GetProperty("items")[0];
        Assert.Equal(st, item.GetProperty("stationId").GetGuid());
        Assert.Equal("Unknown", item.GetProperty("session").GetString());
        Assert.Equal("Uncertain", item.GetProperty("reliability").GetString());
        Assert.Equal("0.1", item.GetProperty("version").GetString());
    }

    [Theory]
    [InlineData(HttpStatusCode.NotFound)]
    [InlineData(HttpStatusCode.Forbidden)]
    [InlineData(HttpStatusCode.Conflict)]
    public async Task A_refused_agent_code_is_null_not_an_exception(HttpStatusCode code)
    {
        var (b, _) = Make((_, _) => Json(new { error = "x" }, code));
        Assert.Null(await b.RedeemPairingCodeAsync("ABCD", Guid.NewGuid(), CancellationToken.None));
    }

    [Fact]
    public async Task A_valid_agent_code_returns_the_tenant()
    {
        var hall = Guid.NewGuid(); var st = Guid.NewGuid();
        var (b, h) = Make((_, _) => Json(new { tenantId = hall }));
        Assert.Equal(hall, await b.RedeemPairingCodeAsync("ABCD-EFGH-IJKL", st, CancellationToken.None));
        using var doc = JsonDocument.Parse(h.Calls[0].Body);
        Assert.Equal(st, doc.RootElement.GetProperty("stationId").GetGuid());
    }

    [Fact]
    public async Task A_rejected_credential_is_a_distinct_error_and_server_errors_throw()
    {
        var (b401, _) = Make((_, _) => Json(new { error = "unauthorized" }, HttpStatusCode.Unauthorized));
        await Assert.ThrowsAsync<CloudUnauthorizedException>(() => b401.PullCommandsAsync("", CancellationToken.None));
        var (b500, _) = Make((_, _) => Json(new { error = "internal" }, HttpStatusCode.InternalServerError));
        await Assert.ThrowsAsync<HttpRequestException>(() => b500.PullCommandsAsync("", CancellationToken.None));
    }

    [Fact]
    public async Task Pairing_the_server_stores_the_token_protected_and_never_in_plaintext()
    {
        var dir = Path.Combine(Path.GetTempPath(), "arcadia-cloud-" + Guid.NewGuid());
        try
        {
            var hall = Guid.NewGuid();
            var handler = new FakeHandler((_, _) => Json(new { token = "tok-AAAA-BBBB", hallId = hall }));
            var store = new CloudSettingsStore(dir, new DpapiSecretProtector());
            var got = await HallServerPairing.PairAsync(new HttpClient(handler), Url, "CODE", "Cashier", store);

            Assert.Equal(hall, got);
            Assert.Equal(Url + "/pair-server", handler.Calls[0].Req.RequestUri!.ToString());
            Assert.Null(handler.Calls[0].Req.Headers.Authorization); // no token yet: the one-time code is the credential
            var raw = File.ReadAllText(Path.Combine(dir, "cloud.dat"), Encoding.Latin1);
            Assert.DoesNotContain("tok-AAAA-BBBB", raw);
            Assert.Equal("tok-AAAA-BBBB", store.Load()!.Token);
        }
        finally { try { Directory.Delete(dir, true); } catch { } }
    }

    [Fact]
    public async Task Pairing_with_a_bad_code_fails_clearly_and_stores_nothing()
    {
        var dir = Path.Combine(Path.GetTempPath(), "arcadia-cloud-" + Guid.NewGuid());
        var store = new CloudSettingsStore(dir, new DpapiSecretProtector());
        var handler = new FakeHandler((_, _) => Json(new { error = "not_found" }, HttpStatusCode.NotFound));
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            HallServerPairing.PairAsync(new HttpClient(handler), Url, "BAD", "x", store));
        Assert.Null(store.Load());
    }
}
