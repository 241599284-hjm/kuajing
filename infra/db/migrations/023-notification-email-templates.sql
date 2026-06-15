\connect notification_db

CREATE TABLE IF NOT EXISTS notification_email_templates (
  store_id uuid NOT NULL,
  template_key text NOT NULL,
  name_zh text NOT NULL,
  name_en text NOT NULL,
  subject_zh text NOT NULL,
  subject_en text NOT NULL,
  html_zh text NOT NULL,
  html_en text NOT NULL,
  text_zh text NOT NULL,
  text_en text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, template_key)
);

CREATE INDEX IF NOT EXISTS notification_email_templates_store_idx
  ON notification_email_templates (store_id, updated_at DESC);
