\connect app_db

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS scheduled_publish_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_unpublish_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS products_scheduled_publish_idx
  ON products (store_id, scheduled_publish_at)
  WHERE scheduled_publish_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_scheduled_unpublish_idx
  ON products (store_id, scheduled_unpublish_at)
  WHERE scheduled_unpublish_at IS NOT NULL;
