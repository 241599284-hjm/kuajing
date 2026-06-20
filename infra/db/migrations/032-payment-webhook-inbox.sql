\connect order_db

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  store_id uuid NOT NULL,
  provider text NOT NULL,
  event_id text NOT NULL,
  provider_payment_id text NOT NULL,
  order_id uuid NOT NULL,
  event_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('processing', 'processed', 'failed')),
  payload jsonb NOT NULL,
  payload_hash char(64) NOT NULL,
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  last_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, provider, event_id)
);

CREATE INDEX IF NOT EXISTS payment_webhook_events_status_idx
  ON payment_webhook_events (status, updated_at);

-- Forward-only migration. Rollback before application rollout:
-- DROP TABLE payment_webhook_events;
