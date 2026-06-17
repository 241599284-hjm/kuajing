param(
  [string]$HostName = "170.106.136.169",
  [string]$User = "ubuntu",
  [string]$KeyPath = "$env:USERPROFILE\.ssh\hlandteaware_tencent_rsa",
  [int]$TimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $KeyPath)) {
  throw "SSH key not found: $KeyPath"
}

$remoteScript = @'
set -euo pipefail

cd /opt/crossborder-commerce-kit/current

timeout_seconds="__TIMEOUT_SECONDS__"
correlation_id="server-drill-\$(cat /proc/sys/kernel/random/uuid)"
idempotency_key="server-drill-\$(cat /proc/sys/kernel/random/uuid)"

echo "Checking required services..."
curl -fsS http://localhost:4104/health >/dev/null
curl -fsS http://localhost:4105/health >/dev/null
curl -fsS http://localhost:4109/health >/dev/null
curl -fsS http://localhost:4001/health >/dev/null

checkout_body='{"customerEmail":"server-drill@example.com","paymentMethod":"mock","shippingAddress":{"country":"United States","province":"California","city":"Los Angeles","postalCode":"90001","street":"100 Test Warehouse Road"},"lines":[{"slug":"porcelain-tea-set","skuId":"00000000-0000-4000-8000-000000002001","skuCode":"TEA-PORCELAIN-SET-001","title":"Porcelain Tea Set","quantity":1,"unitPriceMinor":9600,"currency":"USD"}]}'

echo "Creating a PostgreSQL-backed order..."
order_response=\$(mktemp)
order_status=\$(curl -sS -o "\$order_response" -w "%{http_code}" -X POST http://localhost:4105/checkout/mock-order \
  -H "Content-Type: application/json" \
  -H "x-correlation-id: \$correlation_id" \
  -H "idempotency-key: \$idempotency_key" \
  --data "\$checkout_body")
order_json=\$(cat "\$order_response")

if [ "\$order_status" -lt 200 ] || [ "\$order_status" -ge 300 ]; then
  echo "\$order_json"
  echo "Order creation failed with HTTP \$order_status" >&2
  exit 1
fi

order_id=\$(printf '%s' "\$order_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['orderId'])")
storage_mode=\$(printf '%s' "\$order_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('storageMode',''))")

if [ "\$storage_mode" != "postgres" ]; then
  echo "\$order_json"
  echo "Expected PostgreSQL-backed order, got storageMode=\$storage_mode" >&2
  exit 1
fi

echo "Order created: \$order_id"
echo "Stopping inventory-service to force inventory confirm failure..."
docker compose stop inventory-service >/dev/null

cleanup() {
  echo "Restarting inventory-service..."
  docker compose start inventory-service >/dev/null || true
}
trap cleanup EXIT

confirm_json=\$(curl -fsS -X POST http://localhost:4105/payments/mock-confirm \
  -H "Content-Type: application/json" \
  -H "x-correlation-id: \$correlation_id" \
  --data "{\"orderId\":\"\$order_id\"}")

compensation_queued=\$(printf '%s' "\$confirm_json" | python3 -c "import sys,json; print(str(json.load(sys.stdin).get('compensationQueued', False)).lower())")
inventory_status=\$(printf '%s' "\$confirm_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('inventoryStatus',''))")

if [ "\$compensation_queued" != "true" ] || [ "\$inventory_status" != "compensation_pending" ]; then
  echo "\$confirm_json"
  echo "Expected compensationQueued=true and inventoryStatus=compensation_pending" >&2
  exit 1
fi

echo "Payment confirm returned compensation_pending."
echo "Forcing compensation task due now with max_attempts=1..."
docker exec cbck-postgres psql -U commerce -d order_db -v ON_ERROR_STOP=1 -c "UPDATE compensation_tasks SET max_attempts = 1, next_run_at = now() WHERE aggregate_id = '\$order_id';" >/dev/null

deadline=\$(( \$(date +%s) + timeout_seconds ))
dead_letter_count=0

while [ \$(date +%s) -lt \$deadline ]; do
  dead_letter_count=\$(docker exec cbck-postgres psql -U commerce -d order_db -t -A -c "SELECT count(*) FROM dead_letter_tasks WHERE aggregate_id = '\$order_id' AND status = 'open';" | tail -n 1 | tr -d '[:space:]')
  if [ "\$dead_letter_count" -gt 0 ]; then
    break
  fi
  sleep 2
done

if [ "\$dead_letter_count" -lt 1 ]; then
  docker compose logs --tail=80 worker-service
  echo "Expected an open dead_letter_tasks row for order \$order_id, found \$dead_letter_count" >&2
  exit 1
fi

admin_dlq=\$(curl -fsS http://localhost:4001/dead-letter-tasks -H "x-correlation-id: \$correlation_id")
matched_count=\$(printf '%s' "\$admin_dlq" | python3 -c "import sys,json; data=json.load(sys.stdin); tasks=data if isinstance(data,list) else data.get('tasks', data.get('items', [])); print(sum(1 for item in tasks if item.get('aggregateId') == '$order_id'))")

if [ "\$matched_count" -lt 1 ]; then
  echo "\$admin_dlq"
  echo "Admin gateway DLQ endpoint did not return the drill dead-letter task for order \$order_id" >&2
  exit 1
fi

echo "Compensation drill passed."
echo "Order: \$order_id"
echo "Correlation ID: \$correlation_id"
echo "Open DLQ rows for order: \$dead_letter_count"
'@

$remoteScript = $remoteScript.Replace("__TIMEOUT_SECONDS__", [string]$TimeoutSeconds).Replace('\$', '$')

$encodedScript = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteScript))
$remoteCommand = "tmp=/tmp/cbck-server-compensation-drill.sh; echo $encodedScript | base64 -d > `$tmp && bash `$tmp"

& ssh -i $KeyPath -o StrictHostKeyChecking=no "$User@$HostName" $remoteCommand
if ($LASTEXITCODE -ne 0) {
  throw "Server compensation drill failed with exit code $LASTEXITCODE"
}
