using System.Windows;

namespace Arcadia.Agent.Shell;

public partial class App : System.Windows.Application
{
    private PipeClient? _client;
    private ShellController? _controller;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        var pipe = ArgValue(e.Args, "--pipe");
        var nonce = ArgValue(e.Args, "--nonce");
        if (pipe is null || nonce is null)
        {
            // Started by hand without the service: nothing to show, nothing to trust.
            Shutdown(2);
            return;
        }

        _controller = new ShellController(Dispatcher);
        _controller.ShowLock("", "", "Starting..."); // boot Locked before the service says anything
        _client = new PipeClient(pipe, nonce, _controller.OnMessage, _controller.SetSender);
        _client.Start();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _client?.Dispose();
        base.OnExit(e);
    }

    private static string? ArgValue(string[] args, string name)
    {
        var i = Array.IndexOf(args, name);
        return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
    }
}
