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

echo "Applying payment transactions migration..."
docker exec -i cbck-postgres psql -U commerce -d postgres -v ON_ERROR_STOP=1 < infra/db/migrations/034-payment-transactions.sql >/dev/null
docker exec -i cbck-postgres psql -U commerce -d postgres -v ON_ERROR_STOP=1 < infra/db/migrations/035-payment-capture-id.sql >/dev/null

store_id="00000000-0000-4000-8000-000000000001"
order_id="$(cat /proc/sys/kernel/random/uuid)"
provider="mock-payment"
provider_payment_id="mock_pi_$order_id"
idempotency_key="payment-transaction-drill-$(cat /proc/sys/kernel/random/uuid)"
drill_file="/workspace/services/payment-service/payment-transaction-drill.ts"

cleanup() {
  docker exec cbck-postgres psql -U commerce -d order_db -v ON_ERROR_STOP=1 \
    -c "DELETE FROM payment_transactions WHERE store_id = '$store_id' AND order_id = '$order_id'; DELETE FROM orders WHERE store_id = '$store_id' AND id = '$order_id';" >/dev/null 2>&1 || true
  docker exec cbck-payment-service rm -f "$drill_file" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker exec cbck-postgres psql -U commerce -d order_db -v ON_ERROR_STOP=1 -c \
  "INSERT INTO orders (id, store_id, order_number, customer_email, status, payment_status, inventory_status, currency, total_minor, idempotency_key, request_fingerprint)
   VALUES ('$order_id', '$store_id', 'PAY-DRILL-' || substring('$order_id', 1, 8), 'payment-drill@example.com', 'pending_payment', 'mock_created', 'reserved', 'USD', 9600, '$idempotency_key:order', repeat('0', 64));" >/dev/null

intent_body="{\"orderId\":\"$order_id\",\"idempotencyKey\":\"$idempotency_key\",\"amountMinor\":9600,\"currency\":\"USD\",\"customerEmail\":\"payment-drill@example.com\",\"returnUrl\":\"http://127.0.0.1:3000/payment-result\"}"
post_intent() {
  local response_file status
  response_file="$(mktemp)"
  status="$(curl -sS -o "$response_file" -w '%{http_code}' -X POST http://127.0.0.1:4106/payments/intents -H 'Content-Type: application/json' --data "$intent_body")"
  if [ "$status" != "201" ]; then
    echo "Payment intent returned HTTP $status: $(cat "$response_file")" >&2
    rm -f "$response_file"
    return 1
  fi
  cat "$response_file"
  rm -f "$response_file"
}
first_intent="$(post_intent)"
second_intent="$(post_intent)"
first_provider_id="$(printf '%s' "$first_intent" | python3 -c "import json,sys; print(json.load(sys.stdin)['providerPaymentId'])")"
second_provider_id="$(printf '%s' "$second_intent" | python3 -c "import json,sys; print(json.load(sys.stdin)['providerPaymentId'])")"
if [ "$first_provider_id" != "$provider_payment_id" ] || [ "$second_provider_id" != "$provider_payment_id" ]; then
  echo "Payment intent replay did not return the expected provider payment ID" >&2
  exit 1
fi

docker exec -i cbck-payment-service sh -c "cat > '$drill_file'" <<'TS'
import { PaymentTransactionRepository } from "./src/payment-transaction.ts";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const repository = new PaymentTransactionRepository();
const created = {
  storeId: "00000000-0000-4000-8000-000000000001",
  orderId: required("DRILL_ORDER_ID"),
  provider: required("DRILL_PROVIDER"),
  providerPaymentId: required("DRILL_PROVIDER_PAYMENT_ID"),
  amountMinor: 9600,
  currency: "USD",
  idempotencyKey: required("DRILL_IDEMPOTENCY_KEY"),
  correlationId: "payment-transaction-server-drill"
};

try {
  await repository.recordCreated(created);
  await repository.recordCreated(created);

  let createConflict = false;
  try {
    await repository.recordCreated({ ...created, amountMinor: 9700 });
  } catch {
    createConflict = true;
  }

  const paid = {
    storeId: created.storeId,
    orderId: created.orderId,
    provider: created.provider,
    providerPaymentId: created.providerPaymentId,
    providerCaptureId: "CAPTURE-TRANSACTION-DRILL",
    eventId: "PAYPAL-TRANSACTION-DRILL-EVENT",
    amountMinor: created.amountMinor,
    currency: created.currency
  };
  await repository.markPaid(paid);
  await repository.markPaid(paid);

  let paidMismatch = false;
  try {
    await repository.markPaid({ ...paid, amountMinor: 9700 });
  } catch {
    paidMismatch = true;
  }

  console.log(JSON.stringify({ createConflict, paidMismatch }));
  if (!createConflict || !paidMismatch) process.exitCode = 1;
} finally {
  await repository.onApplicationShutdown();
}
TS

docker exec \
  -e DRILL_ORDER_ID="$order_id" \
  -e DRILL_PROVIDER="$provider" \
  -e DRILL_PROVIDER_PAYMENT_ID="$provider_payment_id" \
  -e DRILL_IDEMPOTENCY_KEY="$idempotency_key" \
  -w /workspace/services/payment-service cbck-payment-service \
  pnpm exec tsx payment-transaction-drill.ts

row_state="$(docker exec cbck-postgres psql -U commerce -d order_db -t -A -F '|' -c \
  "SELECT status, amount_minor, currency, provider_capture_id, latest_event_id, paid_at IS NOT NULL FROM payment_transactions WHERE store_id = '$store_id' AND order_id = '$order_id';" | tr -d '[:space:]')"
if [ "$row_state" != "paid|9600|USD|CAPTURE-TRANSACTION-DRILL|PAYPAL-TRANSACTION-DRILL-EVENT|t" ]; then
  echo "Unexpected payment transaction state: $row_state" >&2
  exit 1
fi

echo "Server payment transaction drill passed."
echo "Order ID: $order_id"
echo "Provider: $provider"
echo "Provider payment ID: $provider_payment_id"
'@

$remoteScript | & ssh -i $KeyPath -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new "$User@$HostName" "bash -s"
if ($LASTEXITCODE -ne 0) {
  throw "Server payment transaction drill failed with exit code $LASTEXITCODE"
}
