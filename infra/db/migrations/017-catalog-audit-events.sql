\connect app_db

CREATE TABLE IF NOT EXISTS catalog_audit_events (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES stores(id),
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  actor_id text NOT NULL,
  summary text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS catalog_audit_events_entity_idx
  ON catalog_audit_events (store_id, entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS catalog_audit_events_created_idx
  ON catalog_audit_events (store_id, created_at DESC);
