param(
  [string]$HostName = "170.106.136.169",
  [string]$User = "ubuntu",
  [string]$KeyPath = "$env:USERPROFILE\.ssh\hlandteaware_tencent_rsa"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $KeyPath)) {
  throw "SSH key not found: $KeyPath"
}

$remoteScript = @'
set -euo pipefail

cd /opt/crossborder-commerce-kit/current

echo "Applying order idempotency fingerprint migration..."
docker exec -i cbck-postgres psql -U commerce -d postgres -v ON_ERROR_STOP=1 < infra/db/migrations/029-order-idempotency-fingerprint.sql >/dev/null

correlation_id="idempotency-drill-$(cat /proc/sys/kernel/random/uuid)"
order_key="order-idempotency-drill-$(cat /proc/sys/kernel/random/uuid)"
inventory_key="inventory-idempotency-drill-$(cat /proc/sys/kernel/random/uuid)"

checkout_body='{"customerEmail":"idempotency-drill@example.com","paymentMethod":"mock","shippingAddress":{"country":"United States","province":"California","city":"Los Angeles","postalCode":"90001","street":"100 Idempotency Test Road"},"lines":[{"slug":"porcelain-tea-set","skuId":"00000000-0000-4000-8000-000000002001","skuCode":"TEA-PORCELAIN-SET-001","title":"Porcelain Tea Set","quantity":1,"unitPriceMinor":9600,"currency":"USD"}]}'
changed_checkout_body='{"customerEmail":"idempotency-drill@example.com","paymentMethod":"mock","shippingAddress":{"country":"United States","province":"California","city":"Los Angeles","postalCode":"90001","street":"100 Idempotency Test Road"},"lines":[{"slug":"porcelain-tea-set","skuId":"00000000-0000-4000-8000-000000002001","skuCode":"TEA-PORCELAIN-SET-001","title":"Porcelain Tea Set","quantity":2,"unitPriceMinor":9600,"currency":"USD"}]}'

post_order() {
  curl -sS -X POST http://127.0.0.1:4105/checkout/mock-order \
    -H "Content-Type: application/json" \
    -H "x-correlation-id: $correlation_id" \
    -H "idempotency-key: $order_key" \
    --data "$1"
}

first_order=$(post_order "$checkout_body")
second_order=$(post_order "$checkout_body")
first_order_id=$(printf '%s' "$first_order" | python3 -c "import json,sys; print(json.load(sys.stdin)['orderId'])")
second_order_id=$(printf '%s' "$second_order" | python3 -c "import json,sys; print(json.load(sys.stdin)['orderId'])")

if [ "$first_order_id" != "$second_order_id" ]; then
  echo "Expected exact checkout replay to return the original order" >&2
  exit 1
fi

fingerprint=$(docker exec cbck-postgres psql -U commerce -d order_db -t -A -c "SELECT request_fingerprint FROM orders WHERE id = '$first_order_id';" | tr -d '[:space:]')
if [ ${#fingerprint} -ne 64 ]; then
  echo "Expected a persisted SHA-256 request fingerprint" >&2
  exit 1
fi

changed_file=$(mktemp)
changed_status=$(curl -sS -o "$changed_file" -w "%{http_code}" -X POST http://127.0.0.1:4105/checkout/mock-order \
  -H "Content-Type: application/json" \
  -H "x-correlation-id: $correlation_id" \
  -H "idempotency-key: $order_key" \
  --data "$changed_checkout_body")
changed_code=$(python3 -c "import json; print(json.load(open('$changed_file')).get('code',''))")
rm -f "$changed_file"

if [ "$changed_status" != "409" ] || [ "$changed_code" != "IDEMPOTENCY_CONFLICT" ]; then
  echo "Expected changed checkout replay to return 409 IDEMPOTENCY_CONFLICT" >&2
  exit 1
fi

inventory_body='{"skuId":"00000000-0000-4000-8000-000000002001","qty":1}'
changed_inventory_body='{"skuId":"00000000-0000-4000-8000-000000002001","qty":2}'

first_inventory=$(curl -fsS -X POST http://127.0.0.1:4104/reservations/try \
  -H "Content-Type: application/json" -H "x-correlation-id: $correlation_id" -H "idempotency-key: $inventory_key" --data "$inventory_body")
second_inventory=$(curl -fsS -X POST http://127.0.0.1:4104/reservations/try \
  -H "Content-Type: application/json" -H "x-correlation-id: $correlation_id" -H "idempotency-key: $inventory_key" --data "$inventory_body")
first_reservation_id=$(printf '%s' "$first_inventory" | python3 -c "import json,sys; print(json.load(sys.stdin)['reservationId'])")
second_reservation_id=$(printf '%s' "$second_inventory" | python3 -c "import json,sys; print(json.load(sys.stdin)['reservationId'])")

if [ "$first_reservation_id" != "$second_reservation_id" ]; then
  echo "Expected exact inventory replay to return the original reservation" >&2
  exit 1
fi

inventory_file=$(mktemp)
inventory_status=$(curl -sS -o "$inventory_file" -w "%{http_code}" -X POST http://127.0.0.1:4104/reservations/try \
  -H "Content-Type: application/json" -H "x-correlation-id: $correlation_id" -H "idempotency-key: $inventory_key" --data "$changed_inventory_body")
inventory_code=$(python3 -c "import json; print(json.load(open('$inventory_file')).get('code',''))")
rm -f "$inventory_file"

if [ "$inventory_status" != "409" ] || [ "$inventory_code" != "IDEMPOTENCY_CONFLICT" ]; then
  echo "Expected changed inventory replay to return 409 IDEMPOTENCY_CONFLICT" >&2
  exit 1
fi

curl -fsS -X POST http://127.0.0.1:4105/payments/mock-cancel \
  -H "Content-Type: application/json" -H "x-correlation-id: $correlation_id" --data "{\"orderId\":\"$first_order_id\"}" >/dev/null
curl -fsS -X POST http://127.0.0.1:4104/reservations/cancel \
  -H "Content-Type: application/json" -H "x-correlation-id: $correlation_id" -H "idempotency-key: $inventory_key" --data "$inventory_body" >/dev/null

echo "Server idempotency drill passed."
echo "Order: $first_order_id"
echo "Inventory reservation: $first_reservation_id"
echo "Correlation ID: $correlation_id"
'@

$remoteScript | & ssh -i $KeyPath -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new "$User@$HostName" "bash -s"
if ($LASTEXITCODE -ne 0) {
  throw "Server idempotency drill failed with exit code $LASTEXITCODE"
}
