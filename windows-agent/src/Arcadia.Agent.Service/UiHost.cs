using System.Diagnostics;
using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using Arcadia.Contracts;
using Microsoft.Extensions.Logging;

namespace Arcadia.Agent.Service;

/// <summary>
/// Service side of the UI channel (security doc section 4): an ACL-restricted named pipe (SYSTEM + player SID only),
/// JSON lines, closed message set, and a per-launch nonce the UI must present in its Hello.
/// </summary>
public sealed class UiHost(AgentOptions options, ILogger<UiHost> log)
{
    public string PipeName { get; } = "arcadia-agent-" + Guid.NewGuid().ToString("N");
    public string Nonce { get; } = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));

    private readonly object _gate = new();
    private StreamWriter? _writer;
    private ServiceToUi? _last;

    public bool Connected { get { lock (_gate) return _writer is not null; } }

    /// <summary>Raised on the pipe reader thread for Ack / UiHeartbeat / TechUnlockRequest (nonce already verified).</summary>
    public event Action<UiToService>? MessageReceived;

    public async Task RunAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            NamedPipeServerStream? server = null;
            try
            {
                server = CreateServer();
                await server.WaitForConnectionAsync(ct);
                using var reader = new StreamReader(server, Encoding.UTF8, false, 4096, leaveOpen: true);
                var writer = new StreamWriter(server, new UTF8Encoding(false), 4096, leaveOpen: true) { AutoFlush = true, NewLine = "\n" };

                var authed = false;
                while (!ct.IsCancellationRequested && server.IsConnected)
                {
                    var line = await reader.ReadLineAsync(ct);
                    if (line is null) break;
                    if (line.Length > 4096) break; // closed contract: tiny messages only

                    UiToService? msg;
                    try { msg = JsonSerializer.Deserialize<UiToService>(line, ContractJson.Options); }
                    catch (JsonException) { break; }
                    if (msg is null) break;

                    if (!authed)
                    {
                        if (msg.Kind != "Hello" || !FixedEquals(msg.Nonce, Nonce))
                        {
                            log.LogWarning("UI pipe client failed the nonce check; disconnecting.");
                            break;
                        }
                        authed = true;
                        ServiceToUi? replay;
                        lock (_gate) { _writer = writer; replay = _last; }
                        if (replay is not null) await Write(writer, replay);
                        continue;
                    }

                    if (msg.Kind is "Ack" or "UiHeartbeat" or "TechUnlockRequest")
                        MessageReceived?.Invoke(msg);
                    // anything else is ignored: the message set is closed
                }
            }
            catch (OperationCanceledException) { break; }
            catch (IOException e) { log.LogDebug(e, "UI pipe closed."); }
            catch (Exception e) { log.LogError(e, "UI pipe error."); await Task.Delay(500, CancellationToken.None); }
            finally
            {
                lock (_gate) _writer = null;
                server?.Dispose();
            }
        }
    }

    /// <summary>Sends to the UI (if connected) and remembers it so a reconnecting UI is brought up to date.</summary>
    public void Send(ServiceToUi msg)
    {
        StreamWriter? w;
        lock (_gate) { _last = msg; w = _writer; }
        if (w is null) return;
        try { Write(w, msg).GetAwaiter().GetResult(); }
        catch (IOException) { lock (_gate) _writer = null; }
    }

    private static async Task Write(StreamWriter w, ServiceToUi msg) =>
        await w.WriteLineAsync(JsonSerializer.Serialize(msg, ContractJson.Options));

    private NamedPipeServerStream CreateServer()
    {
        var security = new PipeSecurity();
        security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null),
            PipeAccessRights.FullControl, AccessControlType.Allow));
        security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(options.PlayerSid),
            PipeAccessRights.ReadWrite | PipeAccessRights.Synchronize, AccessControlType.Allow));
        return NamedPipeServerStreamAcl.Create(PipeName, PipeDirection.InOut, 1, PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous, 4096, 4096, security);
    }

    private static bool FixedEquals(string? a, string b) =>
        a is not null && CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(a), Encoding.UTF8.GetBytes(b));
}

/// <summary>
/// Keeps the WPF shell running in the player's session and relaunches it in a few seconds if it dies.
/// Repeated kills escalate (security doc: "10 kills in a minute -> logoff").
/// </summary>
public sealed class UiLauncher(AgentOptions options, UiHost host, ILogger<UiLauncher> log)
{
    private Process? _proc;
    private readonly Queue<DateTimeOffset> _starts = new();

    /// <summary>True if the shell process is alive.</summary>
    public bool IsRunning => _proc is { HasExited: false };

    /// <summary>Called every tick. Returns true if the kill-loop threshold was hit and the player was signed out.</summary>
    public bool EnsureRunning(DateTimeOffset now)
    {
        if (IsRunning) return false;
        if (!File.Exists(options.ShellPath))
        {
            log.LogError("Shell not found at {Path}", options.ShellPath);
            return false;
        }

        while (_starts.Count > 0 && now - _starts.Peek() > TimeSpan.FromMinutes(1)) _starts.Dequeue();
        if (_starts.Count >= 10)
        {
            log.LogCritical("Shell was killed {N} times in a minute; signing the player out.", _starts.Count);
            _starts.Clear();
            Native.LogoffConsoleSession();
            return true;
        }

        try
        {
            _proc = Native.StartInConsoleSession(options.ShellPath, $"--pipe {host.PipeName} --nonce {host.Nonce}");
            if (_proc is not null) _starts.Enqueue(now);
        }
        catch (Exception e)
        {
            log.LogError(e, "Could not start the shell in the console session.");
        }
        return false;
    }
}
