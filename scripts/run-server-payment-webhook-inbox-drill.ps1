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

echo "Applying payment webhook inbox migration..."
docker exec -i cbck-postgres psql -U commerce -d postgres -v ON_ERROR_STOP=1 < infra/db/migrations/032-payment-webhook-inbox.sql >/dev/null
docker exec -i cbck-postgres psql -U commerce -d postgres -v ON_ERROR_STOP=1 < infra/db/migrations/033-payment-webhook-worker.sql >/dev/null

event_id="PAYPAL-INBOX-DRILL-$(cat /proc/sys/kernel/random/uuid)"
store_id="00000000-0000-4000-8000-000000000001"
drill_file="/workspace/services/payment-service/payment-webhook-inbox-drill.ts"

cleanup() {
  docker exec cbck-postgres psql -U commerce -d order_db -v ON_ERROR_STOP=1 \
    -c "DELETE FROM payment_webhook_events WHERE store_id = '$store_id' AND provider = 'paypal' AND event_id = '$event_id';" >/dev/null 2>&1 || true
  docker exec cbck-payment-service rm -f "$drill_file" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker exec -i cbck-payment-service sh -c "cat > '$drill_file'" <<'TS'
import {
  PaymentWebhookInboxRepository,
  PaymentWebhookPayloadConflictError
} from "./src/payment-webhook-inbox.ts";

const eventId = process.env.DRILL_EVENT_ID;
if (!eventId) throw new Error("DRILL_EVENT_ID is required");
const storeId = "00000000-0000-4000-8000-000000000001";
const repository = new PaymentWebhookInboxRepository();
const input = {
  storeId,
  provider: "paypal",
  eventId,
  providerPaymentId: "PAYPAL-ORDER-DRILL",
  orderId: "00000000-0000-4000-8000-000000009001",
  eventType: "PAYMENT.CAPTURE.COMPLETED",
  payload: { eventId, amount: { amountMinor: 9600, currency: "USD" } },
  maxAttempts: 2,
  correlationId: "paypal-inbox-server-drill"
};

try {
  const first = await repository.claim(input);
  const inFlight = await repository.claim(input);
  const firstLease = (await repository.claimDue(20, 100)).find((task) => task.eventId === eventId);
  if (!firstLease || firstLease.eventId !== eventId) throw new Error("drill event was not leased");
  const retryStatus = await repository.markProcessingFailure(firstLease, "drill retry");
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const secondLease = (await repository.claimDue(20, 100)).find((task) => task.eventId === eventId);
  if (!secondLease || secondLease.eventId !== eventId) throw new Error("drill retry was not leased");
  const exhaustedStatus = await repository.markProcessingFailure(secondLease, "drill exhausted");
  const retry = await repository.claim(input);
  await repository.markProcessed(storeId, "paypal", eventId);
  const processed = await repository.claim(input);

  let conflict = false;
  try {
    await repository.claim({ ...input, payload: { eventId, amount: { amountMinor: 9700, currency: "USD" } } });
  } catch (error) {
    conflict = error instanceof PaymentWebhookPayloadConflictError;
  }

  const result = {
    eventId,
    first: first.decision,
    inFlight: inFlight.decision,
    retryStatus,
    exhaustedStatus,
    retry: retry.decision,
    retryAttemptCount: retry.attemptCount,
    processed: processed.decision,
    conflict
  };
  console.log(JSON.stringify(result));
  if (first.decision !== "claim_new"
    || inFlight.decision !== "duplicate_processing"
    || retryStatus !== "processing"
    || exhaustedStatus !== "failed"
    || retry.decision !== "claim_retry"
    || retry.attemptCount !== 1
    || processed.decision !== "duplicate_processed"
    || !conflict) {
    process.exitCode = 1;
  }
} finally {
  await repository.onApplicationShutdown();
}
TS

docker exec -e DRILL_EVENT_ID="$event_id" -w /workspace/services/payment-service cbck-payment-service \
  pnpm exec tsx payment-webhook-inbox-drill.ts

row_state="$(docker exec cbck-postgres psql -U commerce -d order_db -t -A -F '|' -c \
  "SELECT status, attempt_count, length(payload_hash) FROM payment_webhook_events WHERE store_id = '$store_id' AND provider = 'paypal' AND event_id = '$event_id';" | tr -d '[:space:]')"
if [ "$row_state" != "processed|1|64" ]; then
  echo "Expected processed|1|64, got $row_state" >&2
  exit 1
fi

echo "Server payment webhook inbox drill passed."
echo "Event ID: $event_id"
'@

$remoteScript | & ssh -i $KeyPath -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new "$User@$HostName" "bash -s"
if ($LASTEXITCODE -ne 0) {
  throw "Server payment webhook inbox drill failed with exit code $LASTEXITCODE"
}
