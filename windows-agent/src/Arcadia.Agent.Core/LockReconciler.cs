using Arcadia.Contracts;

namespace Arcadia.Agent.Core;

public enum LockAction { None, Lock, Unlock }

/// <summary>
/// Desired lock state is derived continuously from session state, remaining time, time reliability and staff
/// overrides (contract doc section 7). The timer is only one trigger; this runs every second regardless.
/// </summary>
public static class LockReconciler
{
    public static LockState Desired(AgentState state, TimeEvaluation? time)
    {
        // A staff LOCK always wins.
        if (state.StaffLock) return LockState.Locked;

        var s = state.Session;
        if (s is { State: SessionState.Active } && time is { } t)
        {
            // Never unlock when time is uncertain or the session ran out.
            if (t.Reliability != TimeReliability.Uncertain && t.RemainingMs > 0)
                return LockState.Unlocked;
            return LockState.Locked;
        }

        // Explicit staff unlock (maintenance / emergency) only when there is no unresolved session state.
        if (state.StaffUnlock && s is not { State: SessionState.Unknown })
            return LockState.Unlocked;

        return LockState.Locked;
    }

    public static LockAction NextAction(LockState actual, LockState desired) => desired switch
    {
        LockState.Locked when actual is not (LockState.Locked or LockState.Locking) => LockAction.Lock,
        LockState.Unlocked when actual is not (LockState.Unlocked or LockState.Unlocking) => LockAction.Unlock,
        _ => LockAction.None,
    };

    /// <summary>True for combinations the matrix marks invalid (e.g. Ended + Unlocked). The caller forces Locking and alerts.</summary>
    public static bool IsViolation(SessionState session, LockState lockState) => lockState == LockState.Unlocked && session != SessionState.Active;
}
