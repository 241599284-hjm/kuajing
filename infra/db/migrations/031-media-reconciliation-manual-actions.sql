\connect media_db

ALTER TABLE media_reconciliation_tasks
  ADD COLUMN IF NOT EXISTS handled_by text,
  ADD COLUMN IF NOT EXISTS decision_note text,
  ADD COLUMN IF NOT EXISTS handled_at timestamptz;

ALTER TABLE media_reconciliation_tasks
  DROP CONSTRAINT IF EXISTS media_reconciliation_tasks_status_check;

ALTER TABLE media_reconciliation_tasks
  ADD CONSTRAINT media_reconciliation_tasks_status_check
  CHECK (status IN ('pending', 'processing', 'resolved_bound', 'cleaned', 'failed', 'discarded'));

CREATE TABLE IF NOT EXISTS media_reconciliation_audit_events (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  task_id uuid NOT NULL REFERENCES media_reconciliation_tasks(id),
  action text NOT NULL CHECK (action IN ('retry', 'discard')),
  actor_id text NOT NULL,
  decision_note text NOT NULL,
  old_status text NOT NULL,
  new_status text NOT NULL,
  idempotency_key text NOT NULL,
  correlation_id text NOT NULL,
  client_ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS media_reconciliation_audit_task_idx
  ON media_reconciliation_audit_events (task_id, created_at DESC);

-- Forward-only migration. Rollback before application rollout:
-- DROP TABLE media_reconciliation_audit_events;
-- ALTER TABLE media_reconciliation_tasks DROP COLUMN handled_by, DROP COLUMN decision_note, DROP COLUMN handled_at;
-- Recreate media_reconciliation_tasks_status_check without 'discarded'.
