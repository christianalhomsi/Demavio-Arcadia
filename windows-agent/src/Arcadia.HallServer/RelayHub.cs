using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Arcadia.Contracts;
using Microsoft.Extensions.Logging;

namespace Arcadia.HallServer;

/// <summary>
/// Owns the live agent connections and command delivery. Delivery is durable: every command is in SQLite first, and
/// on every (re)connect all non-terminal commands are resent; the agent de-duplicates by command_id.
/// </summary>
public sealed class RelayHub(HallDb db, ICloudBridge cloud, ILogger<RelayHub> log)
{
    private sealed class Conn(AgentRecord agent, WebSocket ws)
    {
        public AgentRecord Agent { get; } = agent;
        public WebSocket Ws { get; } = ws;
        public SemaphoreSlim SendLock { get; } = new(1, 1);
    }

    private readonly ConcurrentDictionary<Guid, Conn> _conns = new(); // by station
    private readonly ConcurrentDictionary<Guid, AgentHeartbeat> _heartbeats = new();

    public bool IsConnected(Guid stationId) => _conns.ContainsKey(stationId);

    public IReadOnlyList<AgentHeartbeat> DrainHeartbeats()
    {
        var list = _heartbeats.Values.ToList();
        _heartbeats.Clear();
        return list;
    }

    public async Task RunAsync(AgentRecord agent, WebSocket ws, CancellationToken ct)
    {
        var conn = new Conn(agent, ws);
        if (_conns.TryGetValue(agent.StationId, out var old))
            _ = CloseQuietly(old.Ws); // one connection per station: a newer one replaces the older
        _conns[agent.StationId] = conn;
        log.LogInformation("Agent {Agent} connected for station {Station}", agent.AgentId, agent.StationId);

        try
        {
            var buffer = new byte[16 * 1024];
            while (ws.State == WebSocketState.Open && !ct.IsCancellationRequested)
            {
                var text = await ReceiveText(ws, buffer, ct);
                if (text is null) break;

                LinkMessage? msg;
                try { msg = JsonSerializer.Deserialize<LinkMessage>(text, ContractJson.Options); }
                catch (JsonException) { await SendAsync(conn, new LinkMessage("ERROR", Error: "bad_json"), ct); continue; }
                if (msg is null) continue;

                // Identity comes from the certificate, never from the message body.
                if (msg.AgentId != Guid.Empty && msg.AgentId != agent.AgentId)
                {
                    await SendAsync(conn, new LinkMessage("ERROR", Error: "identity_mismatch"), ct);
                    log.LogWarning("Agent {Agent} sent a message claiming {Claimed}; closing.", agent.AgentId, msg.AgentId);
                    break;
                }
                await HandleAsync(conn, msg, ct);
            }
        }
        catch (WebSocketException) { /* abrupt disconnect */ }
        catch (OperationCanceledException) { }
        finally
        {
            _conns.TryRemove(new KeyValuePair<Guid, Conn>(agent.StationId, conn));
            await CloseQuietly(ws);
            log.LogInformation("Agent {Agent} disconnected", agent.AgentId);
        }
    }

    private async Task HandleAsync(Conn c, LinkMessage m, CancellationToken ct)
    {
        switch (m.Type)
        {
            case "HELLO":
                // Resend everything not terminal (incl. Sent): the agent returns the stored result for duplicates,
                // which also resolves results that were lost with the previous connection.
                await FlushAsync(c, includeSent: true, ct);
                break;

            case "HEARTBEAT":
            case "RECOVERED":
                if (m.SessionId is { } sid && m.Revision > 0) db.RaiseRevisionFloor(sid, m.Revision);
                _heartbeats[c.Agent.AgentId] = new AgentHeartbeat(c.Agent.AgentId, c.Agent.StationId, DateTimeOffset.UtcNow,
                    m.Lock, m.Session, m.SessionId, m.Revision, m.Reliability, m.Version);
                await SendAsync(c, new LinkMessage("HEARTBEAT_ACK", Utc: DateTimeOffset.UtcNow), ct);
                break;

            case "RESULT" when m.Result is { } r:
            {
                // Only results for commands addressed to THIS station are accepted.
                if (db.GetStation(r.CommandId) != c.Agent.StationId)
                {
                    log.LogWarning("RESULT for unknown or foreign command {Id} ignored", r.CommandId);
                    break;
                }
                if (db.Transition(r.CommandId, r.Status, r))
                    await cloud.ReportAsync(r.CommandId, r.Status, r, ct);
                break;
            }

            default:
                await SendAsync(c, new LinkMessage("ERROR", Error: "unsupported_message"), ct);
                break;
        }
    }

    /// <summary>Sends queued commands to a connected station (no-op if offline: they stay durable in SQLite).</summary>
    public async Task KickAsync(Guid stationId, CancellationToken ct)
    {
        if (_conns.TryGetValue(stationId, out var c)) await FlushAsync(c, includeSent: false, ct);
    }

    private async Task FlushAsync(Conn c, bool includeSent, CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var cmd in db.Pending(c.Agent.StationId))
        {
            if (cmd.Status == CommandStatus.Sent && !includeSent) continue;
            if (cmd.ExpiresAt < now) continue; // swept to Expired by the maintenance loop; never delivered late

            await SendAsync(c, new LinkMessage("COMMAND", Command: cmd.Envelope), ct);
            if (db.Transition(cmd.CommandId, CommandStatus.Sent))
                await cloud.ReportAsync(cmd.CommandId, CommandStatus.Sent, null, ct);
        }
    }

    private static async Task SendAsync(Conn c, LinkMessage m, CancellationToken ct)
    {
        var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(m, ContractJson.Options));
        await c.SendLock.WaitAsync(ct);
        try
        {
            if (c.Ws.State == WebSocketState.Open)
                await c.Ws.SendAsync(bytes, WebSocketMessageType.Text, true, ct);
        }
        finally { c.SendLock.Release(); }
    }

    private static async Task<string?> ReceiveText(WebSocket ws, byte[] buffer, CancellationToken ct)
    {
        var sb = new StringBuilder();
        while (true)
        {
            var r = await ws.ReceiveAsync(buffer, ct);
            if (r.MessageType == WebSocketMessageType.Close) return null;
            if (r.MessageType != WebSocketMessageType.Text) return null; // closed contract: text frames only
            sb.Append(Encoding.UTF8.GetString(buffer, 0, r.Count));
            if (sb.Length > 64 * 1024) return null;
            if (r.EndOfMessage) return sb.ToString();
        }
    }

    private static async Task CloseQuietly(WebSocket ws)
    {
        try
        {
            if (ws.State is WebSocketState.Open or WebSocketState.CloseReceived)
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
        }
        catch (Exception e) when (e is WebSocketException or ObjectDisposedException) { }
    }
}
