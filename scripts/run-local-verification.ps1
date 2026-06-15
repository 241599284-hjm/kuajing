param(
  [switch]$SkipTests,
  [switch]$SkipDockerConfig
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Command
  )

  Write-Host ""
  Write-Host "==> $Name"
  & $Command
}

Invoke-Step "pnpm typecheck" {
  pnpm -s typecheck
}

if (-not $SkipTests) {
  Invoke-Step "pnpm test" {
    pnpm -s test
  }
}

if (-not $SkipDockerConfig) {
  Invoke-Step "docker compose config" {
    docker compose config --quiet
  }
}

Invoke-Step "git diff whitespace check" {
  git diff --check
}

Invoke-Step "git status" {
  git status --short
}

Write-Host ""
Write-Host "Local verification completed."
