\connect app_db

CREATE TABLE IF NOT EXISTS visitor_sessions (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  ip_ciphertext text,
  ip_masked text NOT NULL,
  country_code text,
  country_name text NOT NULL DEFAULT 'Unknown',
  user_agent text NOT NULL DEFAULT '',
  referrer text NOT NULL DEFAULT '',
  landing_path text NOT NULL,
  exit_path text NOT NULL,
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  consent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visitor_sessions_day_idx
  ON visitor_sessions (store_id, started_at DESC);

CREATE TABLE IF NOT EXISTS visitor_page_views (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES visitor_sessions(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  path text NOT NULL,
  title text NOT NULL DEFAULT '',
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  entered_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  exited_at timestamptz
);

CREATE INDEX IF NOT EXISTS visitor_page_views_session_idx
  ON visitor_page_views (store_id, session_id, entered_at);

COMMENT ON TABLE visitor_sessions IS
  'First-party consented storefront analytics. Retention is enforced by analytics-service, default 30 days.';
COMMENT ON COLUMN visitor_sessions.ip_ciphertext IS
  'AES-256-GCM encrypted source IP; never write plaintext IP to application logs.';

CREATE TABLE IF NOT EXISTS visitor_server_requests (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  ip_ciphertext text,
  ip_masked text NOT NULL,
  country_code text,
  country_name text NOT NULL DEFAULT 'Unknown',
  path text NOT NULL,
  referrer text NOT NULL DEFAULT '',
  user_agent text NOT NULL DEFAULT '',
  requested_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visitor_server_requests_day_idx
  ON visitor_server_requests (store_id, requested_at DESC);

COMMENT ON TABLE visitor_server_requests IS
  'Server-side storefront document requests collected for security and operations regardless of analytics consent; default retention 14 days.';
