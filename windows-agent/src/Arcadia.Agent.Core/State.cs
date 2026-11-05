using Arcadia.Contracts;

namespace Arcadia.Agent.Core;

/// <summary>Abstraction over every clock the agent uses (offline doc section 5).</summary>
public interface IAgentClock
{
    /// <summary>Local wall clock in UTC. Can be changed by a user; never trusted alone.</summary>
    DateTimeOffset UtcNow { get; }
    /// <summary>Monotonic milliseconds since this boot. Resets on reboot.</summary>
    long MonotonicMs { get; }
    /// <summary>Random id written once per boot; detects a reboot.</summary>
    Guid BootId { get; }
}

public sealed class SystemAgentClock : IAgentClock
{
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
    public long MonotonicMs => Environment.TickCount64;
    public Guid BootId { get; } = Guid.NewGuid();
}

/// <summary>Session record with the time anchors needed to survive restarts and reboots.</summary>
public sealed class SessionRecord
{
    public Guid SessionId { get; set; }
    public long Revision { get; set; }
    public SessionState State { get; set; } = SessionState.Pending;
    public DateTimeOffset StartAtServerUtc { get; set; }
    public long DurationMs { get; set; }
    public long[] WarnAtMs { get; set; } = [];

    // Anchors: elapsed time as of the last checkpoint, plus the clocks at that moment.
    public Guid CheckpointBootId { get; set; }
    public long CheckpointElapsedMs { get; set; }
    public long CheckpointMonoMs { get; set; }
    public DateTimeOffset CheckpointWallUtc { get; set; }
    /// <summary>Set when a wall-clock jump was observed after the last checkpoint.</summary>
    public bool ClockChangedSinceCheckpoint { get; set; }
}

public sealed class PendingPower
{
    public Guid CommandId { get; set; }
    public CommandType Kind { get; set; }
    public Guid BootId { get; set; }
    public DateTimeOffset RequestedAtUtc { get; set; }
    public int GraceSeconds { get; set; }
}

/// <summary>Everything the agent persists (offline doc section 4).</summary>
public sealed class AgentState
{
    public Guid AgentId { get; set; }
    public Guid TenantId { get; set; }
    public Guid StationId { get; set; }

    public long LastDeviceSeq { get; set; }
    public Dictionary<Guid, long> MaxSeenRevision { get; set; } = [];
    public SessionRecord? Session { get; set; }
    public List<CommandResult> SeenCommands { get; set; } = [];
    public PendingPower? PendingPower { get; set; }

    public bool StaffLock { get; set; }
    public bool StaffUnlock { get; set; }

    public const int MaxSeen = 200;

    public CommandResult? FindResult(Guid commandId) => SeenCommands.FirstOrDefault(r => r.CommandId == commandId);

    public void Remember(CommandResult result)
    {
        SeenCommands.RemoveAll(r => r.CommandId == result.CommandId);
        SeenCommands.Add(result);
        if (SeenCommands.Count > MaxSeen) SeenCommands.RemoveRange(0, SeenCommands.Count - MaxSeen);
    }

    public long MaxRevisionFor(Guid sessionId) => MaxSeenRevision.GetValueOrDefault(sessionId, 0);
}
