CREATE TABLE IF NOT EXISTS homepage_layouts (
  store_id uuid PRIMARY KEY REFERENCES stores(id),
  layout jsonb NOT NULL,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
