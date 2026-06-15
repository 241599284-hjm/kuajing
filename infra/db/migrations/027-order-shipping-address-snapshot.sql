ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_country_snapshot text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS shipping_province_snapshot text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS shipping_city_snapshot text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS shipping_postal_code_snapshot text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS shipping_street_snapshot text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS orders_shipping_country_idx
  ON orders (store_id, shipping_country_snapshot);
