using System.ComponentModel;
using System.Windows;
using System.Windows.Input;
using Arcadia.Contracts;

namespace Arcadia.Agent.Shell;

/// <summary>
/// Full-screen top-most overlay on one monitor. This is UX, NOT a security boundary: the SYSTEM service enforces
/// the lock (and logs the player off if this process is killed). Technician PIN panel: Ctrl+Shift+F12.
/// </summary>
public partial class LockWindow : Window
{
    private readonly Action<UiToService> _send;
    private bool _allowClose;

    public LockWindow(System.Windows.Forms.Screen screen, Action<UiToService> send)
    {
        InitializeComponent();
        _send = send;
        var b = screen.Bounds;
        WindowState = WindowState.Normal;
        Left = b.Left; Top = b.Top; Width = b.Width; Height = b.Height;
        Loaded += (_, _) => { WindowState = WindowState.Maximized; };
        Deactivated += (_, _) =>
        {
            if (_allowClose) return;
            Topmost = true;
            Activate();
        };
        PreviewKeyDown += OnKey;
    }

    public void SetText(string hall, string device, string status)
    {
        Hall.Text = hall;
        Device.Text = device;
        Status.Text = status;
    }

    public void AllowClose()
    {
        _allowClose = true;
        Close();
    }

    protected override void OnClosing(CancelEventArgs e)
    {
        if (!_allowClose) e.Cancel = true; // Alt+F4 does nothing while locked
        base.OnClosing(e);
    }

    private void OnKey(object sender, System.Windows.Input.KeyEventArgs e)
    {
        if (e.Key == Key.F12 && Keyboard.Modifiers == (ModifierKeys.Control | ModifierKeys.Shift))
        {
            TechPanel.Visibility = Visibility.Visible;
            Pin.Focus();
            e.Handled = true;
        }
    }

    private void OnUnlock(object sender, RoutedEventArgs e)
    {
        _send(new UiToService("TechUnlockRequest", Pin: Pin.Password));
        Pin.Clear();
        TechPanel.Visibility = Visibility.Collapsed;
    }
}
