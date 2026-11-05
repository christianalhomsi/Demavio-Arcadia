using System.Net.Http.Json;
using System.Net.Security;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using Arcadia.Contracts;
using Microsoft.Extensions.Logging;

namespace Arcadia.Agent.Link;

/// <summary>Everything the agent keeps after pairing. The hall pairing code is never stored.</summary>
public sealed record LinkCredentials(
    Guid AgentId, Guid TenantId, Guid StationId, string ServerUrl,
    byte[] ClientPfx, string PfxPassword, string CaPem);

/// <summary>Where credentials live (DPAPI LocalMachine + file ACL in production; in-memory in tests).</summary>
public interface ICredentialStore
{
    LinkCredentials? Load();
    void Save(LinkCredentials credentials);
}

/// <summary>What the link needs from the agent core (implemented by the service worker).</summary>
public interface ICommandSink
{
    CommandResult Handle(CommandEnvelope command);
    long LastDeviceSeq { get; }
    void SetServerOffset(TimeSpan? offset);
    LinkMessage Heartbeat(string type);
}

public sealed class PairingException(string message) : Exception(message);

public static class HallPairing
{
    /// <summary>
    /// First-time pairing. The technician compares <paramref name="expectedCaFingerprint"/> (shown on the Hall Server /
    /// dashboard) with what the server presents, so a spoofed server found via mDNS cannot get pinned.
    /// The hall code is sent once, over TLS, and is consumed by the server.
    /// </summary>
    public static async Task<LinkCredentials> PairAsync(string serverUrl, string expectedCaFingerprint, string code,
        Guid stationId, string machineFingerprint, ICredentialStore store, CancellationToken ct = default)
    {
        var baseUri = new Uri(serverUrl);

        // Step 1: fetch the CA without trusting the TLS chain yet, then verify it against the fingerprint.
        string caPem;
        using (var probe = new HttpClient(new HttpClientHandler
        { ServerCertificateCustomValidationCallback = (_, _, _, _) => true }))
            caPem = await probe.GetStringAsync(new Uri(baseUri, "/ca"), ct);

        using var ca = X509Certificate2.CreateFromPem(caPem);
        var actual = Convert.ToHexString(ca.GetCertHash(HashAlgorithmName.SHA256));
        if (!string.Equals(actual, expectedCaFingerprint.Replace(":", "").Replace(" ", ""), StringComparison.OrdinalIgnoreCase))
            throw new PairingException("The server's CA fingerprint does not match the one you entered. Refusing to pair.");

        // Step 2: from now on, trust ONLY that CA.
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var csr = new CertificateRequest($"CN=arcadia-agent-{stationId}", key, HashAlgorithmName.SHA256).CreateSigningRequestPem();

        using var http = new HttpClient(new HttpClientHandler
        { ServerCertificateCustomValidationCallback = (_, cert, _, _) => cert is not null && ChainsTo(cert, ca) });
        var res = await http.PostAsJsonAsync(new Uri(baseUri, "/pair"),
            new PairRequest(code, stationId, machineFingerprint, csr), ContractJson.Options, ct);
        if (!res.IsSuccessStatusCode)
            throw new PairingException($"Pairing refused ({(int)res.StatusCode}). The code may be wrong, used or expired.");

        var resp = (await res.Content.ReadFromJsonAsync<PairResponse>(ContractJson.Options, ct))!;
        if (!string.Equals(resp.CaPem.Trim(), caPem.Trim(), StringComparison.Ordinal))
            throw new PairingException("The server returned a different CA than the one confirmed. Refusing to pair.");

        using var issued = X509Certificate2.CreateFromPem(resp.ClientCertPem);
        using var withKey = issued.CopyWithPrivateKey(key);
        var password = Convert.ToBase64String(RandomNumberGenerator.GetBytes(18));
        var creds = new LinkCredentials(resp.AgentId, resp.TenantId, resp.StationId, serverUrl,
            withKey.Export(X509ContentType.Pfx, password), password, caPem);
        store.Save(creds);
        return creds;
    }

    internal static bool ChainsTo(X509Certificate2 cert, X509Certificate2 root)
    {
        using var chain = new X509Chain();
        chain.ChainPolicy.TrustMode = X509ChainTrustMode.CustomRootTrust;
        chain.ChainPolicy.CustomTrustStore.Add(root);
        chain.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck;
        return chain.Build(cert);
    }
}

/// <summary>
/// Agent to Hall Server link: mTLS WebSocket with the CA pinned, reconnecting forever. Commands are handled by the
/// agent core (which persists before acknowledging); results go back as RESULT frames.
/// </summary>
public sealed class HallLinkClient(ICredentialStore store, ICommandSink sink, ILogger<HallLinkClient> log, string version = "0.1")
{
    public TimeSpan HeartbeatEvery { get; init; } = TimeSpan.FromSeconds(10);
    public TimeSpan ReconnectMax { get; init; } = TimeSpan.FromSeconds(15);

    public async Task RunAsync(CancellationToken ct)
    {
        var delay = TimeSpan.FromMilliseconds(500);
        while (!ct.IsCancellationRequested)
        {
            var creds = store.Load();
            if (creds is null)
            {
                await Task.Delay(TimeSpan.FromSeconds(5), ct); // not paired yet
                continue;
            }

            try
            {
                await ConnectOnce(creds, ct);
                delay = TimeSpan.FromMilliseconds(500);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception e) when (e is WebSocketException or IOException or HttpRequestException or System.Security.Authentication.AuthenticationException)
            {
                log.LogWarning("Hall Server link lost: {Message}. Retrying in {Delay}.", e.Message, delay);
                sink.SetServerOffset(null);
            }

            try { await Task.Delay(delay, ct); } catch (OperationCanceledException) { break; }
            delay = TimeSpan.FromMilliseconds(Math.Min(ReconnectMax.TotalMilliseconds, delay.TotalMilliseconds * 2));
        }
    }

    private async Task ConnectOnce(LinkCredentials creds, CancellationToken ct)
    {
        using var ca = X509Certificate2.CreateFromPem(creds.CaPem);
        using var client = X509CertificateLoader.LoadPkcs12(creds.ClientPfx, creds.PfxPassword);
        using var ws = new ClientWebSocket();
        ws.Options.ClientCertificates = [client];
        ws.Options.RemoteCertificateValidationCallback = (_, cert, _, _) =>
            cert is not null && HallPairing.ChainsTo(new X509Certificate2(cert), ca); // pinned CA only
        ws.Options.KeepAliveInterval = TimeSpan.FromSeconds(20);

        var uri = new UriBuilder(creds.ServerUrl) { Scheme = "wss", Path = "/ws" }.Uri;
        await ws.ConnectAsync(uri, ct);
        log.LogInformation("Connected to Hall Server {Uri}", uri);

        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var sendLock = new SemaphoreSlim(1, 1);

        async Task Send(LinkMessage m)
        {
            var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(m, ContractJson.Options));
            await sendLock.WaitAsync(linked.Token);
            try { await ws.SendAsync(bytes, WebSocketMessageType.Text, true, linked.Token); }
            finally { sendLock.Release(); }
        }

        await Send(new LinkMessage("HELLO", AgentId: creds.AgentId, Version: version, LastSeq: sink.LastDeviceSeq));
        await Send(sink.Heartbeat("RECOVERED") with { AgentId = creds.AgentId, Version = version });

        var heartbeats = Task.Run(async () =>
        {
            try
            {
                while (!linked.IsCancellationRequested && ws.State == WebSocketState.Open)
                {
                    await Task.Delay(HeartbeatEvery, linked.Token);
                    await Send(sink.Heartbeat("HEARTBEAT") with { AgentId = creds.AgentId, Version = version });
                }
            }
            catch (OperationCanceledException) { }
            catch (WebSocketException) { }
        }, linked.Token);

        var buffer = new byte[16 * 1024];
        try
        {
            while (ws.State == WebSocketState.Open)
            {
                var sb = new StringBuilder();
                WebSocketReceiveResult r;
                do
                {
                    r = await ws.ReceiveAsync(buffer, ct);
                    if (r.MessageType == WebSocketMessageType.Close) return;
                    sb.Append(Encoding.UTF8.GetString(buffer, 0, r.Count));
                    if (sb.Length > 64 * 1024) return;
                } while (!r.EndOfMessage);

                var msg = JsonSerializer.Deserialize<LinkMessage>(sb.ToString(), ContractJson.Options);
                if (msg is null) continue;

                switch (msg.Type)
                {
                    case "COMMAND" when msg.Command is { } cmd:
                    {
                        var result = sink.Handle(cmd); // persists before it returns
                        await Send(new LinkMessage("RESULT", AgentId: creds.AgentId, Result: result));
                        break;
                    }
                    case "HEARTBEAT_ACK" when msg.Utc is { } serverUtc:
                        sink.SetServerOffset(serverUtc - DateTimeOffset.UtcNow);
                        break;
                    case "ERROR":
                        log.LogWarning("Hall Server error: {Error}", msg.Error);
                        break;
                }
            }
        }
        finally
        {
            await linked.CancelAsync();
            try { await heartbeats; } catch (OperationCanceledException) { }
        }
    }
}
