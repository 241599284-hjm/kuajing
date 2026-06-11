\connect app_db

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES stores(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
