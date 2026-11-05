<#
 Arcadia Hall Server: one-time setup on the CASHIER PC (run after installing the MSI, as Administrator).
 Needs a "Hall Server" pairing code from the dashboard (Agents page > Connect PCs to this hall).
#>
param(
    [string]$CloudUrl,
    [string]$Code,
    [string]$Name = $env:COMPUTERNAME
)
$ErrorActionPreference = 'Stop'

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error 'Run this script as Administrator (right-click > Run as administrator).'
}

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$exe = Join-Path $dir 'Arcadia.HallServer.exe'
if (-not $CloudUrl) {
    $default = Join-Path $dir 'cloud-url.txt'
    if (Test-Path $default) { $CloudUrl = (Get-Content $default -Raw).Trim() }
}
if (-not $CloudUrl) { $CloudUrl = Read-Host 'Cloud address (https://<project>.supabase.co/functions/v1/agent-bridge)' }
if (-not $Code) { $Code = Read-Host 'Hall Server pairing code from the dashboard (XXXX-XXXX-XXXX)' }

Write-Host "`n1/3 Pairing this server with the cloud..." -ForegroundColor Cyan
& $exe pair-server --url $CloudUrl --code $Code --name $Name
if ($LASTEXITCODE -ne 0) { Write-Error 'Pairing failed. Generate a new code in the dashboard (codes last 10 minutes and work once).' }

Write-Host "`n2/3 Starting the Hall Server service..." -ForegroundColor Cyan
Start-Service ArcadiaHallServer
Start-Sleep -Seconds 3
$svc = Get-Service ArcadiaHallServer
if ($svc.Status -ne 'Running') { Write-Error "The service is $($svc.Status). Check Event Viewer > Windows Logs > Application." }

Write-Host "`n3/3 Write these down. You need them on every gaming PC:" -ForegroundColor Cyan
& $exe info
Write-Host "`nDone. Next: install the Arcadia Agent MSI on each gaming PC and run Setup-Agent.ps1." -ForegroundColor Green
