param(
  [switch]$WithApps,
  [switch]$WithObservability
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example. Review secrets before production use."
}

pnpm install
docker compose config --quiet
docker compose up -d

if ($WithApps) {
  docker compose --profile app up -d --build
}

if ($WithObservability) {
  docker compose --profile observability up -d
}

Write-Host "Private deployment initialization completed."
Write-Host "Local storefront: http://localhost:3000"
Write-Host "Local admin: http://localhost:3001"
Write-Host "Mailpit: http://localhost:8025"
Write-Host "Grafana: http://localhost:3002"
Write-Host "Before production: replace all .env secrets, configure real admin credentials, and move PostgreSQL/Redis/object storage to managed services."
