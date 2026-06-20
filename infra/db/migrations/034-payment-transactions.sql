\connect order_db

CREATE TABLE IF NOT EXISTS payment_transactions (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES orders(id),
  provider text NOT NULL,
  provider_payment_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('created', 'paid', 'failed', 'cancelled', 'partially_refunded', 'refunded')),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  idempotency_key text NOT NULL,
  latest_event_id text,
  correlation_id text NOT NULL,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, provider, idempotency_key),
  UNIQUE (store_id, provider, provider_payment_id)
);

CREATE INDEX IF NOT EXISTS payment_transactions_order_idx
  ON payment_transactions (store_id, order_id, created_at DESC);

-- Forward-only migration. Rollback before application rollout:
-- DROP TABLE payment_transactions;
