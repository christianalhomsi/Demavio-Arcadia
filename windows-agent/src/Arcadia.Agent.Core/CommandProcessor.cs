using System.Text.Json;
using Arcadia.Contracts;

namespace Arcadia.Agent.Core;

public enum DecisionKind { Accept, Reject, Duplicate }

public sealed record Decision(DecisionKind Kind, FailureReason Reason = FailureReason.None, CommandResult? Stored = null);

/// <summary>
/// Validation and application of commands, exactly as in the contract doc section 5. Pure logic: no I/O,
/// so every rule (duplicate, expired, stale revision, out-of-order, unauthorized) is unit-testable.
/// </summary>
public static class CommandProcessor
{
    public const int SupportedPayloadVersion = 1;

    /// <param name="nowEstUtc">Local UTC corrected by the last measured server offset (or local UTC if none).</param>
    public static Decision Evaluate(CommandEnvelope c, AgentState state, DateTimeOffset nowEstUtc)
    {
        if (c.TenantId != state.TenantId || c.AgentId != state.AgentId || c.StationId != state.StationId)
            return new Decision(DecisionKind.Reject, FailureReason.UNAUTHORIZED);

        if (c.PayloadVersion != SupportedPayloadVersion)
            return new Decision(DecisionKind.Reject, FailureReason.UNSUPPORTED_VERSION);

        if (state.FindResult(c.CommandId) is { } stored)
            return new Decision(DecisionKind.Duplicate, FailureReason.DUPLICATE, stored);

        // Locking is always safe, so a late LOCK / END_SESSION is still considered; everything else is order-checked.
        if (c.DeviceSeq <= state.LastDeviceSeq &&
            c.Type is CommandType.UNLOCK or CommandType.START_SESSION or CommandType.EXTEND_SESSION)
            return new Decision(DecisionKind.Reject, FailureReason.OUT_OF_ORDER);

        if (nowEstUtc > c.ExpiresAt)
            return new Decision(DecisionKind.Reject, FailureReason.EXPIRED);

        switch (c.Type)
        {
            case CommandType.START_SESSION:
            case CommandType.EXTEND_SESSION:
            case CommandType.END_SESSION:
            {
                var p = TryPayload<SessionPayload>(c);
                if (p is null) return new Decision(DecisionKind.Reject, FailureReason.UNSUPPORTED_VERSION);
                // Strict: anything <= the highest revision seen is stale (an exact duplicate was handled above).
                if (p.SessionRevision <= state.MaxRevisionFor(p.SessionId))
                    return new Decision(DecisionKind.Reject, FailureReason.STALE_REVISION);
                break;
            }
            case CommandType.LOCK:
            case CommandType.UNLOCK:
            {
                var p = TryPayload<LockPayload>(c);
                if (p is null) return new Decision(DecisionKind.Reject, FailureReason.UNSUPPORTED_VERSION);
                // Session-scoped lock/unlock may carry the current revision, but never an older one.
                if (p.SessionId is { } sid && p.SessionRevision is { } rev && rev < state.MaxRevisionFor(sid))
                    return new Decision(DecisionKind.Reject, FailureReason.STALE_REVISION);
                break;
            }
            case CommandType.SHUTDOWN:
            case CommandType.RESTART:
                if (TryPayload<PowerPayload>(c) is null) return new Decision(DecisionKind.Reject, FailureReason.UNSUPPORTED_VERSION);
                break;
        }

        return new Decision(DecisionKind.Accept);
    }

    /// <summary>
    /// Applies an accepted command to the state. The caller persists the state BEFORE acknowledging.
    /// Power commands only record <see cref="AgentState.PendingPower"/>; the service executes them.
    /// </summary>
    public static void Apply(CommandEnvelope c, AgentState state, IAgentClock clock)
    {
        state.LastDeviceSeq = Math.Max(state.LastDeviceSeq, c.DeviceSeq);
        var now = clock.UtcNow;
        var mono = clock.MonotonicMs;

        switch (c.Type)
        {
            case CommandType.START_SESSION:
            {
                var p = TryPayload<SessionPayload>(c)!;
                state.MaxSeenRevision[p.SessionId] = p.SessionRevision;
                state.Session = new SessionRecord
                {
                    SessionId = p.SessionId,
                    Revision = p.SessionRevision,
                    State = SessionState.Active,
                    StartAtServerUtc = p.StartAtUtc,
                    DurationMs = NormalizeDuration(p),
                    WarnAtMs = p.WarnAtMs ?? [300_000, 60_000],
                    CheckpointBootId = clock.BootId,
                    CheckpointElapsedMs = 0,
                    CheckpointMonoMs = mono,
                    CheckpointWallUtc = now,
                };
                state.StaffLock = false;
                state.StaffUnlock = false;
                break;
            }
            case CommandType.EXTEND_SESSION:
            {
                var p = TryPayload<SessionPayload>(c)!;
                state.MaxSeenRevision[p.SessionId] = p.SessionRevision;
                if (state.Session is { } s && s.SessionId == p.SessionId && s.State == SessionState.Active)
                {
                    // Freeze elapsed time first, then swap in the new authoritative duration.
                    var e = TimeEvaluator.Evaluate(s, now, mono, clock.BootId, null);
                    TimeEvaluator.Checkpoint(s, e, now, mono, clock.BootId);
                    s.Revision = p.SessionRevision;
                    s.DurationMs = NormalizeDuration(p);
                    if (p.WarnAtMs is not null) s.WarnAtMs = p.WarnAtMs;
                }
                break;
            }
            case CommandType.END_SESSION:
            {
                var p = TryPayload<SessionPayload>(c)!;
                state.MaxSeenRevision[p.SessionId] = p.SessionRevision;
                if (state.Session is { } s && s.SessionId == p.SessionId)
                {
                    s.State = SessionState.Ended;
                    s.Revision = p.SessionRevision;
                }
                state.StaffUnlock = false;
                break;
            }
            case CommandType.LOCK:
                state.StaffLock = true;
                state.StaffUnlock = false;
                break;
            case CommandType.UNLOCK:
                state.StaffLock = false;
                state.StaffUnlock = true;
                break;
            case CommandType.SHUTDOWN:
            case CommandType.RESTART:
            {
                var p = TryPayload<PowerPayload>(c)!;
                // Dangerous: written to disk before execution; never retried automatically (contract section 5).
                state.PendingPower = new PendingPower
                {
                    CommandId = c.CommandId,
                    Kind = c.Type,
                    BootId = clock.BootId,
                    RequestedAtUtc = now,
                    GraceSeconds = Math.Clamp(p.GraceSeconds, 5, 300),
                };
                break;
            }
            case CommandType.SYNC_STATE:
                break;
        }
    }

    private static long NormalizeDuration(SessionPayload p) =>
        p.DurationMs > 0 ? p.DurationMs
        : p.EndAtUtc is { } end ? Math.Max(0, (long)(end - p.StartAtUtc).TotalMilliseconds)
        : long.MaxValue / 4; // open-ended session

    public static T? TryPayload<T>(CommandEnvelope c) where T : class
    {
        try { return c.Payload.Deserialize<T>(ContractJson.Options); }
        catch (JsonException) { return null; }
    }
}
