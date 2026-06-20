\connect order_db

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS request_fingerprint text;
