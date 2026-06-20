\connect order_db

ALTER TABLE payment_webhook_events
  ALTER COLUMN order_id DROP NOT NULL;
