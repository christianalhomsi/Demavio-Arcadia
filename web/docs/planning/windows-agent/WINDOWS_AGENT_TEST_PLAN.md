# Windows Agent — Test Plan

Environments: CI (unit tests and contract tests, with no Windows UI); Windows lab with 3 PCs (Win10 22H2, Win11 23H2 and Win11 24H2), a cashier PC, a managed switch and a UPS; a Supabase branch database.

## 1. Unit tests (CI)
| ID | Area | Cases |
|---|---|---|
| U-01 | Command validation (contract §5) | unauthorized, unsupported version, duplicate `command_id`, expired, out-of-order (UNLOCK rejected, LOCK applied), stale revision |
| U-02 | Revision rules | `rev > max` applies; `==` with the same id → duplicate; `<` → STALE; END with a stale revision is never applied after EXTEND |
| U-03 | Lock reconciler | every cell of the session × lock matrix → expected correction |
| U-04 | Time evaluation | same boot; reboot trusted, estimated or uncertain; clock jump of +1 h and −1 h; drift of 119 s and 121 s |
| U-05 | Cache freshness | fresh/expired boundary; duration crossing `valid_until`; override cap of 60 min; override denied without the permission |
| U-06 | State persistence | atomic write; corrupt main file → backup; both corrupt → Unknown + Locked |
| U-07 | Pricing snapshot | the snapshot is immutable; provisional amount matches the cloud calculation for the same snapshot |
| U-08 | Offline-op envelope | serialisation round-trip; `client_op_id` uniqueness generator (uuid v7 ordering) |

## 2. Integration tests
| ID | Scenario | Pass criteria |
|---|---|---|
| I-01 | Pairing with a one-time code | code consumed; reuse is rejected; expired code (11 min) rejected |
| I-02 | mTLS | an agent without a certificate, or with a certificate from another CA, is rejected; a spoofed mDNS server fails the handshake |
| I-03 | Durable delivery | Realtime disabled → command still delivered by pull in ≤ 5 s |
| I-04 | Reconnect reconciliation | server offline for 2 min with 5 commands queued → all delivered once, expired ones marked Expired |
| I-05 | Report idempotency | the same report sent 3× → one transition |
| I-06 | Offline sync idempotency | outbox replayed 3× → exactly one session and one invoice per operation (**G4**: 1,000 operations) |
| I-07 | Conflict | a cloud reservation is created during an outage overlapping an offline session → conflict review row, the reservation is unchanged, the invoice isn't final |
| I-08 | Pricing change during an outage | invoice uses the snapshot and is flagged `priced_from_offline_snapshot` |
| I-09 | Offline pass | expired pass rejected; replayed `op_nonce` rejected; missing permission rejected; revoked employee rejected after sync |
| I-10 | Local page CSRF/Origin | a cross-origin POST is rejected; a request without the token is rejected |
| I-11 | Tenant isolation | a hall-A credential calling with `hall_id` = B is rejected and audited |
| I-12 | Revision after server restore | restore an old backup → the server waits for agent reports and issues `max + 1`; the agent flags REVISION_REGRESSION if it's lower |

## 3. Crash, reboot and chaos tests (Windows lab)
| ID | Scenario | Expected |
|---|---|---|
| C-01 | Kill Agent.Shell during an active session | relaunched ≤ 3 s; timer resumes with the same revision |
| C-02 | Kill Agent.Shell repeatedly (10× in a minute) | escalates to LockWorkStation, then logoff; alert raised |
| C-03 | Kill Agent.Service | SCM restart ≤ 5 s; recovery; staff alert after a 30 s gap |
| C-04 | Reboot during an active session (server reachable) | boots Locked; server confirms; unlocks with the correct remaining time (±2 s) |
| C-05 | Reboot during an active session (server down) | unlocks only if the evaluation is trusted or estimated; otherwise stays Locked with "Waiting for staff" |
| C-06 | Power cut during the state write | on boot, state is restored from `.bak` or Unknown; **never auto-unlocked** if uncertain |
| C-07 | Corrupt `state.json` and `.bak` | Unknown + Locked + alert |
| C-08 | Clock moved +2 h during a session (admin) | CLOCK_EVENT; countdown unaffected (monotonic); audit entry |
| C-09 | Clock moved, then reboot | evaluation is uncertain → locks at the earliest end time; staff resume flow works |
| C-10 | LAN cable pulled mid-session | locks at end_at ±2 s (**G2**) |
| C-11 | SHUTDOWN, network cut right after Ack | no re-issue; after the boot it's reconciled as Executed by boot_id (**G3**: 0 duplicates across 100 runs) |
| C-12 | RESTART lost before Ack | command TimedOut; **not** retried automatically; staff see "outcome unknown" |
| C-13 | Cashier PC power cut while offline with 20 operations in the outbox | after reboot: integrity check OK and 20 operations still pending; synced exactly once |
| C-14 | Cashier PC replaced (restore runbook) | done ≤ 30 min; old credential revoked; agents re-paired; revisions continue |
| C-15 | Stale revision fuzz: random reordering of 10,000 START/EXTEND/END messages | the end time applied is always the newest revision (**G5**) |
| C-16 | Internet down for 4 h | cache expires → starts blocked; manager override works (one session, ≤ 60 min, audited) |

## 4. Lock-timing harness (G1)
- The agent writes high-resolution marks: `t0 = end_at` (monotonic), and `t1` = overlay rendered on every monitor.
- 200 runs per OS build and on 1, 2 and 3 monitors. Report p50, p95 and max. Pass: p95 ≤ 2 s.
- Separate measurements: cloud LOCK end-to-end (p95 ≤ 5 s), UI-crash recovery (≤ 3 s).
- Not measurable automatically (manual sign-off): service-down gap, DWM hang, hardware failure.

## 5. Security and bypass tests (manual pen-test checklist, G7)
Standard player user with the GPO baseline, while Locked:
- Alt+Tab, Win key, Ctrl+Esc, Alt+F4, Ctrl+Shift+Esc, Ctrl+Alt+Del → Task Manager or sign out;
- Win+L followed by signing back in; touch or edge gestures; a second monitor plugged in while locked;
- starting a process through Steam overlay/Big Picture shortcuts; the game launcher's "restart";
- stopping the service through `sc`; deleting or editing `%ProgramData%\Arcadia`; changing the system time;
- connecting to the named pipe from another process (only the UI with the nonce may succeed);
- safe-mode boot (documented: requires a BIOS or boot-menu password, handled manually).

## 6. Compatibility (G8)
Under the standard user with the GPO baseline: Steam, Epic, Battle.net, Riot (Vanguard), FACEIT, EasyAntiCheat and BattlEye titles. Each must install (by an admin), launch, update and play for 15 min, with lock and unlock during and after the session.

## 7. Traceability
Each go/no-go criterion (G1–G9 in the [comparison doc](WINDOWS_AGENT_ARCHITECTURE_COMPARISON.md) §9) maps to the tests above: G1 → §4; G2 → C-10; G3 → C-11/C-12; G4 → I-06; G5 → C-15/U-02; G6 → C-04..C-07; G7 → §5; G8 → §6; G9 → the spike doc.
