using System.Windows;
using System.Windows.Threading;
using Arcadia.Contracts;

namespace Arcadia.Agent.Shell;

/// <summary>Maps service messages to windows. Display only: it holds no secrets and unlocks nothing by itself.</summary>
public sealed class ShellController(Dispatcher ui)
{
    private readonly List<LockWindow> _locks = [];
    private TimerWindow? _timer;
    private Action<UiToService>? _send;

    public void SetSender(Action<UiToService> send) => _send = send;

    public void OnMessage(ServiceToUi m) => ui.BeginInvoke(() =>
    {
        switch (m.Kind)
        {
            case "Show_Lock":
                ShowLock(m.HallName ?? "", m.DeviceName ?? "", m.StatusText ?? "");
                Ack(m.MsgId);
                break;
            case "Show_Timer":
                HideLock();
                _timer ??= new TimerWindow();
                _timer.Update(m.HallName, m.DeviceName, m.RemainingMs);
                _timer.Show();
                Ack(m.MsgId);
                break;
            case "Warn":
                _timer?.Flash(m.WarnKind == "power" ? $"Shutting down in {m.WarnSeconds}s" : $"{m.WarnSeconds / 60} min left");
                break;
            case "Hide":
                HideLock();
                _timer?.Hide();
                Ack(m.MsgId);
                break;
        }
    });

    private void Ack(long id)
    {
        if (id != 0) _send?.Invoke(new UiToService("Ack", MsgId: id));
    }

    public void ShowLock(string hall, string device, string status)
    {
        _timer?.Hide();
        var screens = System.Windows.Forms.Screen.AllScreens;
        // One overlay per monitor; rebuild if the monitor set changed (e.g. a screen plugged in while locked).
        if (_locks.Count != screens.Length)
        {
            HideLock();
            foreach (var s in screens) _locks.Add(new LockWindow(s, request => _send?.Invoke(request)));
        }
        foreach (var w in _locks)
        {
            w.SetText(hall, device, status);
            if (!w.IsVisible) w.Show();
        }
        _locks.FirstOrDefault()?.Activate();
    }

    private void HideLock()
    {
        foreach (var w in _locks) w.AllowClose();
        _locks.Clear();
    }
}
