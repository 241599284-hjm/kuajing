\connect ledger_db

CREATE TABLE IF NOT EXISTS daily_reconciliation (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  business_date date NOT NULL,
  order_count integer NOT NULL DEFAULT 0,
  paid_amount_minor integer NOT NULL DEFAULT 0,
  paid_currency text NOT NULL DEFAULT 'USD',
  inventory_delta integer NOT NULL DEFAULT 0,
  mismatch_flag boolean NOT NULL DEFAULT false,
  mismatch_reason text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, business_date)
);

CREATE INDEX IF NOT EXISTS daily_reconciliation_business_date_idx
  ON daily_reconciliation (business_date DESC);
