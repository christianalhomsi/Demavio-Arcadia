using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text.Json;
using Arcadia.Agent.Link;
using Arcadia.Contracts;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Arcadia.Agent.Service;

/// <summary>
/// Credentials at rest (security doc section 2): DPAPI LocalMachine blob in a folder that only SYSTEM and
/// Administrators can read. A standard player account cannot open it.
/// </summary>
public sealed class DpapiCredentialStore(AgentOptions options) : ICredentialStore
{
    private string FilePath => Path.Combine(Path.GetDirectoryName(options.StatePath)!, "link.dat");

    public LinkCredentials? Load()
    {
        try
        {
            if (!File.Exists(FilePath)) return null;
            var json = ProtectedData.Unprotect(File.ReadAllBytes(FilePath), null, DataProtectionScope.LocalMachine);
            return JsonSerializer.Deserialize<LinkCredentials>(json, ContractJson.Options);
        }
        catch (Exception e) when (e is IOException or CryptographicException or JsonException or UnauthorizedAccessException)
        {
            return null; // unreadable == not paired; the agent stays locked and keeps running local sessions
        }
    }

    public void Save(LinkCredentials credentials)
    {
        var dir = Path.GetDirectoryName(FilePath)!;
        Directory.CreateDirectory(dir);
        LockDown(dir);
        var blob = ProtectedData.Protect(JsonSerializer.SerializeToUtf8Bytes(credentials, ContractJson.Options), null, DataProtectionScope.LocalMachine);
        var tmp = FilePath + ".tmp";
        File.WriteAllBytes(tmp, blob);
        File.Move(tmp, FilePath, overwrite: true);
    }

    /// <summary>SYSTEM + Administrators only, no inherited rights (so BUILTIN\Users cannot read state or credentials).</summary>
    private static void LockDown(string dir)
    {
        var di = new DirectoryInfo(dir);
        var sec = new DirectorySecurity();
        sec.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);
        foreach (var sid in new[] { WellKnownSidType.LocalSystemSid, WellKnownSidType.BuiltinAdministratorsSid })
            sec.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(sid, null), FileSystemRights.FullControl,
                InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
        di.SetAccessControl(sec);
    }
}

/// <summary>Runs the Hall Server link inside the service (only does anything once the PC is paired).</summary>
public sealed class HallLinkService(ICredentialStore store, AgentWorker worker, ILoggerFactory lf) : BackgroundService
{
    protected override Task ExecuteAsync(CancellationToken ct) =>
        new HallLinkClient(store, worker, lf.CreateLogger<HallLinkClient>()).RunAsync(ct);
}
