param(
  [switch]$SkipBuild,
  [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Invoke-Docker {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  & docker @Args
  if ($LASTEXITCODE -ne 0) {
    throw "docker $($Args -join ' ') failed with exit code $LASTEXITCODE"
  }
}

function Wait-Http {
  param(
    [string]$Url,
    [string]$Name
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    try {
      Invoke-RestMethod -Uri $Url -TimeoutSec 3 | Out-Null
      Write-Host "$Name is ready: $Url"
      return
    } catch {
      Start-Sleep -Seconds 2
    }
  }

  throw "$Name did not become ready within $TimeoutSeconds seconds"
}

function Invoke-PostgresScalar {
  param([string]$Sql)

  $output = & docker exec cbck-postgres psql -U commerce -d order_db -t -A -c $Sql
  if ($LASTEXITCODE -ne 0) {
    throw "PostgreSQL command failed: $Sql"
  }

  return (($output | Select-Object -Last 1) -as [string]).Trim()
}

docker version | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Docker daemon is not available. Start or repair Docker Desktop, then rerun scripts/run-compensation-drill.ps1."
}

$env:WORKER_POLL_INTERVAL_MS = "1000"
$env:WORKER_BATCH_SIZE = "5"

Write-Host "Starting PostgreSQL, Redis, inventory, order, payment, worker, and admin-gateway..."
Invoke-Docker compose up -d postgres redis

if ($SkipBuild) {
  Invoke-Docker compose --profile app up -d inventory-service payment-service order-service worker-service admin-gateway
} else {
  Invoke-Docker compose --profile app up -d --build inventory-service payment-service order-service worker-service admin-gateway
}

Wait-Http "http://localhost:4104/health" "inventory-service"
Wait-Http "http://localhost:4105/health" "order-service"
Wait-Http "http://localhost:4109/health" "worker-service"
Wait-Http "http://localhost:4001/health" "admin-gateway"

$correlationId = [guid]::NewGuid().ToString()
$idempotencyKey = "drill-$([guid]::NewGuid())"
$checkoutBody = @{
  customerEmail = "drill@example.com"
  paymentMethod = "mock"
  lines = @(
    @{
      slug = "porcelain-tea-set"
      skuId = "00000000-0000-4000-8000-000000002001"
      skuCode = "TEA-PORCELAIN-SET-001"
      title = "Porcelain Tea Set"
      quantity = 1
      unitPriceMinor = 9600
      currency = "USD"
    }
  )
} | ConvertTo-Json -Depth 8

Write-Host "Creating a PostgreSQL-backed order..."
$order = Invoke-RestMethod `
  -Uri "http://localhost:4105/checkout/mock-order" `
  -Method Post `
  -Headers @{
    "Content-Type" = "application/json"
    "x-correlation-id" = $correlationId
    "idempotency-key" = $idempotencyKey
  } `
  -Body $checkoutBody `
  -TimeoutSec 15

if ($order.storageMode -ne "postgres") {
  throw "Expected PostgreSQL-backed order, got storageMode=$($order.storageMode)"
}

$orderId = $order.orderId
Write-Host "Order created: $orderId"

Write-Host "Stopping inventory-service to force inventory confirm failure..."
Invoke-Docker compose stop inventory-service

try {
  Invoke-RestMethod `
    -Uri "http://localhost:4105/payments/mock-confirm" `
    -Method Post `
    -Headers @{
      "Content-Type" = "application/json"
      "x-correlation-id" = $correlationId
    } `
    -Body (@{ orderId = $orderId } | ConvertTo-Json) `
    -TimeoutSec 15 | Out-Null

  Write-Host "Payment confirm returned compensation_pending as expected."

  Write-Host "Forcing compensation task due now with max_attempts=1 for a bounded drill..."
  Invoke-PostgresScalar "UPDATE compensation_tasks SET max_attempts = 1, next_run_at = now() WHERE aggregate_id = '$orderId'; SELECT count(*) FROM compensation_tasks WHERE aggregate_id = '$orderId';" | Out-Null

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $deadLetterCount = 0

  while ((Get-Date) -lt $deadline) {
    $deadLetterCount = [int](Invoke-PostgresScalar "SELECT count(*) FROM dead_letter_tasks WHERE aggregate_id = '$orderId' AND status = 'open';")

    if ($deadLetterCount -gt 0) {
      break
    }

    Start-Sleep -Seconds 2
  }

  if ($deadLetterCount -lt 1) {
    throw "Expected an open dead_letter_tasks row for order $orderId, found $deadLetterCount"
  }

  $adminDlq = Invoke-RestMethod -Uri "http://localhost:4001/dead-letter-tasks" -Headers @{ "x-correlation-id" = $correlationId } -TimeoutSec 10
  $matched = @($adminDlq | Where-Object { $_.aggregateId -eq $orderId })

  if ($matched.Count -lt 1) {
    throw "Admin gateway DLQ endpoint did not return the drill dead-letter task for order $orderId"
  }

  Write-Host "Compensation drill passed."
  Write-Host "Order: $orderId"
  Write-Host "Correlation ID: $correlationId"
  Write-Host "Open DLQ rows for order: $deadLetterCount"
} finally {
  Write-Host "Restarting inventory-service..."
  docker compose start inventory-service | Out-Null
}
