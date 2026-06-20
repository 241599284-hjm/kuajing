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

echo "Applying media reconciliation manual action migration..."
docker exec -i cbck-postgres psql -U commerce -d postgres -v ON_ERROR_STOP=1 < infra/db/migrations/031-media-reconciliation-manual-actions.sql >/dev/null

store_id="00000000-0000-4000-8000-000000000001"
retry_task_id="$(cat /proc/sys/kernel/random/uuid)"
retry_asset_id="$(cat /proc/sys/kernel/random/uuid)"
discard_task_id="$(cat /proc/sys/kernel/random/uuid)"
discard_asset_id="$(cat /proc/sys/kernel/random/uuid)"
correlation_id="media-manual-drill-$(cat /proc/sys/kernel/random/uuid)"
retry_key="media-retry-$(cat /proc/sys/kernel/random/uuid)"
discard_key="media-discard-$(cat /proc/sys/kernel/random/uuid)"

insert_failed_task() {
  local task_id="$1"
  local asset_id="$2"
  docker exec cbck-postgres psql -U commerce -d media_db -v ON_ERROR_STOP=1 \
    -c "INSERT INTO media_reconciliation_tasks (
          id, store_id, asset_id, object_keys, status, unbound_observations,
          attempt_count, max_attempts, next_run_at, last_error, correlation_id, completed_at
        ) VALUES (
          '$task_id', '$store_id', '$asset_id',
          jsonb_build_array('$store_id/product-media/image/drill/$asset_id.png'),
          'failed', 0, 2, 2, now(), 'manual drill failure', '$correlation_id', now()
        );" >/dev/null
}

post_action() {
  local task_id="$1"
  local action="$2"
  local idempotency_key="$3"
  local output_file="$4"
  curl -sS -o "$output_file" -w "%{http_code}" -X POST \
    "http://127.0.0.1:4001/media/reconciliation-tasks/$task_id/$action" \
    -H "Content-Type: application/json" \
    -H "x-admin-actor: server-drill" \
    -H "x-correlation-id: $correlation_id" \
    -H "idempotency-key: $idempotency_key" \
    --data '{"decisionNote":"Server manual reconciliation drill"}'
}

insert_failed_task "$retry_task_id" "$retry_asset_id"
insert_failed_task "$discard_task_id" "$discard_asset_id"

retry_file="$(mktemp)"
retry_status="$(post_action "$retry_task_id" retry "$retry_key" "$retry_file")"
retry_task_status="$(python3 -c "import json; print(json.load(open('$retry_file'))['task']['status'])")"
retry_replayed="$(python3 -c "import json; print(str(json.load(open('$retry_file'))['replayed']).lower())")"
if [ "$retry_status" != "201" ] || [ "$retry_task_status" != "pending" ] || [ "$retry_replayed" != "false" ]; then
  cat "$retry_file" >&2
  echo "Expected first retry to return 201, pending, replayed=false" >&2
  exit 1
fi

replay_status="$(post_action "$retry_task_id" retry "$retry_key" "$retry_file")"
replay_flag="$(python3 -c "import json; print(str(json.load(open('$retry_file'))['replayed']).lower())")"
if [ "$replay_status" != "201" ] || [ "$replay_flag" != "true" ]; then
  cat "$retry_file" >&2
  echo "Expected exact retry replay to return replayed=true" >&2
  exit 1
fi

conflict_file="$(mktemp)"
conflict_status="$(post_action "$retry_task_id" discard "$retry_key" "$conflict_file")"
conflict_code="$(python3 -c "import json; print(json.load(open('$conflict_file')).get('code',''))")"
if [ "$conflict_status" != "409" ] || [ "$conflict_code" != "CONFLICT" ]; then
  cat "$conflict_file" >&2
  echo "Expected reused key with another action to return 409 CONFLICT" >&2
  exit 1
fi

new_key_file="$(mktemp)"
new_key_status="$(post_action "$retry_task_id" retry "media-retry-again-$(cat /proc/sys/kernel/random/uuid)" "$new_key_file")"
new_key_code="$(python3 -c "import json; print(json.load(open('$new_key_file')).get('code',''))")"
if [ "$new_key_status" != "409" ] || [ "$new_key_code" != "CONFLICT" ]; then
  cat "$new_key_file" >&2
  echo "Expected a non-failed task to reject another manual action" >&2
  exit 1
fi

discard_file="$(mktemp)"
discard_status="$(post_action "$discard_task_id" discard "$discard_key" "$discard_file")"
discard_task_status="$(python3 -c "import json; print(json.load(open('$discard_file'))['task']['status'])")"
if [ "$discard_status" != "201" ] || [ "$discard_task_status" != "discarded" ]; then
  cat "$discard_file" >&2
  echo "Expected discard to return 201 and discarded" >&2
  exit 1
fi

audit_count="$(docker exec cbck-postgres psql -U commerce -d media_db -t -A -c "SELECT count(*) FROM media_reconciliation_audit_events WHERE correlation_id = '$correlation_id';" | tr -d '[:space:]')"
if [ "$audit_count" != "2" ]; then
  echo "Expected exactly two persisted manual audit events, got $audit_count" >&2
  exit 1
fi

rm -f "$retry_file" "$conflict_file" "$new_key_file" "$discard_file"

echo "Server media reconciliation manual action drill passed."
echo "Retry task: $retry_task_id"
echo "Discard task: $discard_task_id"
echo "Correlation ID: $correlation_id"
'@

$remoteScript | & ssh -i $KeyPath -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new "$User@$HostName" "bash -s"
if ($LASTEXITCODE -ne 0) {
  throw "Server media reconciliation manual action drill failed with exit code $LASTEXITCODE"
}
