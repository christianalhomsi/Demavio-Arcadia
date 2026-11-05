using System.Windows;
using System.Windows.Threading;

namespace Arcadia.Agent.Shell;

/// <summary>Small always-on-top countdown, top-right of the primary screen. Never takes focus from the game.</summary>
public partial class TimerWindow : Window
{
    private readonly DispatcherTimer _noteTimer = new() { Interval = TimeSpan.FromSeconds(8) };

    public TimerWindow()
    {
        InitializeComponent();
        _noteTimer.Tick += (_, _) =>
        {
            Note.Visibility = Visibility.Collapsed;
            _noteTimer.Stop();
        };
        Loaded += (_, _) => Reposition();
        SizeChanged += (_, _) => Reposition();
    }

    public void Update(string? hall, string? device, long remainingMs)
    {
        var t = TimeSpan.FromMilliseconds(Math.Max(0, remainingMs));
        Time.Text = t.TotalHours >= 1 ? $"{(int)t.TotalHours}:{t.Minutes:00}:{t.Seconds:00}" : $"{t.Minutes:00}:{t.Seconds:00}";
    }

    public void Flash(string text)
    {
        Note.Text = text;
        Note.Visibility = Visibility.Visible;
        _noteTimer.Stop();
        _noteTimer.Start();
    }

    private void Reposition()
    {
        var wa = SystemParameters.WorkArea;
        Left = wa.Right - ActualWidth - 16;
        Top = wa.Top + 16;
    }
}
