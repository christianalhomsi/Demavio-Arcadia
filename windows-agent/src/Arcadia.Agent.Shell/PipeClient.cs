using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using Arcadia.Contracts;

namespace Arcadia.Agent.Shell;

/// <summary>UI side of the service pipe. Reconnects forever; presents the nonce first; sends only Ack/UiHeartbeat/TechUnlockRequest.</summary>
public sealed class PipeClient(string pipe, string nonce, Action<ServiceToUi> onMessage, Action<Action<UiToService>> setSender) : IDisposable
{
    private readonly CancellationTokenSource _cts = new();
    private StreamWriter? _writer;
    private readonly object _gate = new();

    public void Start() => _ = Task.Run(Loop);

    private async Task Loop()
    {
        while (!_cts.IsCancellationRequested)
        {
            try
            {
                using var client = new NamedPipeClientStream(".", pipe, PipeDirection.InOut, PipeOptions.Asynchronous);
                await client.ConnectAsync(2000, _cts.Token);
                using var reader = new StreamReader(client, Encoding.UTF8, false, 4096, leaveOpen: true);
                var writer = new StreamWriter(client, new UTF8Encoding(false), 4096, leaveOpen: true) { AutoFlush = true, NewLine = "\n" };
                lock (_gate) _writer = writer;
                setSender(Send);
                Send(new UiToService("Hello", Nonce: nonce));

                _ = Task.Run(async () =>
                {
                    while (!_cts.IsCancellationRequested && client.IsConnected)
                    {
                        Send(new UiToService("UiHeartbeat"));
                        try { await Task.Delay(5000, _cts.Token); } catch (OperationCanceledException) { return; }
                    }
                });

                while (!_cts.IsCancellationRequested)
                {
                    var line = await reader.ReadLineAsync(_cts.Token);
                    if (line is null) break;
                    var msg = JsonSerializer.Deserialize<ServiceToUi>(line, ContractJson.Options);
                    if (msg is not null) onMessage(msg);
                }
            }
            catch (OperationCanceledException) { break; }
            catch (Exception e) when (e is IOException or TimeoutException or JsonException) { }
            finally { lock (_gate) _writer = null; }
            await Task.Delay(500).ConfigureAwait(false);
        }
    }

    private void Send(UiToService m)
    {
        lock (_gate)
        {
            try { _writer?.WriteLine(JsonSerializer.Serialize(m, ContractJson.Options)); }
            catch (IOException) { _writer = null; }
        }
    }

    public void Dispose() => _cts.Cancel();
}
