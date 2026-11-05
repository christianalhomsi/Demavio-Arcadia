using System.Security.Cryptography;

namespace Arcadia.Agent.Core;

/// <summary>
/// Technician PIN check (security doc section 2). Stores only a PBKDF2-SHA256 hash:
/// "pbkdf2$iterations$saltB64$hashB64". The PIN itself never touches disk.
/// </summary>
public static class PinVerifier
{
    private const int Iterations = 210_000;

    public static string Hash(string pin)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(pin, salt, Iterations, HashAlgorithmName.SHA256, 32);
        return $"pbkdf2${Iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }

    public static bool Verify(string pin, string? stored)
    {
        if (string.IsNullOrEmpty(stored) || string.IsNullOrEmpty(pin)) return false;
        var parts = stored.Split('$');
        if (parts.Length != 4 || parts[0] != "pbkdf2" || !int.TryParse(parts[1], out var iter) || iter < 10_000) return false;
        try
        {
            var salt = Convert.FromBase64String(parts[2]);
            var expected = Convert.FromBase64String(parts[3]);
            var actual = Rfc2898DeriveBytes.Pbkdf2(pin, salt, iter, HashAlgorithmName.SHA256, expected.Length);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch (FormatException)
        {
            return false;
        }
    }
}

/// <summary>Sliding-window limiter for PIN attempts (security doc: 5 tries a minute).</summary>
public sealed class AttemptLimiter(int max = 5, TimeSpan? window = null)
{
    private readonly Queue<DateTimeOffset> _hits = new();
    private readonly TimeSpan _window = window ?? TimeSpan.FromMinutes(1);

    public bool TryAcquire(DateTimeOffset now)
    {
        while (_hits.Count > 0 && now - _hits.Peek() > _window) _hits.Dequeue();
        if (_hits.Count >= max) return false;
        _hits.Enqueue(now);
        return true;
    }
}
