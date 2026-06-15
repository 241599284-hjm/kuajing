\connect app_db

CREATE TABLE IF NOT EXISTS email_settings (
  store_id uuid PRIMARY KEY REFERENCES stores(id),
  provider text NOT NULL DEFAULT 'smtp',
  smtp_host text NOT NULL,
  smtp_port integer NOT NULL,
  smtp_secure boolean NOT NULL DEFAULT false,
  smtp_username text,
  smtp_password text,
  from_email text NOT NULL,
  from_name text NOT NULL,
  reply_to_email text,
  enabled boolean NOT NULL DEFAULT true,
  verification_token_ttl_minutes integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (smtp_port > 0 AND smtp_port <= 65535),
  CHECK (verification_token_ttl_minutes >= 5 AND verification_token_ttl_minutes <= 1440)
);

INSERT INTO email_settings (
  store_id,
  provider,
  smtp_host,
  smtp_port,
  smtp_secure,
  from_email,
  from_name,
  enabled
)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'smtp',
  'localhost',
  1025,
  false,
  'no-reply@demo-teaware.local',
  'Demo Teaware',
  true
)
ON CONFLICT (store_id) DO NOTHING;
