\connect order_db

CREATE TABLE IF NOT EXISTS dead_letter_audit_events (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  dead_letter_task_id uuid NOT NULL REFERENCES dead_letter_tasks(id),
  action text NOT NULL,
  actor_id text NOT NULL,
  decision_note text NOT NULL,
  old_status text NOT NULL,
  new_status text NOT NULL,
  correlation_id text NOT NULL,
  client_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dead_letter_audit_events_task_idx
  ON dead_letter_audit_events (dead_letter_task_id, created_at DESC);
