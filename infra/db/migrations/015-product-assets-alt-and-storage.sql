\connect app_db

ALTER TABLE product_assets
  ADD COLUMN IF NOT EXISTS alt_text_en text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS alt_text_zh text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS object_key text,
  ADD COLUMN IF NOT EXISTS original_name text,
  ADD COLUMN IF NOT EXISTS usage_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS product_assets_product_sort_idx
  ON product_assets (store_id, product_id, asset_kind, sort_order);

CREATE INDEX IF NOT EXISTS product_assets_object_key_idx
  ON product_assets (store_id, object_key);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_assets_usage_status_check'
  ) THEN
    ALTER TABLE product_assets
      ADD CONSTRAINT product_assets_usage_status_check
      CHECK (usage_status IN ('active', 'draft', 'quarantined', 'deleted'));
  END IF;
END $$;
