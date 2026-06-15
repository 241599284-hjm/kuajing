\connect logistics_db

CREATE TABLE IF NOT EXISTS logistics_api_accounts (
  id uuid PRIMARY KEY,
  provider text NOT NULL,
  account_name text NOT NULL,
  api_endpoint text,
  api_key_secret text,
  monthly_limit integer NOT NULL DEFAULT 40,
  used_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 0,
  reset_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (monthly_limit >= 0),
  CHECK (used_count >= 0)
);

CREATE TABLE IF NOT EXISTS logistics_tracking_cache (
  tracking_number text PRIMARY KEY,
  carrier text NOT NULL,
  status text NOT NULL,
  status_label_en text NOT NULL,
  status_label_zh text NOT NULL,
  events_json jsonb NOT NULL,
  provider text NOT NULL,
  provider_mode text NOT NULL,
  cached_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  terminal boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS logistics_api_call_logs (
  id uuid PRIMARY KEY,
  tracking_number text NOT NULL,
  provider text NOT NULL,
  account_name text NOT NULL,
  status text NOT NULL,
  error_summary text,
  consumed_quota boolean NOT NULL DEFAULT false,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS logistics_call_logs_tracking_idx ON logistics_api_call_logs (tracking_number, created_at DESC);
