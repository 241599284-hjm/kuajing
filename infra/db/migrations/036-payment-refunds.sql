\connect order_db

CREATE TABLE IF NOT EXISTS payment_refunds (
  id uuid PRIMARY KEY,
  payment_transaction_id uuid NOT NULL REFERENCES payment_transactions(id),
  store_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES orders(id),
  provider text NOT NULL,
  provider_refund_id text,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL CHECK (status IN ('processing', 'pending', 'completed', 'failed')),
  idempotency_key text NOT NULL,
  reason text NOT NULL,
  actor_id text NOT NULL,
  correlation_id text NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_refunds_provider_id_idx
  ON payment_refunds (store_id, provider, provider_refund_id)
  WHERE provider_refund_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_refunds_transaction_idx
  ON payment_refunds (payment_transaction_id, created_at DESC);

-- Forward-only migration. Rollback before application rollout:
-- DROP TABLE payment_refunds;
