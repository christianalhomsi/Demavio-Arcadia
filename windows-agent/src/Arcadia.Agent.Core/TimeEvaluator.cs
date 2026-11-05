using Arcadia.Contracts;

namespace Arcadia.Agent.Core;

public readonly record struct TimeEvaluation(long ElapsedMs, long RemainingMs, TimeReliability Reliability);

/// <summary>
/// Elapsed-time evaluation (offline doc section 5). Within a boot the monotonic clock is authoritative.
/// After a reboot the monotonic clock has reset, so server time (if reachable) or a bounded wall-clock
/// estimate is used. When time is uncertain the pessimistic (earliest end) value is returned.
/// </summary>
public static class TimeEvaluator
{
    public static TimeEvaluation Evaluate(
        SessionRecord s,
        DateTimeOffset nowUtc,
        long monoNowMs,
        Guid currentBootId,
        TimeSpan? serverOffset)
    {
        long elapsed;
        TimeReliability reliability;

        if (s.CheckpointBootId == currentBootId)
        {
            elapsed = s.CheckpointElapsedMs + Math.Max(0, monoNowMs - s.CheckpointMonoMs);
            reliability = TimeReliability.Trusted;
        }
        else if (serverOffset is { } off)
        {
            // Server time is authoritative: elapsed since the server-issued start.
            var serverNow = nowUtc + off;
            elapsed = Math.Max(0, (long)(serverNow - s.StartAtServerUtc).TotalMilliseconds);
            reliability = TimeReliability.Trusted;
        }
        else
        {
            var wallDelta = (long)(nowUtc - s.CheckpointWallUtc).TotalMilliseconds;
            var estimate = s.CheckpointElapsedMs + Math.Max(0, wallDelta);
            var wallSinceStart = Math.Max(0, (long)(nowUtc - s.StartAtServerUtc).TotalMilliseconds);

            if (!s.ClockChangedSinceCheckpoint && wallDelta >= 0)
            {
                elapsed = estimate;
                reliability = TimeReliability.Estimated;
            }
            else
            {
                // Uncertain: assume the most time has passed so the session ends as early as plausible.
                elapsed = Math.Max(estimate, wallSinceStart);
                reliability = TimeReliability.Uncertain;
            }
        }

        elapsed = Math.Min(elapsed, Math.Max(s.DurationMs, 0));
        var remaining = Math.Max(0, s.DurationMs - elapsed);
        return new TimeEvaluation(elapsed, remaining, reliability);
    }

    /// <summary>Re-anchors the checkpoint to the current boot (called every ~15 s and on every command).</summary>
    public static void Checkpoint(SessionRecord s, TimeEvaluation e, DateTimeOffset nowUtc, long monoNowMs, Guid bootId)
    {
        s.CheckpointBootId = bootId;
        s.CheckpointElapsedMs = e.ElapsedMs;
        s.CheckpointMonoMs = monoNowMs;
        s.CheckpointWallUtc = nowUtc;
        s.ClockChangedSinceCheckpoint = false;
    }
}

/// <summary>Detects wall-clock jumps by comparing wall delta against monotonic delta (offline doc section 5).</summary>
public sealed class ClockMonitor(long thresholdMs = 5_000)
{
    private DateTimeOffset? _lastWall;
    private long _lastMono;

    /// <returns>The size of the jump in ms if the wall clock moved relative to the monotonic clock, else null.</returns>
    public long? Observe(DateTimeOffset wallUtc, long monoMs)
    {
        long? jump = null;
        if (_lastWall is { } lw)
        {
            var wallDelta = (long)(wallUtc - lw).TotalMilliseconds;
            var monoDelta = monoMs - _lastMono;
            var diff = wallDelta - monoDelta;
            if (Math.Abs(diff) > thresholdMs) jump = diff;
        }
        _lastWall = wallUtc;
        _lastMono = monoMs;
        return jump;
    }
}
