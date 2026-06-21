\connect order_db

CREATE TABLE IF NOT EXISTS paypal_configurations (
  store_id uuid NOT NULL,
  environment text NOT NULL CHECK (environment IN ('sandbox', 'live')),
  client_id text NOT NULL CHECK (length(client_id) BETWEEN 1 AND 500),
  secret_ciphertext text NOT NULL,
  secret_iv text NOT NULL,
  secret_auth_tag text NOT NULL,
  webhook_id text,
  webhook_events jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(webhook_events) = 'array'),
  enabled boolean NOT NULL DEFAULT true,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_tested_at timestamptz,
  last_test_status text CHECK (last_test_status IN ('succeeded', 'failed')),
  last_test_error_code text,
  PRIMARY KEY (store_id, environment)
);

CREATE TABLE IF NOT EXISTS paypal_configuration_audit_events (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  environment text NOT NULL CHECK (environment IN ('sandbox', 'live')),
  action text NOT NULL CHECK (action IN ('updated', 'connectivity_tested')),
  actor_id text NOT NULL,
  actor_ip text NOT NULL DEFAULT 'unknown',
  correlation_id text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE paypal_configuration_audit_events
  ADD COLUMN IF NOT EXISTS actor_ip text NOT NULL DEFAULT 'unknown';

CREATE INDEX IF NOT EXISTS paypal_configuration_audit_lookup_idx
  ON paypal_configuration_audit_events (store_id, environment, occurred_at DESC);

-- Forward-only migration. Secret plaintext is never stored.
