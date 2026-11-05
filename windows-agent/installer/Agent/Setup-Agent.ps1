<#
 Arcadia Agent: one-time setup on EACH GAMING PC (run after installing the MSI, as Administrator).
 Needs: the Hall Server address, its CA fingerprint (from "Arcadia.HallServer.exe info" on the cashier PC),
 an "agent" pairing code and the Device ID (both from the dashboard: Agents page > Connect PCs to this hall).

 WARNING: when the service starts, this PC LOCKS (full-screen) until a session is started from the dashboard.
#>
param(
    [string]$Server,
    [string]$Fingerprint,
    [string]$Code,
    [string]$DeviceId,
    [string]$HallName,
    [string]$DeviceName,
    [string]$PlayerUser,   # Windows account the players use (e.g. Player). Optional but recommended.
    [string]$TechnicianPin # Optional emergency-unlock PIN (4+ characters)
)
$ErrorActionPreference = 'Stop'

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error 'Run this script as Administrator (right-click > Run as administrator).'
}

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$exe = Join-Path $dir 'Arcadia.Agent.Service.exe'
$cfgPath = Join-Path $dir 'appsettings.json'

if (-not $Server)      { $Server      = Read-Host 'Hall Server address (e.g. https://192.168.1.10:7421)' }
if (-not $Fingerprint) { $Fingerprint = Read-Host 'Hall Server CA fingerprint (from "info" on the cashier PC)' }
if (-not $Code)        { $Code        = Read-Host 'Agent pairing code (XXXX-XXXX-XXXX)' }
if (-not $DeviceId)    { $DeviceId    = Read-Host 'Device ID of THIS PC (from the dashboard)' }
if (-not $HallName)    { $HallName    = Read-Host 'Hall name shown on the lock screen' }
if (-not $DeviceName)  { $DeviceName  = Read-Host "Device name shown on the lock screen [$env:COMPUTERNAME]" }
if (-not $DeviceName)  { $DeviceName  = $env:COMPUTERNAME }

# Settings the service reads (appsettings.json lives next to the exe, writable only by administrators).
$cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
if (-not $cfg.Agent) { $cfg | Add-Member -NotePropertyName Agent -NotePropertyValue ([pscustomobject]@{}) }
$cfg.Agent | Add-Member -NotePropertyName HallName -NotePropertyValue $HallName -Force
$cfg.Agent | Add-Member -NotePropertyName DeviceName -NotePropertyValue $DeviceName -Force

if ($PlayerUser) {
    $sid = (New-Object Security.Principal.NTAccount($PlayerUser)).Translate([Security.Principal.SecurityIdentifier]).Value
    $cfg.Agent | Add-Member -NotePropertyName PlayerSid -NotePropertyValue $sid -Force
    Write-Host "Player account '$PlayerUser' = $sid"
}
else {
    Write-Warning "No -PlayerUser given: the lock screen pipe accepts every local user (BUILTIN\Users). Pass -PlayerUser <account> to restrict it."
}
if ($TechnicianPin) {
    $hash = & $exe hash-pin $TechnicianPin
    if ($LASTEXITCODE -ne 0) { Write-Error 'The technician PIN must have at least 4 characters.' }
    $cfg.Agent | Add-Member -NotePropertyName TechnicianPinHash -NotePropertyValue $hash -Force
}
$cfg | ConvertTo-Json -Depth 8 | Set-Content -Path $cfgPath -Encoding UTF8

Write-Host "`n1/2 Pairing this PC with the Hall Server..." -ForegroundColor Cyan
& $exe pair --server $Server --ca-fingerprint $Fingerprint --code $Code --station $DeviceId
if ($LASTEXITCODE -ne 0) { Write-Error 'Pairing failed. Check the address, the fingerprint and generate a new code (10 minutes, one use).' }

$answer = Read-Host "`nStarting the agent LOCKS this PC until a session starts. Continue? (y/n)"
if ($answer -notmatch '^(y|yes)$') { Write-Host 'Paired, but the service was not started. Start it later with: Start-Service ArcadiaAgent'; exit 0 }

Write-Host "2/2 Starting the Arcadia Agent service..." -ForegroundColor Cyan
Start-Service ArcadiaAgent
Write-Host 'Done. The PC should now show the lock screen. Start a session from the dashboard to unlock it.' -ForegroundColor Green
