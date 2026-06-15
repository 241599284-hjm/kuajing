CREATE TABLE IF NOT EXISTS notification_email_logs (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  provider text NOT NULL,
  recipient_email text NOT NULL,
  subject text NOT NULL,
  template_key text,
  status text NOT NULL,
  provider_message_id text,
  error_summary text,
  consumed_quota boolean NOT NULL DEFAULT false,
  correlation_id text NOT NULL,
  duration_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS notification_email_logs_store_created_idx
  ON notification_email_logs (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notification_email_logs_recipient_template_idx
  ON notification_email_logs (store_id, recipient_email, template_key, created_at DESC);
