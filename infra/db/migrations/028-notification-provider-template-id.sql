\connect notification_db

ALTER TABLE notification_email_templates
  ADD COLUMN IF NOT EXISTS provider_template_id text;
