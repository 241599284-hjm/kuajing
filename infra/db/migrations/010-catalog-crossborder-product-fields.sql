\connect app_db

ALTER TABLE skus
  ADD COLUMN IF NOT EXISTS capacity text NOT NULL DEFAULT 'To be maintained',
  ADD COLUMN IF NOT EXISTS package_length_mm integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS package_width_mm integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS package_height_mm integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weight_grams integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customs_declaration text NOT NULL DEFAULT '';

ALTER TABLE product_translations
  ADD COLUMN IF NOT EXISTS customs_declaration text NOT NULL DEFAULT '';

UPDATE skus
SET capacity = 'Teapot 180 ml, cups 40 ml',
    package_length_mm = 320,
    package_width_mm = 240,
    package_height_mm = 120,
    weight_grams = 1500,
    customs_declaration = 'Porcelain teaware set for household tea brewing'
WHERE store_id = '00000000-0000-4000-8000-000000000001'
  AND sku_code = 'TEA-PORCELAIN-SET-001';
