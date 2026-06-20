param(
  [string]$HostName = "170.106.136.169",
  [string]$User = "ubuntu",
  [string]$KeyPath = "$env:USERPROFILE\.ssh\hlandteaware_tencent_rsa"
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $KeyPath)) { throw "SSH key not found: $KeyPath" }

$remoteScript = @'
set -euo pipefail
cd /opt/crossborder-commerce-kit/current

for migration in 032-payment-webhook-inbox.sql 033-payment-webhook-worker.sql 034-payment-transactions.sql 035-payment-capture-id.sql 036-payment-refunds.sql 038-payment-refund-webhooks.sql; do
  docker exec -i cbck-postgres psql -U commerce -d postgres -v ON_ERROR_STOP=1 < "infra/db/migrations/$migration" >/dev/null
done

store_id="00000000-0000-4000-8000-000000000001"
order_id="$(cat /proc/sys/kernel/random/uuid)"
transaction_id="$(cat /proc/sys/kernel/random/uuid)"
key_one="refund-drill-one-$(cat /proc/sys/kernel/random/uuid)"
key_two="refund-drill-two-$(cat /proc/sys/kernel/random/uuid)"

cleanup() {
  docker exec cbck-postgres psql -U commerce -d order_db -v ON_ERROR_STOP=1 -c \
    "DELETE FROM payment_refunds WHERE order_id = '$order_id'; DELETE FROM payment_transactions WHERE id = '$transaction_id'; DELETE FROM orders WHERE id = '$order_id';" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker exec cbck-postgres psql -U commerce -d order_db -v ON_ERROR_STOP=1 -c \
  "INSERT INTO orders (id, store_id, order_number, customer_email, status, payment_status, inventory_status, currency, total_minor, idempotency_key, request_fingerprint)
   VALUES ('$order_id', '$store_id', 'REF-DRILL-' || substring('$order_id', 1, 8), 'refund-drill@example.com', 'paid', 'paid', 'confirmed', 'USD', 9600, '$key_one:order', repeat('0', 64));
   INSERT INTO payment_transactions (id, store_id, order_id, provider, provider_payment_id, provider_capture_id, status, amount_minor, currency, idempotency_key, correlation_id, paid_at)
   VALUES ('$transaction_id', '$store_id', '$order_id', 'mock-payment', 'mock-payment-$order_id', 'mock-capture-$order_id', 'paid', 9600, 'USD', '$key_one:payment', 'refund-server-drill', now());" >/dev/null

post_refund() {
  local key="$1" amount="$2" output_file status
  output_file="$(mktemp)"
  status="$(curl -sS -o "$output_file" -w '%{http_code}' -X POST http://127.0.0.1:4001/payments/refunds \
    -H 'Content-Type: application/json' -H "idempotency-key: $key" -H 'x-admin-actor: refund-drill-admin' \
    --data "{\"orderId\":\"$order_id\",\"amountMinor\":$amount,\"currency\":\"USD\",\"reason\":\"Server refund drill\"}")"
  printf '%s|%s' "$status" "$(cat "$output_file")"
  rm -f "$output_file"
}

first="$(post_refund "$key_one" 3200)"
replay="$(post_refund "$key_one" 3200)"
changed="$(post_refund "$key_one" 3300)"
over="$(post_refund "refund-drill-over-$(cat /proc/sys/kernel/random/uuid)" 6401)"
partial_summary="$(curl -fsS "http://127.0.0.1:4001/payments/orders/$order_id/refunds")"
second="$(post_refund "$key_two" 6400)"
final_summary="$(curl -fsS "http://127.0.0.1:4001/payments/orders/$order_id/refunds")"

first_status="${first%%|*}"; first_body="${first#*|}"
replay_status="${replay%%|*}"; replay_body="${replay#*|}"
changed_status="${changed%%|*}"
second_status="${second%%|*}"
over_status="${over%%|*}"
first_id="$(printf '%s' "$first_body" | python3 -c "import json,sys; print(json.load(sys.stdin)['refundId'])")"
replay_id="$(printf '%s' "$replay_body" | python3 -c "import json,sys; print(json.load(sys.stdin)['refundId'])")"
partial_state="$(printf '%s' "$partial_summary" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f\"{d['refundedMinor']}|{d['reservedRefundMinor']}|{d['refundableMinor']}|{len(d['refunds'])}\")")"
final_state="$(printf '%s' "$final_summary" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f\"{d['paymentStatus']}|{d['refundedMinor']}|{d['reservedRefundMinor']}|{d['refundableMinor']}|{len(d['refunds'])}\")")"

if [ "$first_status" != "201" ] || [ "$replay_status" != "201" ] || [ "$first_id" != "$replay_id" ] \
  || [ "$changed_status" != "409" ] || [ "$second_status" != "201" ] || [ "$over_status" != "409" ]; then
  echo "Unexpected refund HTTP results: first=$first_status replay=$replay_status changed=$changed_status second=$second_status over=$over_status" >&2
  exit 1
fi
if [ "$partial_state" != "3200|3200|6400|1" ] || [ "$final_state" != "refunded|9600|9600|0|2" ]; then
  echo "Unexpected refund API summaries: partial=$partial_state final=$final_state" >&2
  exit 1
fi

state="$(docker exec cbck-postgres psql -U commerce -d order_db -t -A -F '|' -c \
  "SELECT count(*), sum(amount_minor), bool_and(status = 'completed') FROM payment_refunds WHERE order_id = '$order_id';
   SELECT status FROM payment_transactions WHERE id = '$transaction_id';" | tr -d '[:space:]')"
if [ "$state" != "2|9600|trefunded" ]; then
  echo "Unexpected refund database state: $state" >&2
  exit 1
fi

echo "Server payment refund drill passed."
echo "Order ID: $order_id"
echo "First refund ID: $first_id"
'@

$remoteScript | & ssh -i $KeyPath -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new "$User@$HostName" "bash -s"
if ($LASTEXITCODE -ne 0) { throw "Server payment refund drill failed with exit code $LASTEXITCODE" }
