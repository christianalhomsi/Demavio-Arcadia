using Microsoft.Win32;
using Arcadia.Agent.Core;

namespace Arcadia.Agent.Service;

public sealed class AgentOptions
{
    public const string Section = "Agent";

    public string HallName { get; set; } = "Gaming Hall";
    public string DeviceName { get; set; } = Environment.MachineName;

    // Identity. Until pairing exists (Hall Server phase) these come from configuration; empty = generated for dev.
    public Guid AgentId { get; set; }
    public Guid TenantId { get; set; }
    public Guid StationId { get; set; }

    public string StatePath { get; set; } =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Arcadia", "Agent", "state.json");

    /// <summary>SID allowed on the UI pipe besides SYSTEM. Default: BUILTIN\Users. Set the player account SID in production.</summary>
    public string PlayerSid { get; set; } = "S-1-5-32-545";

    public string ShellPath { get; set; } = Path.Combine(AppContext.BaseDirectory, "Arcadia.Agent.Shell.exe");

    /// <summary>PBKDF2 hash of the technician PIN (see PinVerifier.Hash). Empty = emergency unlock disabled.</summary>
    public string TechnicianPinHash { get; set; } = "";

    /// <summary>DEV ONLY. A SYSTEM-owned folder watched for command JSON files. Empty = disabled (default).</summary>
    public string DevCommandDir { get; set; } = "";
}

/// <summary>
/// Real OS boot identity. Uses the PrefetchParameters BootId counter (increments every boot) so a service restart
/// within the same boot keeps the same id and the monotonic anchors stay valid. Marked "to verify" in the spike doc.
/// </summary>
public sealed class WindowsBootClock : IAgentClock
{
    public WindowsBootClock() => BootId = ReadBootId();

    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
    public long MonotonicMs => Environment.TickCount64;
    public Guid BootId { get; }

    private static Guid ReadBootId()
    {
        try
        {
            using var k = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management\PrefetchParameters");
            if (k?.GetValue("BootId") is int id)
            {
                var bytes = new byte[16];
                BitConverter.GetBytes(id).CopyTo(bytes, 0);
                return new Guid(bytes);
            }
        }
        catch (Exception e) when (e is System.Security.SecurityException or UnauthorizedAccessException or IOException)
        {
            // fall through
        }
        // Fallback: never matches a persisted value, so recovery treats this as a reboot (safe: locks, re-evaluates).
        return Guid.NewGuid();
    }
}
