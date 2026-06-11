\connect order_db

CREATE TABLE IF NOT EXISTS compensation_tasks (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  task_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 8,
  next_run_at timestamptz NOT NULL,
  last_error text,
  correlation_id text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS compensation_tasks_due_idx
  ON compensation_tasks (status, next_run_at);

CREATE TABLE IF NOT EXISTS dead_letter_tasks (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  source_task_id uuid,
  task_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  status text NOT NULL,
  failure_reason text NOT NULL,
  correlation_id text NOT NULL,
  payload jsonb NOT NULL,
  handler_id text,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  handled_at timestamptz
);

CREATE INDEX IF NOT EXISTS dead_letter_tasks_status_idx
  ON dead_letter_tasks (status, created_at DESC);
