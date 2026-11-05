using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Arcadia.Contracts;

namespace Arcadia.HallServer;

public sealed class CloudUnauthorizedException(string message) : Exception(message);

public sealed record CloudSettings(string Url, string Token);

/// <summary>Where the hall-server credential lives: DPAPI-protected file in the server's data folder.</summary>
public sealed class CloudSettingsStore(string dir, ISecretProtector protector)
{
    private string FilePath => Path.Combine(dir, "cloud.dat");

    public CloudSettings? Load()
    {
        try
        {
            if (!File.Exists(FilePath)) return null;
            var json = protector.Unprotect(File.ReadAllBytes(FilePath));
            return JsonSerializer.Deserialize<CloudSettings>(json, ContractJson.Options);
        }
        catch (Exception e) when (e is IOException or System.Security.Cryptography.CryptographicException or JsonException)
        {
            return null;
        }
    }

    public void Save(CloudSettings s)
    {
        Directory.CreateDirectory(dir);
        var tmp = FilePath + ".tmp";
        File.WriteAllBytes(tmp, protector.Protect(JsonSerializer.SerializeToUtf8Bytes(s, ContractJson.Options)));
        File.Move(tmp, FilePath, overwrite: true);
    }
}

public static class HallServerPairing
{
    /// <summary>
    /// One-time pairing of this Hall Server with the cloud (owner generates a 'hall_server' code in the dashboard).
    /// The returned token is stored protected and never printed.
    /// </summary>
    public static async Task<Guid> PairAsync(HttpClient http, string baseUrl, string code, string name, CloudSettingsStore store, CancellationToken ct = default)
    {
        var res = await http.PostAsJsonAsync(Join(baseUrl, "pair-server"), new { code, name }, ContractJson.Options, ct);
        if (res.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Forbidden)
            throw new InvalidOperationException("The pairing code is invalid, used or expired.");
        res.EnsureSuccessStatusCode();
        var body = (await res.Content.ReadFromJsonAsync<PairServerResponse>(ContractJson.Options, ct))!;
        store.Save(new CloudSettings(baseUrl, body.Token));
        return body.HallId;
    }

    internal static Uri Join(string baseUrl, string route) => new(baseUrl.TrimEnd('/') + "/" + route);
    private sealed record PairServerResponse(string Token, Guid HallId);
}

/// <summary>
/// ICloudBridge over the agent-bridge Edge Function. The only credential is the hall-server token (Bearer).
/// There is no database key here. Failures throw, so the maintenance loop retries and commands stay durable locally.
/// </summary>
public sealed class SupabaseCloudBridge(HttpClient http, CloudSettings settings) : ICloudBridge
{
    private sealed record PairAgentResponse(Guid TenantId);
    private sealed record WirePull(List<WireCommand> Commands, long Cursor);
    private sealed record WireCommand(Guid CommandId, Guid HallId, Guid StationId, CommandType Type, JsonElement Payload, string IdempotencyKey);

    private async Task<HttpResponseMessage> Post(string route, object body, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, HallServerPairing.Join(settings.Url, route))
        {
            Content = new StringContent(JsonSerializer.Serialize(body, ContractJson.Options), Encoding.UTF8, "application/json"),
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", settings.Token);
        var res = await http.SendAsync(req, ct);
        if (res.StatusCode == HttpStatusCode.Unauthorized)
            throw new CloudUnauthorizedException("The cloud rejected this Hall Server's credential (revoked or wrong). Re-pair it.");
        return res;
    }

    public async Task<Guid?> RedeemPairingCodeAsync(string code, Guid stationId, CancellationToken ct)
    {
        using var res = await Post("pair-agent", new { code, stationId }, ct);
        if (res.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Forbidden or HttpStatusCode.Conflict or HttpStatusCode.BadRequest)
            return null; // wrong/expired/used code, not a pairable device: the caller answers 403 to the agent
        res.EnsureSuccessStatusCode();
        return (await res.Content.ReadFromJsonAsync<PairAgentResponse>(ContractJson.Options, ct))!.TenantId;
    }

    public async Task<PullResult> PullCommandsAsync(string cursor, CancellationToken ct)
    {
        _ = long.TryParse(cursor, out var c);
        using var res = await Post("pull", new { cursor = c }, ct);
        res.EnsureSuccessStatusCode();
        var pulled = (await res.Content.ReadFromJsonAsync<WirePull>(ContractJson.Options, ct))!;
        var commands = pulled.Commands
            .Select(w => new CloudCommand(w.CommandId, w.HallId, w.StationId, w.Type, w.Payload, w.IdempotencyKey))
            .ToList();
        return new PullResult(commands, pulled.Cursor.ToString());
    }

    public async Task ReportAsync(Guid commandId, CommandStatus status, CommandResult? result, CancellationToken ct)
    {
        using var res = await Post("report", new
        {
            commandId,
            status = status.ToString(),
            result,
            error = result is { FailureReason: not FailureReason.None } ? result.FailureReason.ToString() : null,
        }, ct);
        res.EnsureSuccessStatusCode();
    }

    public async Task HeartbeatBatchAsync(IReadOnlyList<AgentHeartbeat> heartbeats, CancellationToken ct)
    {
        using var res = await Post("heartbeat", new { items = heartbeats }, ct);
        res.EnsureSuccessStatusCode();
    }
}
