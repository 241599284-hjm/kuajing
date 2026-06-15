ALTER TABLE order_lines
  ADD COLUMN IF NOT EXISTS product_slug_snapshot text;

CREATE INDEX IF NOT EXISTS order_lines_product_slug_idx
  ON order_lines (store_id, product_slug_snapshot);
