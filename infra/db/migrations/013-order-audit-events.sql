CREATE TABLE IF NOT EXISTS order_audit_events (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES orders(id),
  action text NOT NULL,
  actor_id text NOT NULL,
  reason text NOT NULL,
  old_value jsonb NOT NULL,
  new_value jsonb NOT NULL,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_audit_events_order_idx
  ON order_audit_events (store_id, order_id, created_at DESC);
