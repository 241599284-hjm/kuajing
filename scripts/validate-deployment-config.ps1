param(
  [string]$EnvFile = ".env",
  [switch]$AllowPlaceholders
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $root $EnvFile

$requiredKeys = @(
  "DEFAULT_STORE_ID",
  "DEFAULT_STORE_REGION",
  "DEFAULT_STORE_TIMEZONE",
  "APP_DATABASE_URL",
  "INVENTORY_DATABASE_URL",
  "ORDER_DATABASE_URL",
  "LOGISTICS_DATABASE_URL",
  "NOTIFICATION_DATABASE_URL",
  "REVIEW_DATABASE_URL",
  "OPS_DATABASE_URL",
  "PRODUCT_IMPORT_DATABASE_URL",
  "REDIS_URL"
)

if (-not (Test-Path -LiteralPath $envPath)) {
  throw "Environment file not found: $envPath"
}

$values = @{}
Get-Content -LiteralPath $envPath | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
    return
  }

  $parts = $line.Split("=", 2)
  $values[$parts[0].Trim()] = $parts[1].Trim()
}

$missing = @()
$placeholder = @()

foreach ($key in $requiredKeys) {
  if (-not $values.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($values[$key])) {
    $missing += $key
    continue
  }

  if (-not $AllowPlaceholders -and $values[$key] -match "\[.*\]|change-me|example|localhost") {
    $placeholder += $key
  }
}

if ($missing.Count -gt 0) {
  throw "Missing required deployment keys: $($missing -join ', ')"
}

if ($placeholder.Count -gt 0) {
  throw "Placeholder or local-only values found: $($placeholder -join ', ')"
}

Write-Host "Deployment config validation passed for $EnvFile"
