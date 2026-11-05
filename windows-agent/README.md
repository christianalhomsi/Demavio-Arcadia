# Arcadia Windows Agent

Per-PC agent for the gaming hall SaaS. Design: [`web/docs/planning/windows-agent/`](../web/docs/planning/windows-agent/WINDOWS_AGENT_ARCHITECTURE_COMPARISON.md). Target: **.NET 10**, Windows 10/11.

**Installing in a hall: see [INSTALL.md](INSTALL.md).**

## What exists (phase 1: agent, phase 2: Hall Server, phase 3: installers and dashboard pairing page)

| Project | What it is |
|---|---|
| `src/Arcadia.Contracts` | Command envelope, payloads, enums, service-to-UI pipe messages (contract doc) |
| `src/Arcadia.Agent.Core` | Pure, unit-tested logic: command validation (duplicate / expired / out-of-order / stale revision / unauthorized), `session_revision` rules, session vs lock state machines (`LockReconciler`), time evaluation after reboot, clock-jump detection, atomic checksummed state store, technician PIN hashing |
| `src/Arcadia.Agent.Service` | Windows Service (SYSTEM). 1 s lock reconciler, reboot recovery, UI launcher into the player session, ACL-restricted named pipe with nonce, power commands (fixed `shutdown.exe` args), technician PIN unlock (rate-limited, audited) |
| `src/Arcadia.Agent.Shell` | WPF UI in the player session: full-screen lock on every monitor + countdown overlay. **UX only, not a security boundary** |
| `src/Arcadia.Agent.Link` | Agent side of the Hall Server link: pairing (CA fingerprint check, then pinned-CA only), mTLS WebSocket client, reconnect with backoff, heartbeat, server-time offset |
| `src/Arcadia.HallServer` | Hall Server (ASP.NET Core + SQLite): local CA, `/ca` + `/pair` + `/ws` over mTLS, per-device `device_seq`, server-issued `session_revision`, durable command outbox, expiry sweep, batched heartbeats, cloud bridge interface |
| `tests/Arcadia.Agent.Tests` | 49 unit tests (U-01..U-06 from the test plan) |
| `tests/Arcadia.HallServer.Tests` | 19 end-to-end tests + 13 bridge-client tests over real mTLS on loopback: pairing, spoofed server, foreign CA, revoked agent, offline queue, reconnect without double execution, revision order, idempotency, expiry, revision floor after restore |

## What does NOT exist yet
- **Cloud bridge: verified end to end on staging (2026-11-05), staging only.** A real Hall Server was paired with the project, a real agent client paired through it over mTLS, and cloud-queued commands were delivered and reported back: `START_SESSION` (session built from the cloud row: 60 min, revision 1), `SYNC_STATE` turned into `EXTEND_SESSION` (90 min, revision 2), `LOCK`, `SHUTDOWN` (the test client records power commands, it does not power off), each with the timeline `Queued > Sent > Executed`; heartbeats set `agents.version`, `sync_state` and `last_heartbeat_at`. Revoking the Hall Server in the cloud made the cloud reject it immediately and the next `LOCK` was not delivered. Not verified: the Windows Service and the WPF lock on a real PC (the test used the same link/command code in a console client), the production project, restart/recovery of the Hall Server against the cloud, a second Hall Server in the same hall.
- **Dashboard UI** to generate pairing codes, list/revoke Hall Servers (the RPCs exist; no web page calls them yet).
- **Unpairing a PC** from the dashboard and propagating the revoke to the Hall Server (certificate revocation); only Hall Server revocation exists.
- **Offline mode of the Hall Server:** outbox of local sessions, pricing snapshots, reservation-cache freshness, local page, sync and conflicts.
- Hall Server **as a Windows Service with installer**, mDNS discovery, hall-server credential refresh/revocation, CA rotation, agent re-pair UX.
- Keyboard hook, GPO baseline document, auto-update, automatic certificate renewal, unpairing a single PC from the dashboard.
- **Installers are written (`installer/`, WiX v5 MSIs + `Setup-*.ps1`) but have never been installed on a real PC.** `installer/build.ps1` builds `ArcadiaHallServer.msi` and `ArcadiaAgent.msi`.
- Everything under "To verify" in the spike doc has **not** been verified on real PCs yet: launching the UI from SYSTEM into the auto-logon session, the registry `BootId` as a boot identity, lock timing (G1), anti-cheat compatibility (G8). The mTLS link was verified only on loopback, not across a real LAN or firewall.
- Known gap vs the contract: the Hall Server does not yet wait for an agent report before issuing a revision after a restore (the 60 s gate); it only raises the floor when agents report.

## Pairing against the staging cloud (owner needs `hall.settings.manage`)
1. Owner calls `create_pairing_code(hall_id, 'hall_server')` (RPC exists on staging; dashboard UI pending, so call it from the SQL editor while signed in as the owner, or via the API) and gets `XXXX-XXXX-XXXX` (10 minutes, one use).
2. On the cashier PC: `Arcadia.HallServer.exe pair-server --url https://eojzkikvlviignmjxkhn.supabase.co/functions/v1/agent-bridge --code XXXX-XXXX-XXXX --name "Cashier PC"`. The returned token is stored with DPAPI and never printed.
3. Run `Arcadia.HallServer.exe --Cloud:Mode=Supabase`.
4. For each PC: owner creates an `'agent'` code, then the PC steps below, using the code, the CA fingerprint printed by the Hall Server and the device id.

## Pairing a PC (dev flow, in-memory cloud)
1. Run the Hall Server: `dotnet run --project src/Arcadia.HallServer -- --Cloud:Mode=Dev --HallServer:DevAdmin=true`.
2. `POST https://127.0.0.1:7421/admin/pairing-code?tenantId=<guid>` (loopback only) returns `code` and `caFingerprint`.
3. On the gaming PC (elevated): `Arcadia.Agent.Service.exe pair --server https://<hall-server>:7421 --ca-fingerprint <hex> --code <code> --station <device guid>`.
4. Restart the `ArcadiaAgent` service. Credentials are stored with DPAPI in a folder only SYSTEM/Administrators can read.

## Build and test
```bash
dotnet build Arcadia.sln
dotnet test Arcadia.sln   # 49 + 32 tests
```

## Configuration (`src/Arcadia.Agent.Service/appsettings.json`, section `Agent`)
`HallName`, `DeviceName`, `AgentId` / `TenantId` / `StationId` (temporary until pairing), `PlayerSid` (account allowed on the UI pipe; default `BUILTIN\Users`, set the real player SID), `TechnicianPinHash` (PBKDF2; generate with `PinVerifier.Hash`), `DevCommandDir` (DEV ONLY).

## Safety notes
- The service never executes arbitrary shell or PowerShell. The only process it spawns is `shutdown.exe` with fixed flags, and the UI shell.
- It changes **no** Windows policy or registry setting. Restrictions on the player account are a manual GPO baseline (to be written).
- The pipe nonce is passed on the shell's command line for now. The planned inherited-handle hand-off is not implemented; the pipe ACL is the main protection.
- Do not run the service on a development PC without being ready for the lock screen: with a logged-on user, it launches a full-screen overlay.
