using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Threading;

namespace Arcadia.Agent.Shell;

/// <summary>
/// Small always-on-top clock showing the elapsed session time, top-right of the primary screen. The player
/// can minimize it to a small circle on the screen edge and click the circle to bring it back. It never
/// takes focus from the game.
/// </summary>
public partial class TimerWindow : Window
{
    private const int GwlExStyle = -20;
    private const int WsExNoActivate = 0x08000000;

    [DllImport("user32.dll")] private static extern int GetWindowLong(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll")] private static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

    private readonly DispatcherTimer _noteTimer = new() { Interval = TimeSpan.FromSeconds(8) };
    private bool _minimized;

    public TimerWindow()
    {
        InitializeComponent();
        _noteTimer.Tick += (_, _) =>
        {
            Note.Visibility = Visibility.Collapsed;
            _noteTimer.Stop();
        };
        // Clicking the buttons must not move focus away from the game.
        SourceInitialized += (_, _) =>
        {
            var h = new WindowInteropHelper(this).Handle;
            SetWindowLong(h, GwlExStyle, GetWindowLong(h, GwlExStyle) | WsExNoActivate);
        };
        Loaded += (_, _) => Reposition();
        SizeChanged += (_, _) => Reposition();
    }

    /// <summary>Shows the time elapsed since the session started (h:mm:ss, or mm:ss under an hour).</summary>
    public void Update(long elapsedMs)
    {
        var t = TimeSpan.FromMilliseconds(Math.Max(0, elapsedMs));
        Time.Text = t.TotalHours >= 1 ? $"{(int)t.TotalHours}:{t.Minutes:00}:{t.Seconds:00}" : $"{t.Minutes:00}:{t.Seconds:00}";
    }

    /// <summary>Shows a warning. A minimized timer pops back open so the player cannot miss a shutdown notice.</summary>
    public void Flash(string text)
    {
        SetMinimized(false);
        Note.Text = text;
        Note.Visibility = Visibility.Visible;
        _noteTimer.Stop();
        _noteTimer.Start();
    }

    private void OnMinimize(object sender, RoutedEventArgs e) => SetMinimized(true);

    private void OnRestore(object sender, MouseButtonEventArgs e) => SetMinimized(false);

    private void SetMinimized(bool minimized)
    {
        _minimized = minimized;
        Panel.Visibility = minimized ? Visibility.Collapsed : Visibility.Visible;
        Dot.Visibility = minimized ? Visibility.Visible : Visibility.Collapsed;
        Reposition();
    }

    private void Reposition()
    {
        var wa = SystemParameters.WorkArea;
        // The circle sits flush against the right edge like a tab; the full clock keeps a margin.
        Left = wa.Right - ActualWidth - (_minimized ? 0 : 16);
        Top = wa.Top + 16;
    }
}
