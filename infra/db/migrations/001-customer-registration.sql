\connect app_db

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES stores(id),
  username text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending_email_verification',
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, username),
  UNIQUE (store_id, email)
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES stores(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  token text NOT NULL UNIQUE,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
