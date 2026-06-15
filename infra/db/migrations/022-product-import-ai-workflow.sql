CREATE TABLE IF NOT EXISTS product_import_config (
  id text PRIMARY KEY,
  settings jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_import_tasks (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  source_url text NOT NULL,
  source_title text NOT NULL DEFAULT '',
  status text NOT NULL,
  copy_status text NOT NULL,
  image_status text NOT NULL,
  failure_reason text,
  draft jsonb NOT NULL,
  created_by text NOT NULL,
  published_product_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, source_url)
);

CREATE INDEX IF NOT EXISTS product_import_tasks_status_idx
  ON product_import_tasks (store_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS product_import_audit_events (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  task_id uuid,
  action text NOT NULL,
  actor_id text NOT NULL,
  summary text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_import_audit_events_task_idx
  ON product_import_audit_events (store_id, task_id, created_at DESC);
