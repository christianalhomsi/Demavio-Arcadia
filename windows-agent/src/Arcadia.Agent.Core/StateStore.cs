using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Arcadia.Contracts;

namespace Arcadia.Agent.Core;

/// <summary>
/// Atomic, checksummed persistence (offline doc section 4): write temp, flush to disk, then File.Replace with a
/// backup. File layout: first line = SHA-256 of the JSON body, rest = JSON. Falls back to the .bak on corruption.
/// </summary>
public sealed class StateStore(string path)
{
    private string Bak => path + ".bak";
    private string Tmp => path + ".tmp";

    public void Save(AgentState state)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
        var json = JsonSerializer.Serialize(state, ContractJson.Options);
        var content = Hash(json) + "\n" + json;

        using (var fs = new FileStream(Tmp, FileMode.Create, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough))
        {
            var bytes = Encoding.UTF8.GetBytes(content);
            fs.Write(bytes, 0, bytes.Length);
            fs.Flush(flushToDisk: true);
        }

        if (File.Exists(path)) File.Replace(Tmp, path, Bak, ignoreMetadataErrors: true);
        else File.Move(Tmp, path);
    }

    /// <returns>The state, or null if both the main file and the backup are missing/corrupt.</returns>
    public (AgentState? State, bool UsedBackup, bool Corrupt) Load()
    {
        var main = TryRead(path);
        if (main is not null) return (main, false, false);
        var bak = TryRead(Bak);
        if (bak is not null) return (bak, true, false);
        var anyFile = File.Exists(path) || File.Exists(Bak);
        return (null, false, anyFile);
    }

    private static AgentState? TryRead(string file)
    {
        try
        {
            if (!File.Exists(file)) return null;
            var text = File.ReadAllText(file, Encoding.UTF8);
            var nl = text.IndexOf('\n');
            if (nl < 0) return null;
            var sum = text[..nl].Trim();
            var json = text[(nl + 1)..];
            if (!string.Equals(sum, Hash(json), StringComparison.OrdinalIgnoreCase)) return null;
            return JsonSerializer.Deserialize<AgentState>(json, ContractJson.Options);
        }
        catch (Exception e) when (e is IOException or JsonException or UnauthorizedAccessException)
        {
            return null;
        }
    }

    private static string Hash(string json) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(json)));
}
