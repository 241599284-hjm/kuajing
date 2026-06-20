\connect media_db

CREATE TABLE IF NOT EXISTS media_reconciliation_tasks (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  object_keys jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  unbound_observations integer NOT NULL DEFAULT 0,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 8,
  next_run_at timestamptz NOT NULL,
  last_error text,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT media_reconciliation_tasks_status_check
    CHECK (status IN ('pending', 'processing', 'resolved_bound', 'cleaned', 'failed')),
  CONSTRAINT media_reconciliation_tasks_object_keys_check
    CHECK (jsonb_typeof(object_keys) = 'array'),
  CONSTRAINT media_reconciliation_tasks_attempts_check
    CHECK (attempt_count >= 0 AND max_attempts > 0),
  UNIQUE (store_id, asset_id)
);

CREATE INDEX IF NOT EXISTS media_reconciliation_tasks_due_idx
  ON media_reconciliation_tasks (next_run_at, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS media_reconciliation_tasks_status_idx
  ON media_reconciliation_tasks (store_id, status, created_at DESC);

-- Forward-only migration. Rollback, if required before application rollout, is:
-- DROP TABLE media_reconciliation_tasks;
