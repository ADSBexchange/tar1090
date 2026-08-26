<#
.SYNOPSIS
  One-shot runner for the globe ad-lifecycle Playwright E2E. Installs deps + the browser on first
  run, then runs the suite. No manual setup needed.

.EXAMPLE
  .\run-playwright.ps1                 # against local stack (http://localhost:8080)
.EXAMPLE
  .\run-playwright.ps1 -Dev            # against https://globe.dev.adsbexchange.com
.EXAMPLE
  .\run-playwright.ps1 -Project mobile -Headed
.EXAMPLE
  .\run-playwright.ps1 -Grep "switching"
#>
[CmdletBinding()]
param(
  [switch]$Dev,                                   # target dev instead of localhost
  [ValidateSet("desktop", "mobile")][string]$Project,  # run only one project
  [string]$Grep,                                  # run only tests matching this name
  [switch]$Headed                                 # watch it drive a real browser
)

$ErrorActionPreference = "Stop"
Push-Location $PSScriptRoot
try {
  # 1. deps (only if missing)
  if (-not (Test-Path "node_modules")) {
    Write-Host "Installing npm dependencies..." -ForegroundColor Cyan
    npm install
  }

  # 2. browser (idempotent — Playwright skips if already present)
  Write-Host "Ensuring Playwright Chromium is installed..." -ForegroundColor Cyan
  npx playwright install chromium

  # 3. target
  if ($Dev) {
    $env:BASE_URL = "https://globe.dev.adsbexchange.com"
    $env:TARGET = "dev"
    Write-Host "Target: DEV ($env:BASE_URL)" -ForegroundColor Yellow
  }
  else {
    Write-Host "Target: LOCAL (http://localhost:8080) — local stack must be up" -ForegroundColor Yellow
  }

  # 4. run
  $playArgs = @("playwright", "test")
  if ($Project) { $playArgs += @("--project", $Project) }
  if ($Grep) { $playArgs += @("-g", $Grep) }
  if ($Headed) { $playArgs += "--headed" }

  Write-Host "Running: npx $($playArgs -join ' ')" -ForegroundColor Cyan
  & npx @playArgs
}
finally {
  Pop-Location
}
