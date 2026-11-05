using System.Collections.Concurrent;
using System.Net;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using Arcadia.Contracts;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Arcadia.HallServer;

public sealed class HallServerOptions
{
    public string DataDir { get; set; } =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Arcadia", "HallServer");
    public string BindAddress { get; set; } = "0.0.0.0";
    public int Port { get; set; } = 7421;
    /// <summary>Names/IPs agents will use to reach this server. They must be in the server certificate SAN.</summary>
    public string[] DnsNames { get; set; } = [Environment.MachineName, "localhost"];
    public string[] IpAddresses { get; set; } = ["127.0.0.1"];
    /// <summary>DEV ONLY: loopback-only admin endpoints that talk to <see cref="DevCloudBridge"/>.</summary>
    public bool DevAdmin { get; set; }
    public TimeSpan PullInterval { get; set; } = TimeSpan.FromSeconds(5);
    public TimeSpan HeartbeatBatchInterval { get; set; } = TimeSpan.FromSeconds(30);
}

public static class HallServerHost
{
    public static TimeSpan Ttl(CommandType t) => t switch
    {
        CommandType.LOCK or CommandType.UNLOCK or CommandType.SHUTDOWN or CommandType.RESTART => TimeSpan.FromSeconds(60),
        CommandType.START_SESSION or CommandType.EXTEND_SESSION or CommandType.END_SESSION => TimeSpan.FromSeconds(120),
        _ => TimeSpan.FromSeconds(30),
    };

    public static WebApplication Build(HallServerOptions opt, ICloudBridge cloud, ISecretProtector? protector = null,
        Action<ILoggingBuilder>? logging = null, bool windowsService = false)
    {
        var builder = WebApplication.CreateBuilder();
        if (windowsService) builder.Host.UseWindowsService(o => o.ServiceName = "ArcadiaHallServer");
        if (logging is not null) logging(builder.Logging);

        var ca = LocalCa.LoadOrCreate(Path.Combine(opt.DataDir, "pki"), protector ?? new DpapiSecretProtector());
        var db = new HallDb(Path.Combine(opt.DataDir, "hall.db"));
        var check = db.QuickCheck();
        if (check != "ok") throw new InvalidOperationException($"SQLite integrity check failed: {check}");

        var serverCert = ca.IssueServerCert(opt.DnsNames, opt.IpAddresses.Select(IPAddress.Parse));

        builder.WebHost.ConfigureKestrel(k =>
        {
            k.AddServerHeader = false;
            k.Listen(IPAddress.Parse(opt.BindAddress), opt.Port, l => l.UseHttps(h =>
            {
                h.ServerCertificate = serverCert;
                // Allow (not Require): /ca and /pair are used before an agent has a certificate. /ws demands one.
                h.ClientCertificateMode = Microsoft.AspNetCore.Server.Kestrel.Https.ClientCertificateMode.AllowCertificate;
                // Any presented certificate must chain to OUR CA, otherwise the handshake is refused.
                h.ClientCertificateValidation = (cert, _, _) => ca.ChainsToCa(cert);
            }));
        });

        builder.Services.AddSingleton(opt);
        builder.Services.AddSingleton(ca);
        builder.Services.AddSingleton(db);
        builder.Services.AddSingleton(cloud);
        builder.Services.AddSingleton<RelayHub>();
        builder.Services.AddSingleton<CommandIngest>();
        builder.Services.AddHostedService<MaintenanceService>();

        var app = builder.Build();
        app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(20) });
        MapEndpoints(app, opt, ca, db, cloud);
        return app;
    }

    private static void MapEndpoints(WebApplication app, HallServerOptions opt, LocalCa ca, HallDb db, ICloudBridge cloud)
    {
        var hub = app.Services.GetRequiredService<RelayHub>();
        var ingest = app.Services.GetRequiredService<CommandIngest>();
        var pairHits = new ConcurrentDictionary<string, Queue<DateTimeOffset>>();

        app.MapGet("/ca", () => Results.Text(ca.CaPem, "application/x-pem-file"));

        app.MapPost("/pair", async (HttpContext ctx, PairRequest req, CancellationToken ct) =>
        {
            // Brute-force guard: 10 attempts a minute per source address.
            var ip = ctx.Connection.RemoteIpAddress?.ToString() ?? "?";
            var q = pairHits.GetOrAdd(ip, _ => new Queue<DateTimeOffset>());
            lock (q)
            {
                var now = DateTimeOffset.UtcNow;
                while (q.Count > 0 && now - q.Peek() > TimeSpan.FromMinutes(1)) q.Dequeue();
                if (q.Count >= 10) return Results.StatusCode(StatusCodes.Status429TooManyRequests);
                q.Enqueue(now);
            }

            if (string.IsNullOrWhiteSpace(req.Code) || req.Code.Length > 32 || req.StationId == Guid.Empty ||
                req.CsrPem.Length > 4096 || req.MachineFingerprint.Length > 256)
                return Results.BadRequest(new { error = "invalid_request" });

            var tenant = await cloud.RedeemPairingCodeAsync(req.Code, req.StationId, ct);
            if (tenant is null) return Results.Json(new { error = "invalid_or_expired_code" }, statusCode: 403);

            var agentId = Guid.NewGuid();
            X509Certificate2 cert;
            try { cert = ca.IssueClientCert(req.CsrPem, agentId); }
            catch (System.Security.Cryptography.CryptographicException) { return Results.BadRequest(new { error = "invalid_csr" }); }

            db.RegisterAgent(new AgentRecord(agentId, req.StationId, tenant.Value, cert.Thumbprint, DateTimeOffset.UtcNow, false), req.MachineFingerprint);
            return Results.Json(new PairResponse(agentId, tenant.Value, req.StationId, cert.ExportCertificatePem(), ca.CaPem),
                ContractJson.Options);
        });

        app.Map("/ws", async (HttpContext ctx) =>
        {
            if (!ctx.WebSockets.IsWebSocketRequest) return Results.BadRequest();
            var cert = ctx.Connection.ClientCertificate;
            if (cert is null) return Results.Unauthorized();
            var agent = db.FindAgentByThumbprint(cert.Thumbprint);
            if (agent is null || agent.Revoked || !ca.ChainsToCa(cert)) return Results.StatusCode(StatusCodes.Status403Forbidden);

            using var ws = await ctx.WebSockets.AcceptWebSocketAsync();
            await hub.RunAsync(agent, ws, ctx.RequestAborted);
            return Results.Empty;
        });

        if (!opt.DevAdmin || cloud is not DevCloudBridge dev) return;

        // ---- DEV ONLY, loopback only ----
        static bool Loopback(HttpContext c) => c.Connection.RemoteIpAddress is { } a && IPAddress.IsLoopback(a);

        app.MapPost("/admin/pairing-code", (HttpContext c, Guid tenantId) =>
            Loopback(c) ? Results.Ok(new { code = dev.IssuePairingCode(tenantId), caFingerprint = ca.Fingerprint }) : Results.NotFound());

        app.MapPost("/admin/commands", (HttpContext c, CloudCommand cmd) =>
        {
            if (!Loopback(c)) return Results.NotFound();
            dev.Enqueue(cmd);
            return Results.Accepted();
        });

        app.MapPost("/admin/revoke/{agentId:guid}", (HttpContext c, Guid agentId) =>
        {
            if (!Loopback(c)) return Results.NotFound();
            db.RevokeAgent(agentId);
            return Results.Ok();
        });
    }
}

/// <summary>Turns cloud commands into durable local commands (revision + sequence assigned and committed first).</summary>
public sealed class CommandIngest(HallDb db, ICloudBridge cloud, RelayHub hub, ILogger<CommandIngest> log)
{
    public async Task IngestAsync(CloudCommand c, CancellationToken ct)
    {
        var agent = db.FindAgentByStation(c.StationId);
        if (agent is null || agent.Revoked || agent.TenantId != c.TenantId)
        {
            // No paired agent for this station (or wrong tenant): never queue, tell the cloud.
            log.LogWarning("Command {Id} for station {Station} has no valid agent", c.CommandId, c.StationId);
            await cloud.ReportAsync(c.CommandId, CommandStatus.Rejected,
                new CommandResult(c.CommandId, CommandStatus.Rejected, FailureReason.UNAUTHORIZED, LockState.Unknown, SessionState.Unknown, 0, Guid.Empty), ct);
            return;
        }

        object payload = c.Payload;
        switch (c.Type)
        {
            case CommandType.START_SESSION or CommandType.EXTEND_SESSION or CommandType.END_SESSION:
            {
                var p = c.Payload.Deserialize<SessionPayload>(ContractJson.Options);
                if (p is null) { await Reject(c, ct); return; }
                // The revision is issued HERE, strictly increasing per session, and committed before sending.
                var existing = db.GetByKey(c.IdempotencyKey);
                payload = existing is not null ? existing.Envelope.Payload : p with { SessionRevision = db.NextRevision(p.SessionId) };
                break;
            }
            case CommandType.LOCK or CommandType.UNLOCK:
            {
                var p = c.Payload.Deserialize<LockPayload>(ContractJson.Options);
                if (p is null) { await Reject(c, ct); return; }
                payload = p.SessionId is { } sid ? p with { SessionRevision = db.CurrentRevision(sid) } : p;
                break;
            }
        }

        var stored = db.Enqueue(c.CommandId, c.TenantId, c.StationId, agent.AgentId, c.Type, payload, c.IdempotencyKey,
            HallServerHost.Ttl(c.Type), DateTimeOffset.UtcNow);
        if (stored.Status == CommandStatus.Queued) await hub.KickAsync(c.StationId, ct);
    }

    private Task Reject(CloudCommand c, CancellationToken ct) =>
        cloud.ReportAsync(c.CommandId, CommandStatus.Rejected,
            new CommandResult(c.CommandId, CommandStatus.Rejected, FailureReason.UNSUPPORTED_VERSION, LockState.Unknown, SessionState.Unknown, 0, Guid.Empty), ct);
}

/// <summary>Durable pull (reliable delivery), expiry sweep and batched heartbeats.</summary>
public sealed class MaintenanceService(HallServerOptions opt, HallDb db, ICloudBridge cloud, CommandIngest ingest,
    RelayHub hub, ILogger<MaintenanceService> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        var cursor = "";
        var credentialRejected = false;
        var lastBatch = DateTimeOffset.UtcNow;
        using var timer = new PeriodicTimer(opt.PullInterval);
        do
        {
            try
            {
                var pulled = await cloud.PullCommandsAsync(cursor, ct);
                foreach (var c in pulled.Commands) await ingest.IngestAsync(c, ct);
                cursor = pulled.Cursor;

                foreach (var id in db.ExpireDue(DateTimeOffset.UtcNow))
                    await cloud.ReportAsync(id, CommandStatus.Expired, null, ct);

                if (DateTimeOffset.UtcNow - lastBatch >= opt.HeartbeatBatchInterval)
                {
                    lastBatch = DateTimeOffset.UtcNow;
                    var hb = hub.DrainHeartbeats();
                    if (hb.Count > 0) await cloud.HeartbeatBatchAsync(hb, ct);
                }
            }
            catch (OperationCanceledException) { break; }
            catch (CloudUnauthorizedException e)
            {
                // Revoked or wrong credential: say it once, loudly, without a stack trace every cycle.
                if (!credentialRejected)
                    log.LogCritical("{Message} Local agents keep running sessions, but no cloud commands are delivered.", e.Message);
                credentialRejected = true;
                continue;
            }
            catch (Exception e) { log.LogError(e, "Cloud sync cycle failed; will retry (commands stay durable)."); continue; }
            credentialRejected = false;
        } while (await timer.WaitForNextTickAsync(ct));
    }
}
