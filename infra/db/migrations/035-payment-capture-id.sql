\connect order_db

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS provider_capture_id text;

CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_provider_capture_idx
  ON payment_transactions (store_id, provider, provider_capture_id)
  WHERE provider_capture_id IS NOT NULL;

-- Forward-only migration. Rollback before application rollout:
-- DROP INDEX payment_transactions_provider_capture_idx;
-- ALTER TABLE payment_transactions DROP COLUMN provider_capture_id;
