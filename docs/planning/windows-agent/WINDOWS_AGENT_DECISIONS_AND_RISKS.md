# Windows Agent — Decisions & Risks

Format for each decision: **Decision · Reason · Alternatives · Risks · Validation · Scope**.

## Decision records

### WA-D01 — Topology: Agent → Hall Server → Cloud
- **Decision:** every PC agent talks only to a Hall Server on the cashier PC over the LAN. The server talks to the cloud.
- **Reason:** offline continuity (start, extend and end without the internet), LAN delivery, one cloud credential per hall.
- **Alternatives:** direct to the cloud; cloud with a fallback to the server; agent leader election.
- **Risks:** the cashier PC is a single point of failure for new operations.
- **Validation:** C-13, C-14, I-03/I-04.
- **Scope:** MVP.

### WA-D02 — .NET 10 LTS, self-contained
- **Decision:** all projects target .NET 10 LTS, published self-contained win-x64.
- **Reason:** LTS support window; no runtime install in the halls.
- **Alternatives:** .NET 8 (shorter remaining support); Rust or Electron.
- **Risks:** third-party libraries lag on net10 (mDNS, Supabase SDK); WPF has no trimming or AOT; larger binaries.
- **Validation:** the spike checklist is fully green or amber.
- **Scope:** MVP.

### WA-D03 — Station control: standard user + manual GPO baseline + WPF overlay
- **Decision:** the player is a standard auto-logon user. Restrictions come from a manually applied GPO baseline. The WPF lock is UX only. The SYSTEM service enforces the lock.
- **Reason:** works on Pro editions, compatible with Steam and anti-cheat, and gives a real OS permission boundary.
- **Alternatives:** Assigned Access (single-app blocks games; multi-app needs allow-list upkeep); Shell Launcher v2 (needs Enterprise); hooks only (bypassable).
- **Risks:** anti-cheat or launchers may need admin; a GPO gap lets players escape.
- **Validation:** G7 pen-test, G8 compatibility.
- **Scope:** MVP. Shell Launcher is Future.

### WA-D04 — Privilege separation and a closed IPC contract
- **Decision:** the SYSTEM service holds every privilege. The UI is display-only over an ACL named pipe with a per-boot nonce and a fixed message set. No remote shell anywhere.
- **Reason:** the player has physical access, so the UI must be assumed compromised.
- **Alternatives:** a single process running in the user session; gRPC over localhost TCP.
- **Risks:** launching into the session races the auto-logon.
- **Validation:** spike rows on WTS and pipe ACL; C-01..C-03.
- **Scope:** MVP.

### WA-D05 — Credentials: one-time pairing code, per-device credentials, mTLS with a pinned local CA
- **Decision:** credentials as described in the security model §2–3.
- **Reason:** a stolen credential's impact is limited to one device or hall; mDNS spoofing is defeated.
- **Alternatives:** a long-lived shared hall token (the original plan); PSK.
- **Risks:** CA lifecycle on server replacement means all agents must be re-paired.
- **Validation:** I-01, I-02, C-14.
- **Scope:** MVP.

### WA-D06 — No service-role key on PCs; `agent-bridge` Edge Function
- **Decision:** the cloud is reached only through an Edge Function that checks the hall-server credential and calls hall-scoped security-definer RPCs.
- **Reason:** least privilege and tenant isolation.
- **Alternatives:** direct PostgREST access with custom JWTs for each server.
- **Risks:** Edge Function cold starts add latency.
- **Validation:** I-11, latency measurements.
- **Scope:** MVP.

### WA-D07 — Durable pull with a cursor; Realtime only as a hint
- **Decision:** delivery is guaranteed by the pull (every 5 s, plus on reconnect and on a hint).
- **Reason:** Realtime can drop messages during reconnects.
- **Alternatives:** Realtime only; long polling.
- **Risks:** pull load (small: one per hall every 5 s).
- **Validation:** I-03, I-04.
- **Scope:** MVP.

### WA-D08 — Command lifecycle with expiry, `device_seq` and no automatic retry of dangerous commands
- **Decision:** the contract doc §2, §5.
- **Reason:** prevents a delayed UNLOCK, double shutdowns and stale actions.
- **Alternatives:** at-least-once with blind retry.
- **Risks:** more statuses for the UI to show (`Unknown`).
- **Validation:** C-11, C-12, U-01.
- **Scope:** MVP. The DB status enum is extended in a later migration.

### WA-D09 — `session_revision` per session
- **Decision:** an int64 issued by the Hall Server, strictly increasing; the agent rejects anything ≤ the last seen revision (except an exact duplicate). It's persisted on both sides, and recovered as max + 1.
- **Reason:** extensions and ends can arrive out of order or be replayed after a reconnect; timestamps aren't reliable.
- **Alternatives:** last write wins by timestamp; vector clocks.
- **Risks:** a server restored from an old backup reissues lower revisions. Mitigated by agent-reported max values and the REVISION_REGRESSION flag.
- **Validation:** U-02, C-15, I-12.
- **Scope:** MVP.

### WA-D10 — Separate session and lock state machines with a 1 s reconciler
- **Decision:** the contract doc §7. The desired lock state is derived continuously, not just from a timer event.
- **Reason:** the timer alone is a single point of failure (missed events, sleep, UI crash).
- **Alternatives:** timer-driven locking only.
- **Risks:** reconciler bugs could flap the lock. Hysteresis and tests cover this.
- **Validation:** U-03, C-01, C-02.
- **Scope:** MVP.

### WA-D11 — Reboot recovery defaults to Locked and never auto-unlocks on uncertainty
- **Decision:** the offline doc §6.
- **Reason:** losing a few minutes of play costs less than unpaid time or disputes.
- **Alternatives:** resume optimistically from the wall clock.
- **Risks:** staff intervention needed after an uncertain reboot.
- **Validation:** C-04..C-07.
- **Scope:** MVP.

### WA-D12 — Time model with monotonic countdown, boot anchors and drift detection
- **Decision:** the offline doc §5. If the time is uncertain, use the earliest end time; never extend.
- **Reason:** the Windows clock can't be trusted (user changes, a dead CMOS battery, NTP failure).
- **Alternatives:** trust the wall clock; require the internet for time.
- **Risks:** an estimated reboot evaluation can be off by the shutdown gap. Bounded and flagged.
- **Validation:** U-04, C-08, C-09.
- **Scope:** MVP.

### WA-D13 — Offline policies per operation; the cloud stays authoritative
- **Decision:** the offline doc §2. Supersedes "what happened offline wins".
- **Reason:** protects confirmed reservations and financial records.
- **Alternatives:** offline wins; block everything offline.
- **Risks:** conflict review workload for staff.
- **Validation:** I-06..I-08.
- **Scope:** MVP. Offline reservations are Future.

### WA-D14 — Reservation cache freshness gate plus a manager override
- **Decision:** the offline doc §3 (15 min default window; override limited to one session, ≤ 60 min, audited, always reviewed).
- **Reason:** an offline start is safe only when we know the station is free.
- **Alternatives:** no gate; an indefinite cache.
- **Risks:** long outages block starts, which the override handles; override abuse is audited.
- **Validation:** U-05, C-16.
- **Scope:** MVP (override behind a permission flag).

### WA-D15 — Immutable pricing snapshots and provisional amounts
- **Decision:** each offline session stores a snapshot with `pricing_version`. The cloud invoices from the snapshot and flags any difference.
- **Reason:** deterministic and auditable billing.
- **Alternatives:** reprice at sync with current prices.
- **Risks:** snapshot storage size (small).
- **Validation:** U-07, I-08.
- **Scope:** MVP.

### WA-D16 — Hall Server durability: WAL, FULL sync, hourly backups, a restore runbook, no HA
- **Decision:** the offline doc §8.
- **Reason:** acceptable for the MVP, with explicit limits.
- **Alternatives:** a standby server; cloud-only fallback.
- **Risks:** downtime on cashier PC failure.
- **Validation:** C-13, C-14.
- **Scope:** MVP. HA is Future.

### WA-D17 — Lock-timing targets separated by failure class
- **Decision:** the offline doc §9.
- **Reason:** a 2 s target is meaningful only for healthy local execution.
- **Alternatives:** one global SLA.
- **Risks:** none.
- **Validation:** the harness in the test plan §4.
- **Scope:** MVP.

### WA-D18 — Offline pass, online-only login
- **Decision:** a cloud-signed pass of ≤ 12 h, scoped to the employee, hall and permissions, with nonce replay protection. No offline login.
- **Reason:** the owner requires that nobody can sign in without the internet.
- **Alternatives:** per-employee PIN; a shared hall password.
- **Risks:** an employee who never signed in today can't operate offline.
- **Validation:** I-09.
- **Scope:** MVP.

### WA-D19 — Updates: manual MSI for the MVP; signed auto-update later
- **Decision:** as stated.
- **Reason:** keeps the MVP small.
- **Alternatives:** auto-update now.
- **Risks:** version skew across PCs (the contract is versioned).
- **Validation:** `payload_version` tests.
- **Scope:** MVP manual; auto-update is Future.

## Risk register

| ID | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | Anti-cheat or launchers fail under a standard user | Med | High | G8 compatibility suite; fallback is a per-title allow-list | Agent lead |
| R2 | Halls run Windows Home (no GPO) | Med | High | Document the minimum edition (Pro); Home uses registry equivalents applied manually | Product |
| R3 | Cashier PC failure halts new sessions | Med | High | UPS, restore runbook ≤ 30 min, future HA | Ops |
| R4 | Player bypasses the lock | Med | High | Standard user, GPO baseline, SYSTEM enforcement, pen-test | Security |
| R5 | Clock manipulation | Low | Med | Monotonic countdown, detection, safe fallback | Agent lead |
| R6 | Stale revision applied | Low | High | Revision rules, fuzz test | Agent lead |
| R7 | Double shutdown | Low | Med | No retry, boot_id reconciliation | Agent lead |
| R8 | Sync duplicates or financial drift | Low | High | `client_op_id` UNIQUE, snapshots, provisional separation | Backend |
| R9 | .NET 10 library gaps | Med | Med | Spike first; raw HTTP/WebSocket fallbacks | Agent lead |
| R10 | Local CA key theft on the cashier PC | Low | High | DPAPI + ACL, revocation, re-pair runbook | Security |
| R11 | Long internet outage blocks starts | Med | Med | Manager override, conflict review | Product |
| R12 | Conflict-review workload | Med | Low | Freshness gate keeps conflicts rare | Product |
| R13 | Win10 end of support | High | Med | Confirm .NET 10 support; recommend Win11 | Product |

## Brief-to-document traceability

| Brief item | Where |
|---|---|
| 1 Framework upgrade | Spike doc; WA-D02 |
| 2 Station control and security | Comparison doc §3; security doc §4–5; WA-D03/D04 |
| 3 Hall Server availability | Offline doc §8; WA-D16 |
| 4 Offline and financial | Offline doc §2, §7; WA-D13/D15 |
| 5 Security | Security doc; WA-D05/D06/D07/D18 |
| 6 Command contracts | Contract doc; WA-D08 |
| 7 Required output | This folder + backlog updates |
| 8 Final decision | Comparison doc §4–9 |
| R3-1 Session revision | Contract doc §4; offline doc §4; WA-D09 |
| R3-2 Reboot recovery | Offline doc §6; test plan C-04..C-07; WA-D11 |
| R3-3 Session vs lock state | Contract doc §7; WA-D10 |
| R3-4 Cache freshness | Offline doc §3; WA-D14 |
| R3-5 Time reliability | Offline doc §5; WA-D12 |
| R3-6 Lock-timing criteria | Offline doc §9; test plan §4; WA-D17 |

## Unresolved technical blockers (before implementation)
- [ ] Which Windows editions and builds the pilot halls actually run (Home / Pro / Enterprise).
- [ ] Anti-cheat and launcher behaviour under a standard user with the GPO baseline (G8).
- [ ] .NET 10 compatibility confirmed for every spike row, especially mDNS and Realtime over a raw WebSocket.
- [ ] A reliable boot UTC and boot-id source on Win10 22H2 and Win11.
- [ ] Launching the UI from SYSTEM into the auto-logon session without races.
- [ ] Local CA and mTLS certificate lifecycle, including the re-pair UX after server replacement.
- [ ] Cloud RPC design for `sync_offline_ops`, `pull_commands` and `report_command`, plus the status enum extension (`Expired`, `Rejected`, `Unknown`) and `payload` / `device_seq` / `session_revision` columns. Design only, as a later migration.
- [ ] Defaults to confirm: cache window 15 min, override cap 60 min, drift threshold 120 s, offline pass 12 h, local port 7420.
- [ ] A hardware requirement for the cashier PC (UPS, a second disk or USB for backups).
- [ ] A code-signing certificate (needed for SmartScreen and the future auto-update).
