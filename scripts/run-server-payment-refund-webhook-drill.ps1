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
docker exec -i cbck-postgres psql -U commerce -d postgres -v ON_ERROR_STOP=1 < infra/db/migrations/038-payment-refund-webhooks.sql >/dev/null

store_id="00000000-0000-4000-8000-000000000001"
order_id="$(cat /proc/sys/kernel/random/uuid)"
transaction_id="$(cat /proc/sys/kernel/random/uuid)"
completed_id="$(cat /proc/sys/kernel/random/uuid)"
failed_id="$(cat /proc/sys/kernel/random/uuid)"
pending_id="$(cat /proc/sys/kernel/random/uuid)"

cleanup() {
  docker exec cbck-postgres psql -U commerce -d order_db -v ON_ERROR_STOP=1 -c \
    "DELETE FROM payment_refunds WHERE order_id = '$order_id'; DELETE FROM payment_transactions WHERE id = '$transaction_id'; DELETE FROM orders WHERE id = '$order_id';" >/dev/null 2>&1 || true
  docker exec cbck-payment-service rm -f /workspace/services/payment-service/refund-webhook-drill.ts >/dev/null 2>&1 || true
  rm -f /tmp/refund-webhook-drill.ts
}
trap cleanup EXIT

docker exec cbck-postgres psql -U commerce -d order_db -v ON_ERROR_STOP=1 -c \
  "INSERT INTO orders (id, store_id, order_number, customer_email, status, payment_status, inventory_status, currency, total_minor, idempotency_key, request_fingerprint)
   VALUES ('$order_id', '$store_id', 'REF-WH-' || substring('$order_id', 1, 8), 'refund-webhook-drill@example.com', 'paid', 'paid', 'confirmed', 'USD', 9600, 'refund-webhook-$order_id', repeat('0', 64));
   INSERT INTO payment_transactions (id, store_id, order_id, provider, provider_payment_id, provider_capture_id, status, amount_minor, currency, idempotency_key, correlation_id, paid_at)
   VALUES ('$transaction_id', '$store_id', '$order_id', 'paypal', 'PAYPAL-$order_id', 'CAPTURE-$order_id', 'paid', 9600, 'USD', 'refund-webhook-payment-$order_id', 'refund-webhook-drill', now());
   INSERT INTO payment_refunds (id, payment_transaction_id, store_id, order_id, provider, provider_refund_id, amount_minor, currency, status, idempotency_key, reason, actor_id, correlation_id)
   VALUES
     ('$completed_id', '$transaction_id', '$store_id', '$order_id', 'paypal', 'REFUND-COMPLETED-$order_id', 3200, 'USD', 'pending', 'refund-completed-$order_id', 'Webhook completed drill', 'drill', 'refund-webhook-drill'),
     ('$failed_id', '$transaction_id', '$store_id', '$order_id', 'paypal', 'REFUND-FAILED-$order_id', 2000, 'USD', 'pending', 'refund-failed-$order_id', 'Webhook failed drill', 'drill', 'refund-webhook-drill'),
     ('$pending_id', '$transaction_id', '$store_id', '$order_id', 'paypal', 'REFUND-PENDING-$order_id', 1000, 'USD', 'processing', 'refund-pending-$order_id', 'Webhook pending drill', 'drill', 'refund-webhook-drill');" >/dev/null

cat >/tmp/refund-webhook-drill.ts <<TS
import { processPaymentWebhookTask } from "./src/payment-webhook-worker.js";
import { PaymentRefundRepository } from "./src/payment-refund.js";

const storeId = "$store_id";
const repository = new PaymentRefundRepository();
const options = {
  orderServiceUrl: "http://order-service:4105",
  fetchFn: async () => { throw new Error("refund webhook called the order service"); },
  markTransactionPaid: async () => { throw new Error("refund webhook marked a payment paid"); },
  reconcileRefund: (input: Parameters<PaymentRefundRepository["applyProviderEvent"]>[0]) => repository.applyProviderEvent(input)
};
const task = (eventId: string, eventType: string, providerRefundId: string, status: string, amountMinor: number) => ({
  storeId, provider: "paypal", eventId, providerPaymentId: providerRefundId, orderId: null,
  eventType, payload: { eventId, eventType, providerPaymentId: providerRefundId, providerRefundId, status, amount: { amountMinor, currency: "USD" } },
  attemptCount: 1, maxAttempts: 8, correlationId: "refund-webhook-drill"
});

try {
  await processPaymentWebhookTask(task("WH-COMPLETED", "PAYMENT.CAPTURE.REFUNDED", "REFUND-COMPLETED-$order_id", "refund_completed", 3200), options);
  await processPaymentWebhookTask(task("WH-FAILED", "PAYMENT.REFUND.FAILED", "REFUND-FAILED-$order_id", "refund_failed", 2000), options);
  await processPaymentWebhookTask(task("WH-PENDING", "PAYMENT.REFUND.PENDING", "REFUND-PENDING-$order_id", "refund_pending", 1000), options);
  await processPaymentWebhookTask(task("WH-COMPLETED-REPLAY", "PAYMENT.CAPTURE.REFUNDED", "REFUND-COMPLETED-$order_id", "refund_completed", 3200), options);
  let conflict = false;
  try {
    await processPaymentWebhookTask(task("WH-CONFLICT", "PAYMENT.REFUND.FAILED", "REFUND-COMPLETED-$order_id", "refund_failed", 3200), options);
  } catch (error) {
    conflict = error instanceof Error && error.message.includes("terminal status conflicts");
  }
  if (!conflict) throw new Error("contradictory terminal refund event was not rejected");
} finally {
  await repository.onApplicationShutdown();
}
TS

docker cp /tmp/refund-webhook-drill.ts cbck-payment-service:/workspace/services/payment-service/refund-webhook-drill.ts >/dev/null
docker exec cbck-payment-service sh -lc 'cd /workspace/services/payment-service && pnpm exec tsx refund-webhook-drill.ts'

state="$(docker exec cbck-postgres psql -U commerce -d order_db -t -A -F '|' -c \
  "SELECT string_agg(status, ',' ORDER BY amount_minor DESC), count(*) FILTER (WHERE completed_at IS NOT NULL) FROM payment_refunds WHERE order_id = '$order_id';
   SELECT status FROM payment_transactions WHERE id = '$transaction_id';
   SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_webhook_events' AND column_name = 'order_id';" | tr -d '[:space:]')"
if [ "$state" != "completed,failed,pending|1partially_refundedYES" ]; then
  echo "Unexpected refund webhook database state: $state" >&2
  exit 1
fi

echo "Server payment refund webhook drill passed."
echo "Order ID: $order_id"
'@

$remoteScript | & ssh -i $KeyPath -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new "$User@$HostName" "bash -s"
if ($LASTEXITCODE -ne 0) { throw "Server payment refund webhook drill failed with exit code $LASTEXITCODE" }
