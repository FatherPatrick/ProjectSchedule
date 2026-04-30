#requires -Version 5.1
<#
.SYNOPSIS
  One-shot local dev bootstrapper for the Nail Schedule app.

.DESCRIPTION
  - Verifies Node + npm
  - Installs npm deps if node_modules is missing
  - Ensures a .env exists (copies from .env.example on first run)
  - Generates the Prisma client
  - Applies database migrations (prisma migrate dev)
  - Optionally seeds the database
  - Starts `next dev`

.PARAMETER Seed
  Run the seed script before starting the dev server.

.PARAMETER SkipMigrate
  Skip running prisma migrate dev (use if you already migrated).

.PARAMETER Fresh
  Drop and recreate the database (prisma migrate reset --force) then seed.

.EXAMPLE
  .\scripts\dev.ps1
  .\scripts\dev.ps1 -Seed
  .\scripts\dev.ps1 -Fresh
#>
param(
  [switch]$Seed,
  [switch]$SkipMigrate,
  [switch]$Fresh
)

$ErrorActionPreference = 'Stop'
Set-Location -Path (Join-Path $PSScriptRoot '..')

function Write-Step($msg) {
  Write-Host ""
  Write-Host "==> $msg" -ForegroundColor Cyan
}

# 1. Toolchain check
Write-Step "Checking Node / npm"
try {
  $node = node --version
  $npm = npm --version
  Write-Host "node $node, npm $npm"
}
catch {
  throw "Node.js and npm must be installed and on PATH."
}

# 2. .env
if (-not (Test-Path .env)) {
  if (Test-Path .env.example) {
    Write-Step ".env not found - copying from .env.example"
    Copy-Item .env.example .env
    Write-Warning "Edit .env and set DATABASE_URL, AUTH_SECRET, RESEND_API_KEY, TWILIO_*, CRON_SECRET, ADMIN_EMAILS before continuing."
    Write-Host "Press Enter once .env is filled out, or Ctrl+C to exit."
    [void](Read-Host)
  }
  else {
    throw "No .env or .env.example found."
  }
}

# 3. Dependencies
if (-not (Test-Path node_modules)) {
  Write-Step "Installing npm dependencies (first run)"
  npm install
}
else {
  Write-Step "Dependencies present (skipping npm install)"
}

# 4. Prisma client
Write-Step "Generating Prisma client"
npx prisma generate | Out-Host

# 5. Migrations
if ($Fresh) {
  Write-Step "Resetting database (prisma migrate reset --force)"
  npx prisma migrate reset --force | Out-Host
  $Seed = $true # reset already seeds via seed script if configured, but ensure it runs
}
elseif (-not $SkipMigrate) {
  Write-Step "Applying database migrations"
  npx prisma migrate dev --name "auto-$(Get-Date -Format 'yyyyMMddHHmmss')" --skip-seed | Out-Host
}
else {
  Write-Step "Skipping migrations (-SkipMigrate)"
}

# 6. Seed
if ($Seed) {
  Write-Step "Seeding database"
  npm run db:seed | Out-Host
}

# 7. Dev server
Write-Step "Starting Next.js dev server (http://localhost:3000)"
Write-Host "Press Ctrl+C to stop." -ForegroundColor Yellow
npm run dev
