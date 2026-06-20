\connect app_db

ALTER TABLE newsletter_subscriptions
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS status_updated_by text NOT NULL DEFAULT 'storefront';

CREATE INDEX IF NOT EXISTS newsletter_subscriptions_status_idx
  ON newsletter_subscriptions (store_id, status, consent_at DESC);

CREATE TABLE IF NOT EXISTS newsletter_subscription_events (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  email text NOT NULL,
  action text NOT NULL CHECK (action IN ('subscribed', 'reactivated', 'unsubscribed')),
  actor text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, email)
    REFERENCES newsletter_subscriptions (store_id, email)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS newsletter_subscription_events_lookup_idx
  ON newsletter_subscription_events (store_id, email, occurred_at DESC);
