CREATE TABLE IF NOT EXISTS inventory_audit_events (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  inventory_item_id uuid NOT NULL,
  action text NOT NULL,
  actor_id text NOT NULL,
  reason text NOT NULL,
  old_value jsonb NOT NULL,
  new_value jsonb NOT NULL,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_audit_events_item_idx
  ON inventory_audit_events (store_id, inventory_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS inventory_audit_events_created_idx
  ON inventory_audit_events (store_id, created_at DESC);
