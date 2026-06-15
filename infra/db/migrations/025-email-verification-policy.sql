\connect app_db

ALTER TABLE email_settings
  ADD COLUMN IF NOT EXISTS verification_token_ttl_minutes integer NOT NULL DEFAULT 30;

ALTER TABLE email_settings
  DROP CONSTRAINT IF EXISTS email_settings_verification_token_ttl_minutes_check;

ALTER TABLE email_settings
  ADD CONSTRAINT email_settings_verification_token_ttl_minutes_check
  CHECK (verification_token_ttl_minutes >= 5 AND verification_token_ttl_minutes <= 1440);
