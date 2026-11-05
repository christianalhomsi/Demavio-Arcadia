using System.Text.Json;
using System.Text.Json.Serialization;

namespace Arcadia.Contracts;

/// <summary>Command types the agent understands (contract doc section 1).</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum CommandType { START_SESSION, EXTEND_SESSION, END_SESSION, LOCK, UNLOCK, SHUTDOWN, RESTART, SYNC_STATE }

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum CommandStatus { Queued, Sent, Acknowledged, Executed, Failed, TimedOut, Canceled, Expired, Rejected, Unknown }

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum FailureReason
{
    None, UNAUTHORIZED, UNSUPPORTED_VERSION, EXPIRED, STALE_REVISION, OUT_OF_ORDER, DUPLICATE,
    DEVICE_BUSY, LOCK_FAILED, UI_UNAVAILABLE, TIME_UNCERTAIN, POWER_DENIED, INTERNAL,
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum SessionState { Pending, Active, Ended, Unknown }

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum LockState { Locked, Locking, Unlocking, Unlocked, Error, Unknown }

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum TimeReliability { Trusted, Estimated, Uncertain }

/// <summary>Payload of START/EXTEND/END_SESSION (payload_version 1).</summary>
public sealed record SessionPayload(
    Guid SessionId,
    long SessionRevision,
    DateTimeOffset StartAtUtc,
    DateTimeOffset? EndAtUtc,
    long DurationMs,
    long[]? WarnAtMs = null);

public sealed record LockPayload(string Reason, Guid? SessionId, long? SessionRevision);

public sealed record PowerPayload(int GraceSeconds, string Reason);

/// <summary>Command envelope (contract doc section 1).</summary>
public sealed record CommandEnvelope(
    Guid CommandId,
    Guid ClientOpId,
    string IdempotencyKey,
    Guid TenantId,
    Guid? BranchId,
    Guid StationId,
    Guid AgentId,
    long DeviceSeq,
    DateTimeOffset CreatedAt,
    DateTimeOffset ExpiresAt,
    CommandType Type,
    int PayloadVersion,
    JsonElement Payload);

/// <summary>Stored/returned outcome of a command.</summary>
public sealed record CommandResult(
    Guid CommandId,
    CommandStatus Status,
    FailureReason FailureReason,
    LockState LockState,
    SessionState SessionState,
    long Revision,
    Guid BootId);

public static class ContractJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = false,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Converters = { new JsonStringEnumConverter() },
    };
}

// ---- Service <-> UI (named pipe, JSON lines, closed message set; security doc section 4) ----

/// <summary>Service -> UI. Kind is one of Show_Lock, Show_Timer, Warn, Hide.</summary>
public sealed record ServiceToUi(
    string Kind,
    string? HallName = null,
    string? DeviceName = null,
    string? StatusText = null,
    long RemainingMs = 0,
    long Revision = 0,
    string? WarnKind = null,
    int WarnSeconds = 0,
    long MsgId = 0);

/// <summary>UI -> Service. Kind is one of Hello, Ack, UiHeartbeat, TechUnlockRequest.</summary>
public sealed record UiToService(string Kind, string? Nonce = null, string? Pin = null, long MsgId = 0);

// ---- Agent <-> Hall Server (LAN, mTLS WebSocket, JSON text frames; contract doc section 8) ----

/// <summary>
/// Type is one of: HELLO, HEARTBEAT, RECOVERED, RESULT (agent to server); COMMAND, HEARTBEAT_ACK, ERROR (server to agent).
/// Flat on purpose: one small record keeps the closed message set easy to validate.
/// </summary>
public sealed record LinkMessage(
    string Type,
    Guid AgentId = default,
    Guid BootId = default,
    string? Version = null,
    long LastSeq = 0,
    DateTimeOffset? Utc = null,
    LockState? Lock = null,
    SessionState? Session = null,
    Guid? SessionId = null,
    long Revision = 0,
    long RemainingMs = 0,
    TimeReliability? Reliability = null,
    CommandEnvelope? Command = null,
    CommandResult? Result = null,
    string? Error = null);

/// <summary>First pairing step. The hall pairing code is one-time and expires in 10 minutes.</summary>
public sealed record PairRequest(string Code, Guid StationId, string MachineFingerprint, string CsrPem);

public sealed record PairResponse(Guid AgentId, Guid TenantId, Guid StationId, string ClientCertPem, string CaPem);
