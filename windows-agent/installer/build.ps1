<#
 Builds both installers into installer/out/msi:
   ArcadiaHallServer.msi   (cashier PC)
   ArcadiaAgent.msi        (every gaming PC)
 Self-contained win-x64: nothing to install on the target PCs.
 Usage: .\build.ps1 [-Version 0.1.0] [-CloudUrl https://<ref>.supabase.co/functions/v1/agent-bridge]
 -CloudUrl is baked into the Hall Server package so the technician does not have to type it.
#>
param([string]$Version = '0.1.0', [string]$CloudUrl = '')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $PSScriptRoot 'out'
Remove-Item $out -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$out\hallserver", "$out\agent" | Out-Null

Write-Host '== publish Hall Server' -ForegroundColor Cyan
dotnet publish "$root\src\Arcadia.HallServer\Arcadia.HallServer.csproj" -c Release -r win-x64 --self-contained -p:Version=$Version -o "$out\hallserver" | Out-Host
if ($LASTEXITCODE) { throw 'publish failed' }
Copy-Item "$PSScriptRoot\HallServer\Setup-HallServer.ps1" "$out\hallserver\"
if ($CloudUrl) { Set-Content "$out\hallserver\cloud-url.txt" $CloudUrl -NoNewline }

Write-Host '== publish Agent (service + lock screen)' -ForegroundColor Cyan
foreach ($p in 'Arcadia.Agent.Service', 'Arcadia.Agent.Shell') {
    dotnet publish "$root\src\$p\$p.csproj" -c Release -r win-x64 --self-contained -p:Version=$Version -o "$out\agent" | Out-Host
    if ($LASTEXITCODE) { throw "publish $p failed" }
}
Copy-Item "$PSScriptRoot\Agent\Setup-Agent.ps1" "$out\agent\"

Write-Host '== build MSIs' -ForegroundColor Cyan
dotnet build "$PSScriptRoot\HallServer\HallServer.wixproj" -c Release -p:PublishDir="$out\hallserver" -p:ProductVersion=$Version -o "$out\msi" | Out-Host
if ($LASTEXITCODE) { throw 'HallServer MSI failed' }
dotnet build "$PSScriptRoot\Agent\Agent.wixproj" -c Release -p:PublishDir="$out\agent" -p:ProductVersion=$Version -o "$out\msi" | Out-Host
if ($LASTEXITCODE) { throw 'Agent MSI failed' }

Get-ChildItem "$out\msi\*.msi" | ForEach-Object { '{0}  {1:N1} MB' -f $_.FullName, ($_.Length / 1MB) }
