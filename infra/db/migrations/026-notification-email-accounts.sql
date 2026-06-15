\connect notification_db

CREATE TABLE IF NOT EXISTS notification_email_accounts (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  provider text NOT NULL,
  label text NOT NULL,
  from_email_address text NOT NULL,
  daily_limit integer NOT NULL,
  used_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  failure_count integer NOT NULL DEFAULT 0,
  secret_id_ref text NOT NULL,
  secret_key_ref text NOT NULL,
  usage_date date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (daily_limit > 0),
  CHECK (used_count >= 0),
  CHECK (failure_count >= 0),
  CHECK (status IN ('active', 'quota_exhausted', 'disabled'))
);

CREATE INDEX IF NOT EXISTS notification_email_accounts_store_status_idx
  ON notification_email_accounts (store_id, status, created_at ASC);

INSERT INTO notification_email_accounts (
  id,
  store_id,
  provider,
  label,
  from_email_address,
  daily_limit,
  used_count,
  status,
  failure_count,
  secret_id_ref,
  secret_key_ref
)
VALUES (
  '00000000-0000-4000-8000-000000411101',
  '00000000-0000-4000-8000-000000000001',
  'mock',
  'local-mock',
  'Demo Teaware <notify@demo-teaware.local>',
  40,
  0,
  'active',
  0,
  'env:NOTIFICATION_EMAIL_ACCOUNTS_JSON',
  'env:NOTIFICATION_EMAIL_ACCOUNTS_JSON'
)
ON CONFLICT (id) DO NOTHING;
