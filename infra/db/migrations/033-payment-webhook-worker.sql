\connect order_db

ALTER TABLE payment_webhook_events
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS correlation_id text NOT NULL DEFAULT 'unknown';

ALTER TABLE payment_webhook_events
  DROP CONSTRAINT IF EXISTS payment_webhook_events_max_attempts_check;

ALTER TABLE payment_webhook_events
  ADD CONSTRAINT payment_webhook_events_max_attempts_check
  CHECK (max_attempts > 0 AND max_attempts <= 100);

CREATE INDEX IF NOT EXISTS payment_webhook_events_due_idx
  ON payment_webhook_events (status, next_attempt_at);

-- Forward-only migration. Rollback before application rollout:
-- DROP INDEX payment_webhook_events_due_idx;
-- ALTER TABLE payment_webhook_events DROP COLUMN max_attempts, DROP COLUMN next_attempt_at, DROP COLUMN correlation_id;
