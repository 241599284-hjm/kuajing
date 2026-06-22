\connect order_db

ALTER TABLE order_lines
  ADD COLUMN IF NOT EXISTS customs_declaration_snapshot text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS origin_country_snapshot text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS weight_grams_snapshot integer NOT NULL DEFAULT 0;

ALTER TABLE order_lines
  DROP CONSTRAINT IF EXISTS order_lines_weight_grams_snapshot_check;

ALTER TABLE order_lines
  ADD CONSTRAINT order_lines_weight_grams_snapshot_check CHECK (weight_grams_snapshot >= 0);
