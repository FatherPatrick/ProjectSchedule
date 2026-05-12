#requires -Version 5.1
<#
.SYNOPSIS
  Local mobile dev bootstrapper.

.DESCRIPTION
  - Detects your LAN IP so the phone (Expo Go / dev build) can reach the
    Next.js backend over Wi-Fi.
  - Starts the Next.js dev server bound to 0.0.0.0:3000 in a new window.
  - Starts the Expo dev server with EXPO_PUBLIC_API_BASE_URL set to
    http://<lan-ip>:3000 so the mobile app talks to your local backend.

  The phone must be on the SAME Wi-Fi network as your computer.
  If your firewall blocks inbound traffic, allow Node on private networks.

.PARAMETER Ip
  Override LAN IP detection (e.g. -Ip 192.168.1.42).

.PARAMETER Tunnel
  Use Expo tunnel mode (works across networks; requires @expo/ngrok).
  When set, EXPO_PUBLIC_API_BASE_URL still points at your LAN IP, so the
  backend must be reachable from the phone (use -Ip with a public host
  or run a separate tunnel for :3000 if you need full off-LAN access).

.PARAMETER SkipBackend
  Don't launch the Next.js dev server (useful if you already have it
  running in another terminal).

.PARAMETER InstallMobile
  Run npm install inside ./mobile before starting Expo.

.EXAMPLE
  .\scripts\dev-mobile.ps1
  .\scripts\dev-mobile.ps1 -Ip 192.168.1.42
  .\scripts\dev-mobile.ps1 -Tunnel
  .\scripts\dev-mobile.ps1 -SkipBackend
#>
param(
  [string]$Ip,
  [switch]$Tunnel,
  [switch]$SkipBackend,
  [switch]$InstallMobile
)

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location -Path $repoRoot

function Write-Step($msg) {
  Write-Host ""
  Write-Host "==> $msg" -ForegroundColor Cyan
}

# 1. Toolchain
Write-Step "Checking Node / npm"
$null = node --version
$null = npm --version

# 2. Detect LAN IP
function Get-LanIPv4 {
  $candidates = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notlike '127.*' -and
      $_.IPAddress -notlike '169.254.*' -and
      $_.PrefixOrigin -ne 'WellKnown' -and
      $_.AddressState -eq 'Preferred'
    }

  # Prefer Wi-Fi / Ethernet aliases
  $preferred = $candidates | Where-Object {
    $_.InterfaceAlias -match 'Wi-?Fi|Wireless|Ethernet'
  } | Select-Object -First 1

  if ($preferred) { return $preferred.IPAddress }
  if ($candidates) { return ($candidates | Select-Object -First 1).IPAddress }
  return $null
}

if (-not $Ip) {
  $Ip = Get-LanIPv4
  if (-not $Ip) {
    throw "Could not auto-detect a LAN IPv4. Re-run with -Ip <your-ip>."
  }
}

$apiBase = "http://${Ip}:3000"
Write-Host "LAN IP:           $Ip"
Write-Host "Backend will be:  $apiBase"

# 3. Mobile deps
if ($InstallMobile -or -not (Test-Path (Join-Path $repoRoot 'mobile/node_modules'))) {
  Write-Step "Installing mobile dependencies"
  Push-Location (Join-Path $repoRoot 'mobile')
  try { npm install } finally { Pop-Location }
}

# 4. Backend (in separate window so logs stay readable)
if (-not $SkipBackend) {
  if (-not (Test-Path (Join-Path $repoRoot 'node_modules'))) {
    Write-Step "Installing backend dependencies"
    npm install
  }

  Write-Step "Starting Next.js dev server on 0.0.0.0:3000 (new window)"
  $backendCmd = "Set-Location '$repoRoot'; `$env:HOSTNAME='0.0.0.0'; npm run dev -- -H 0.0.0.0 -p 3000"
  Start-Process -FilePath "powershell.exe" `
    -ArgumentList @('-NoExit', '-Command', $backendCmd) `
    -WorkingDirectory $repoRoot | Out-Null

  Write-Host "Waiting a few seconds for backend to come up..."
  Start-Sleep -Seconds 4
}
else {
  Write-Step "Skipping backend (-SkipBackend). Make sure it's already running on $apiBase."
}

# 5. Expo dev server
Write-Step "Starting Expo dev server"
Write-Host "Press 'i' for iOS sim, 'a' for Android, or scan the QR with Expo Go."
Write-Host "If the phone can't reach $apiBase, check Windows Firewall (allow Node on Private)."
Write-Host ""

Push-Location (Join-Path $repoRoot 'mobile')
try {
  $env:EXPO_PUBLIC_API_BASE_URL = $apiBase
  if ($Tunnel) {
    npx expo start --tunnel --clear
  }
  else {
    npx expo start --lan --clear
  }
}
finally {
  Pop-Location
}
