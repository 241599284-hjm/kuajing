\connect media_db

CREATE TABLE IF NOT EXISTS media_audit_events (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  action text NOT NULL,
  actor_id text NOT NULL,
  object_key text,
  asset_id uuid,
  summary text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_audit_events_store_created_idx
  ON media_audit_events (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS media_audit_events_object_idx
  ON media_audit_events (store_id, object_key, created_at DESC);
