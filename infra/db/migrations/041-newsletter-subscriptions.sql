CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
  store_id uuid NOT NULL REFERENCES stores(id),
  email text NOT NULL,
  locale text NOT NULL DEFAULT 'en',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed')),
  consent_at timestamptz NOT NULL DEFAULT now(),
  unsubscribed_at timestamptz,
  PRIMARY KEY (store_id, email)
);
