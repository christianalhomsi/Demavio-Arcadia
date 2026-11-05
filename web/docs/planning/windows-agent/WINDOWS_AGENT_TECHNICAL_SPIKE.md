# Windows Agent — Technical Spike (.NET 10 LTS)

Purpose: confirm, **before any production code**, that each dependency works on .NET 10 LTS, Windows 10 22H2 and Windows 11 23H2+. Nothing here is assumed. Every row starts as **To verify**.

## 1. Target
- `net10.0-windows` for Agent.Service and Agent.Shell; `net10.0-windows` or `net10.0` for HallServer; `net10.0` for Arcadia.Contracts.
- Publish **self-contained**, win-x64, ReadyToRun on. Single-file is optional (to check against WPF).
- Not used: trimming, which WPF doesn't support, and NativeAOT, which WPF and much of the reflection-based stack don't support.

## 2. Compatibility checklist

| Area | Package / API | Expectation | Known limitation / risk | Spike test | Status |
|---|---|---|---|---|---|
| Windows Service host | `Microsoft.Extensions.Hosting.WindowsServices` 10.x | Supported | Service recovery actions are configured by the installer or `sc failure`, not by code | Install, start, kill → SCM restarts it | To verify |
| WPF | `net10.0-windows`, `UseWPF` | Supported | No trimming or AOT. Behaviour on mixed-DPI multi-monitor setups | Full-screen top-most window on 2 monitors with different DPI | To verify |
| Launch UI into the user session | `WTSQueryUserToken`, `CreateProcessAsUser`, `WTSGetActiveConsoleSessionId` through CsWin32 | Works from SYSTEM | Session 0 isolation, and racing the auto-logon | Service starts before logon, then launches the UI once the user session exists | To verify |
| Interop generation | `Microsoft.Windows.CsWin32` | Source generator works on net10 | Generator version pinning | Generate WTS*, LockWorkStation, ExitWindowsEx/InitiateShutdown | To verify |
| Named pipes with ACL | `System.IO.Pipes`, `NamedPipeServerStreamAcl.Create` + `PipeSecurity` | Supported | ACL must deny Everyone and allow SYSTEM + player SID only | Another local user can't connect | To verify |
| ASP.NET Core / Kestrel | `Microsoft.AspNetCore.App` 10 | Supported | Client-certificate (mTLS) mode configuration; HTTP.sys is the alternative | mTLS WebSocket with a pinned client certificate | To verify |
| SQLite | `Microsoft.Data.Sqlite` 10.x (+ SQLitePCLRaw bundle) | Supported | WAL on network drives isn't supported (local disk only) | WAL, `synchronous=FULL`, power-cut test | To verify |
| ORM (optional) | Dapper / EF Core 10 | Supported | Prefer Dapper plus hand-written SQL for predictability | — | To verify |
| mDNS | Third-party (e.g. `Makaretu.Dns.Multicast`) | **Uncertain on net10** | Library maintenance, Windows firewall | Advertise and resolve `_arcadia._tcp` | To verify; fallback: manual IP or a UDP broadcast probe |
| Supabase | `supabase-csharp` | **Uncertain** | SDK lag. **Not needed:** the server uses HTTPS to the Edge Function, and Realtime is optional through a raw WebSocket | Realtime Phoenix channel over `ClientWebSocket` | To verify |
| Certificates | `System.Security.Cryptography.X509Certificates`, `CertificateRequest` | Supported | Private-key storage: DPAPI-protected PFX or the machine store with an ACL | Issue a local CA and leaf certificates, then pin them | To verify |
| Secret storage | `System.Security.Cryptography.ProtectedData` (DPAPI LocalMachine) | Supported (Windows only) | LocalMachine scope means any admin can decrypt, so it relies on the file ACL | Round-trip, plus a test that a non-admin can't read the file | To verify |
| Time / boot | `Stopwatch`, `Environment.TickCount64`, WMI `Win32_OperatingSystem.LastBootUpTime`, `SystemEvents.TimeChanged` | Supported | `SystemEvents` needs a message loop (hidden window) inside a service | Change the clock manually and detect it | To verify |
| Power | `InitiateShutdownW` (with a reason code) | Supported | Needs `SE_SHUTDOWN_NAME`, which SYSTEM has | Shutdown or restart with a 30 s grace | To verify |
| Installer | WiX Toolset v5/v6 (`WixToolset.Sdk`) | Independent of the runtime | Custom actions shouldn't depend on .NET 10 | MSI installs the service, recovery policy and firewall rule | To verify |
| Code signing | Authenticode (signtool) | Independent | Certificate cost/EV; SmartScreen reputation | Sign the MSI and EXE | To verify (MVP: optional) |
| Windows 10 | .NET 10 OS support matrix | Win10 22H2 supported until its EOL policy | Win10 consumer EOL Oct 2025, so the halls may use ESU. Confirm in the official matrix | Run the full PoC on Win10 22H2 | To verify |

## 3. Spike procedure
1. Create a throw-away solution in `windows-agent/spike/` (when implementation is approved). It doesn't ship.
2. Run each row as an isolated console or test project. Record the version, OS build, result and screenshots in this file.
3. Any **red** row becomes a decision record in [Decisions & risks](WINDOWS_AGENT_DECISIONS_AND_RISKS.md) with its fallback.

## 4. Exit criteria
- Every row is Green, or Amber with an accepted fallback.
- Measurements for PoC-1 (lock latency) and PoC-2 (reboot recovery) are recorded.
- No dependency needs a downgrade from .NET 10.
