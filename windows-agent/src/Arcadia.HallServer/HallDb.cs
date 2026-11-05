using System.Text.Json;
using Arcadia.Contracts;
using Microsoft.Data.Sqlite;

namespace Arcadia.HallServer;

public sealed record AgentRecord(Guid AgentId, Guid StationId, Guid TenantId, string CertThumbprint, DateTimeOffset PairedAt, bool Revoked);

public sealed record StoredCommand(Guid CommandId, Guid StationId, long DeviceSeq, CommandStatus Status, CommandEnvelope Envelope, DateTimeOffset ExpiresAt);

/// <summary>
/// Durable hall state in SQLite (offline doc section 8: WAL, synchronous=FULL). Holds the agent registry, per-device
/// sequence numbers, per-session revisions and the command outbox. Every revision / sequence bump is committed
/// BEFORE the command is sent, so a crash can never hand out the same number twice.
/// </summary>
public sealed class HallDb
{
    private readonly string _cs;

    public HallDb(string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
        _cs = new SqliteConnectionStringBuilder { DataSource = path, Pooling = false }.ToString();
        using var c = Open();
        Exec(c, "PRAGMA journal_mode=WAL;");
        Exec(c, """
            CREATE TABLE IF NOT EXISTS agents(
              agent_id TEXT PRIMARY KEY, station_id TEXT NOT NULL UNIQUE, tenant_id TEXT NOT NULL,
              cert_thumbprint TEXT NOT NULL, machine_fp TEXT NOT NULL, paired_at TEXT NOT NULL, revoked_at TEXT);
            CREATE TABLE IF NOT EXISTS device_seq(station_id TEXT PRIMARY KEY, seq INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS sessions(session_id TEXT PRIMARY KEY, revision INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS commands(
              command_id TEXT PRIMARY KEY, station_id TEXT NOT NULL, device_seq INTEGER NOT NULL, type TEXT NOT NULL,
              status TEXT NOT NULL, envelope_json TEXT NOT NULL, result_json TEXT, created_at TEXT NOT NULL,
              expires_at TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE);
            CREATE INDEX IF NOT EXISTS ix_cmd_station ON commands(station_id, status, device_seq);
            """);
    }

    private SqliteConnection Open()
    {
        var c = new SqliteConnection(_cs);
        c.Open();
        Exec(c, "PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
        return c;
    }

    private static void Exec(SqliteConnection c, string sql, params (string, object?)[] p)
    {
        using var cmd = c.CreateCommand();
        cmd.CommandText = sql;
        foreach (var (n, v) in p) cmd.Parameters.AddWithValue(n, v ?? DBNull.Value);
        cmd.ExecuteNonQuery();
    }

    /// <summary>Startup integrity check (offline doc section 8). Returns "ok" or the first problem.</summary>
    public string QuickCheck()
    {
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = "PRAGMA quick_check;";
        return (string?)cmd.ExecuteScalar() ?? "unknown";
    }

    // ---- agents ----

    public void RegisterAgent(AgentRecord a, string machineFp)
    {
        using var c = Open();
        Exec(c, """
            INSERT INTO agents(agent_id,station_id,tenant_id,cert_thumbprint,machine_fp,paired_at,revoked_at)
            VALUES($a,$s,$t,$th,$fp,$at,NULL)
            ON CONFLICT(station_id) DO UPDATE SET agent_id=$a, tenant_id=$t, cert_thumbprint=$th, machine_fp=$fp,
              paired_at=$at, revoked_at=NULL
            """,
            ("$a", a.AgentId.ToString()), ("$s", a.StationId.ToString()), ("$t", a.TenantId.ToString()),
            ("$th", a.CertThumbprint), ("$fp", machineFp), ("$at", a.PairedAt.ToString("o")));
    }

    public AgentRecord? FindAgentByThumbprint(string thumbprint)
    {
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT agent_id,station_id,tenant_id,cert_thumbprint,paired_at,revoked_at FROM agents WHERE cert_thumbprint=$t";
        cmd.Parameters.AddWithValue("$t", thumbprint);
        using var r = cmd.ExecuteReader();
        if (!r.Read()) return null;
        return new AgentRecord(Guid.Parse(r.GetString(0)), Guid.Parse(r.GetString(1)), Guid.Parse(r.GetString(2)),
            r.GetString(3), DateTimeOffset.Parse(r.GetString(4)), !r.IsDBNull(5));
    }

    public AgentRecord? FindAgentByStation(Guid stationId)
    {
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT agent_id,station_id,tenant_id,cert_thumbprint,paired_at,revoked_at FROM agents WHERE station_id=$s";
        cmd.Parameters.AddWithValue("$s", stationId.ToString());
        using var r = cmd.ExecuteReader();
        if (!r.Read()) return null;
        return new AgentRecord(Guid.Parse(r.GetString(0)), Guid.Parse(r.GetString(1)), Guid.Parse(r.GetString(2)),
            r.GetString(3), DateTimeOffset.Parse(r.GetString(4)), !r.IsDBNull(5));
    }

    /// <summary>Looks up a command by idempotency key (re-pulled commands must not burn a new revision).</summary>
    public StoredCommand? GetByKey(string idempotencyKey)
    {
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT envelope_json,status FROM commands WHERE idempotency_key=$k";
        cmd.Parameters.AddWithValue("$k", idempotencyKey);
        using var r = cmd.ExecuteReader();
        if (!r.Read()) return null;
        var env = JsonSerializer.Deserialize<CommandEnvelope>(r.GetString(0), ContractJson.Options)!;
        return new StoredCommand(env.CommandId, env.StationId, env.DeviceSeq, Enum.Parse<CommandStatus>(r.GetString(1)), env, env.ExpiresAt);
    }

    public Guid? GetStation(Guid commandId)
    {
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT station_id FROM commands WHERE command_id=$id";
        cmd.Parameters.AddWithValue("$id", commandId.ToString());
        return cmd.ExecuteScalar() is string s ? Guid.Parse(s) : null;
    }

    public void RevokeAgent(Guid agentId)
    {
        using var c = Open();
        Exec(c, "UPDATE agents SET revoked_at=$at WHERE agent_id=$a", ("$at", DateTimeOffset.UtcNow.ToString("o")), ("$a", agentId.ToString()));
    }

    // ---- sequences / revisions (committed before sending) ----

    public long NextRevision(Guid sessionId)
    {
        using var c = Open();
        using var tx = c.BeginTransaction();
        using var cmd = c.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = """
            INSERT INTO sessions(session_id,revision) VALUES($s,1)
            ON CONFLICT(session_id) DO UPDATE SET revision=revision+1 RETURNING revision
            """;
        cmd.Parameters.AddWithValue("$s", sessionId.ToString());
        var rev = (long)cmd.ExecuteScalar()!;
        tx.Commit();
        return rev;
    }

    /// <summary>Raises the stored revision to at least what an agent reports (server-restore protection, contract section 4).</summary>
    public void RaiseRevisionFloor(Guid sessionId, long revision)
    {
        using var c = Open();
        Exec(c, """
            INSERT INTO sessions(session_id,revision) VALUES($s,$r)
            ON CONFLICT(session_id) DO UPDATE SET revision=MAX(revision,$r)
            """, ("$s", sessionId.ToString()), ("$r", revision));
    }

    public long CurrentRevision(Guid sessionId)
    {
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT revision FROM sessions WHERE session_id=$s";
        cmd.Parameters.AddWithValue("$s", sessionId.ToString());
        return cmd.ExecuteScalar() is long l ? l : 0;
    }

    // ---- command outbox ----

    /// <summary>
    /// Persists a command with the next per-device sequence number. Idempotent on <paramref name="idempotencyKey"/>:
    /// a second enqueue with the same key returns the original command instead of creating a duplicate.
    /// </summary>
    public StoredCommand Enqueue(Guid commandId, Guid tenantId, Guid stationId, Guid agentId, CommandType type,
        object payload, string idempotencyKey, TimeSpan ttl, DateTimeOffset now)
    {
        using var c = Open();
        using var tx = c.BeginTransaction();

        using (var find = c.CreateCommand())
        {
            find.Transaction = tx;
            find.CommandText = "SELECT envelope_json,status FROM commands WHERE idempotency_key=$k";
            find.Parameters.AddWithValue("$k", idempotencyKey);
            using var r = find.ExecuteReader();
            if (r.Read())
            {
                var env0 = JsonSerializer.Deserialize<CommandEnvelope>(r.GetString(0), ContractJson.Options)!;
                return new StoredCommand(env0.CommandId, env0.StationId, env0.DeviceSeq, Enum.Parse<CommandStatus>(r.GetString(1)), env0, env0.ExpiresAt);
            }
        }

        long seq;
        using (var s = c.CreateCommand())
        {
            s.Transaction = tx;
            s.CommandText = """
                INSERT INTO device_seq(station_id,seq) VALUES($s,1)
                ON CONFLICT(station_id) DO UPDATE SET seq=seq+1 RETURNING seq
                """;
            s.Parameters.AddWithValue("$s", stationId.ToString());
            seq = (long)s.ExecuteScalar()!;
        }

        var env = new CommandEnvelope(commandId, Guid.NewGuid(), idempotencyKey, tenantId, null, stationId, agentId, seq,
            now, now + ttl, type, 1, JsonSerializer.SerializeToElement(payload, ContractJson.Options));
        using (var ins = c.CreateCommand())
        {
            ins.Transaction = tx;
            ins.CommandText = """
                INSERT INTO commands(command_id,station_id,device_seq,type,status,envelope_json,created_at,expires_at,idempotency_key)
                VALUES($id,$s,$q,$t,'Queued',$j,$c,$e,$k)
                """;
            ins.Parameters.AddWithValue("$id", commandId.ToString());
            ins.Parameters.AddWithValue("$s", stationId.ToString());
            ins.Parameters.AddWithValue("$q", seq);
            ins.Parameters.AddWithValue("$t", type.ToString());
            ins.Parameters.AddWithValue("$j", JsonSerializer.Serialize(env, ContractJson.Options));
            ins.Parameters.AddWithValue("$c", now.ToString("o"));
            ins.Parameters.AddWithValue("$e", env.ExpiresAt.ToString("o"));
            ins.Parameters.AddWithValue("$k", idempotencyKey);
            ins.ExecuteNonQuery();
        }
        tx.Commit();
        return new StoredCommand(commandId, stationId, seq, CommandStatus.Queued, env, env.ExpiresAt);
    }

    /// <summary>Non-terminal commands for a station (Queued or Sent), in device_seq order.</summary>
    public List<StoredCommand> Pending(Guid stationId, long afterSeq = 0)
    {
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = """
            SELECT envelope_json,status FROM commands
            WHERE station_id=$s AND status IN ('Queued','Sent') AND device_seq>$q ORDER BY device_seq
            """;
        cmd.Parameters.AddWithValue("$s", stationId.ToString());
        cmd.Parameters.AddWithValue("$q", afterSeq);
        var list = new List<StoredCommand>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
        {
            var env = JsonSerializer.Deserialize<CommandEnvelope>(r.GetString(0), ContractJson.Options)!;
            list.Add(new StoredCommand(env.CommandId, env.StationId, env.DeviceSeq, Enum.Parse<CommandStatus>(r.GetString(1)), env, env.ExpiresAt));
        }
        return list;
    }

    public CommandStatus? GetStatus(Guid commandId)
    {
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT status FROM commands WHERE command_id=$id";
        cmd.Parameters.AddWithValue("$id", commandId.ToString());
        return cmd.ExecuteScalar() is string s ? Enum.Parse<CommandStatus>(s) : null;
    }

    private static bool IsTerminal(CommandStatus s) =>
        s is CommandStatus.Executed or CommandStatus.Failed or CommandStatus.Rejected or CommandStatus.Expired
            or CommandStatus.Canceled or CommandStatus.TimedOut;

    /// <summary>
    /// Monotonic transition: a terminal status is never overwritten, and a duplicate report is a no-op
    /// (contract section 9). Returns true if the row changed.
    /// </summary>
    public bool Transition(Guid commandId, CommandStatus to, CommandResult? result = null)
    {
        using var c = Open();
        using var tx = c.BeginTransaction();
        using var get = c.CreateCommand();
        get.Transaction = tx;
        get.CommandText = "SELECT status FROM commands WHERE command_id=$id";
        get.Parameters.AddWithValue("$id", commandId.ToString());
        if (get.ExecuteScalar() is not string cur) return false;
        var from = Enum.Parse<CommandStatus>(cur);
        if (IsTerminal(from) || from == to) return false;
        // Unknown can still resolve to a terminal result; otherwise only move forward.
        if (Rank(to) < Rank(from)) return false;

        using var upd = c.CreateCommand();
        upd.Transaction = tx;
        upd.CommandText = "UPDATE commands SET status=$st, result_json=COALESCE($r,result_json) WHERE command_id=$id";
        upd.Parameters.AddWithValue("$st", to.ToString());
        upd.Parameters.AddWithValue("$r", result is null ? DBNull.Value : JsonSerializer.Serialize(result, ContractJson.Options));
        upd.Parameters.AddWithValue("$id", commandId.ToString());
        upd.ExecuteNonQuery();
        tx.Commit();
        return true;
    }

    private static int Rank(CommandStatus s) => s switch
    {
        CommandStatus.Queued => 0,
        CommandStatus.Sent => 1,
        CommandStatus.Acknowledged => 2,
        CommandStatus.Unknown => 3,
        _ => 4,
    };

    /// <summary>Marks every Queued/Sent command past its expiry as Expired and returns them (never executed late).</summary>
    public List<Guid> ExpireDue(DateTimeOffset now)
    {
        using var c = Open();
        using var sel = c.CreateCommand();
        sel.CommandText = "SELECT command_id FROM commands WHERE status IN ('Queued','Sent') AND expires_at < $n";
        sel.Parameters.AddWithValue("$n", now.ToString("o"));
        var ids = new List<Guid>();
        using (var r = sel.ExecuteReader()) while (r.Read()) ids.Add(Guid.Parse(r.GetString(0)));
        foreach (var id in ids) Exec(c, "UPDATE commands SET status='Expired' WHERE command_id=$id", ("$id", id.ToString()));
        return ids;
    }
}
