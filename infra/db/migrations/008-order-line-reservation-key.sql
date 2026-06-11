\connect order_db

ALTER TABLE order_lines
  ADD COLUMN IF NOT EXISTS inventory_reservation_key_snapshot text;

CREATE INDEX IF NOT EXISTS order_lines_order_id_idx
  ON order_lines (order_id);
