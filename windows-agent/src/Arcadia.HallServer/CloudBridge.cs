using System.Collections.Concurrent;
using System.Text.Json;
using Arcadia.Contracts;

namespace Arcadia.HallServer;

public sealed record CloudCommand(Guid CommandId, Guid TenantId, Guid StationId, CommandType Type, JsonElement Payload, string IdempotencyKey);

public sealed record PullResult(IReadOnlyList<CloudCommand> Commands, string Cursor);

public sealed record AgentHeartbeat(Guid AgentId, Guid StationId, DateTimeOffset ObservedAt, LockState? Lock, SessionState? Session,
    Guid? SessionId, long Revision, TimeReliability? Reliability, string? Version);

/// <summary>
/// The only way the Hall Server talks to the cloud (planned: the <c>agent-bridge</c> Edge Function with a hall-server
/// credential; security doc section 1). No service-role key ever lives on this machine.
/// </summary>
public interface ICloudBridge
{
    /// <summary>Redeems a one-time hall pairing code. Returns the tenant (hall) id, or null if invalid/expired/used.</summary>
    Task<Guid?> RedeemPairingCodeAsync(string code, Guid stationId, CancellationToken ct);

    /// <summary>Durable pull with a cursor (contract section 9). Realtime is only a hint; this is the reliable path.</summary>
    Task<PullResult> PullCommandsAsync(string cursor, CancellationToken ct);

    /// <summary>Status transitions; the cloud treats a duplicate report as a no-op.</summary>
    Task ReportAsync(Guid commandId, CommandStatus status, CommandResult? result, CancellationToken ct);

    Task HeartbeatBatchAsync(IReadOnlyList<AgentHeartbeat> heartbeats, CancellationToken ct);
}

/// <summary>
/// In-memory stand-in for the cloud, for development and tests only. The real implementation needs the
/// agent-bridge Edge Function and its migration, which are not built yet.
/// </summary>
public sealed class DevCloudBridge : ICloudBridge
{
    private readonly ConcurrentDictionary<string, (Guid Tenant, DateTimeOffset Expires)> _codes = new();
    private readonly List<CloudCommand> _queue = [];
    private readonly object _gate = new();

    public ConcurrentQueue<(Guid CommandId, CommandStatus Status, CommandResult? Result)> Reports { get; } = new();
    public ConcurrentDictionary<Guid, AgentHeartbeat> Heartbeats { get; } = new();

    public string IssuePairingCode(Guid tenantId, TimeSpan? ttl = null)
    {
        var code = Random.Shared.Next(0, 1_000_000).ToString("D6");
        _codes[code] = (tenantId, DateTimeOffset.UtcNow + (ttl ?? TimeSpan.FromMinutes(10)));
        return code;
    }

    public void Enqueue(CloudCommand c) { lock (_gate) _queue.Add(c); }

    public Task<Guid?> RedeemPairingCodeAsync(string code, Guid stationId, CancellationToken ct)
    {
        // One-time: removing the entry consumes the code even if the caller then fails.
        if (_codes.TryRemove(code, out var e) && e.Expires > DateTimeOffset.UtcNow)
            return Task.FromResult<Guid?>(e.Tenant);
        return Task.FromResult<Guid?>(null);
    }

    public Task<PullResult> PullCommandsAsync(string cursor, CancellationToken ct)
    {
        var from = int.TryParse(cursor, out var i) ? i : 0;
        lock (_gate)
        {
            var slice = _queue.Skip(from).ToList();
            return Task.FromResult(new PullResult(slice, (from + slice.Count).ToString()));
        }
    }

    public Task ReportAsync(Guid commandId, CommandStatus status, CommandResult? result, CancellationToken ct)
    {
        Reports.Enqueue((commandId, status, result));
        return Task.CompletedTask;
    }

    public Task HeartbeatBatchAsync(IReadOnlyList<AgentHeartbeat> heartbeats, CancellationToken ct)
    {
        foreach (var h in heartbeats) Heartbeats[h.AgentId] = h;
        return Task.CompletedTask;
    }
}
