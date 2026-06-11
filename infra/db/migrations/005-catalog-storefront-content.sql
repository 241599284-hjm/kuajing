\connect app_db

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES stores(id),
  slug text NOT NULL,
  image_url text NOT NULL,
  is_visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, slug)
);

CREATE TABLE IF NOT EXISTS category_translations (
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  locale text NOT NULL,
  name text NOT NULL,
  PRIMARY KEY (category_id, locale)
);

CREATE TABLE IF NOT EXISTS regions (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES stores(id),
  slug text NOT NULL,
  image_url text NOT NULL,
  icon text NOT NULL,
  is_visible boolean NOT NULL DEFAULT true,
  show_on_homepage boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, slug)
);

CREATE TABLE IF NOT EXISTS region_translations (
  region_id uuid NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  locale text NOT NULL,
  name text NOT NULL,
  landmark text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  more_label text NOT NULL,
  PRIMARY KEY (region_id, locale)
);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES categories(id),
  ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES regions(id),
  ADD COLUMN IF NOT EXISTS image_url text NOT NULL DEFAULT '/assets/porcelain-tea-set-photo.jpg',
  ADD COLUMN IF NOT EXISTS original_price_minor integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_sales integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_qty integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sales_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS product_translations (
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  locale text NOT NULL,
  name text NOT NULL,
  tag text NOT NULL,
  short_description text NOT NULL,
  long_description text NOT NULL,
  highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
  material text NOT NULL,
  capacity text NOT NULL,
  origin text NOT NULL,
  hs_code text NOT NULL,
  customs_declaration text NOT NULL DEFAULT '',
  PRIMARY KEY (product_id, locale)
);

CREATE TABLE IF NOT EXISTS product_story_blocks (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES stores(id),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  locale text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  body text NOT NULL,
  image_url text NOT NULL,
  image_alt text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_story_blocks_product_locale
  ON product_story_blocks (product_id, locale, sort_order);

CREATE TABLE IF NOT EXISTS product_assets (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES stores(id),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  asset_kind text NOT NULL,
  url text NOT NULL,
  width integer,
  height integer,
  mime_type text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO categories (id, store_id, slug, image_url, is_visible, sort_order)
VALUES
  ('00000000-0000-4000-8000-000000010001', '00000000-0000-4000-8000-000000000001', 'teapot', '/assets/yixing-teapot-photo.jpg', true, 10),
  ('00000000-0000-4000-8000-000000010002', '00000000-0000-4000-8000-000000000001', 'teacup', '/assets/porcelain-tea-set-photo.jpg', true, 20),
  ('00000000-0000-4000-8000-000000010003', '00000000-0000-4000-8000-000000000001', 'travel', '/assets/travel-tea-set-photo.jpg', true, 30),
  ('00000000-0000-4000-8000-000000010004', '00000000-0000-4000-8000-000000000001', 'gift', '/assets/porcelain-tea-set-photo.jpg', true, 40),
  ('00000000-0000-4000-8000-000000010005', '00000000-0000-4000-8000-000000000001', 'accessories', '/assets/travel-tea-set-photo.jpg', true, 50),
  ('00000000-0000-4000-8000-000000010006', '00000000-0000-4000-8000-000000000001', 'new-arrivals', '/assets/yixing-teapot-photo.jpg', true, 60)
ON CONFLICT (store_id, slug) DO UPDATE
SET image_url = EXCLUDED.image_url,
    is_visible = EXCLUDED.is_visible,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO category_translations (category_id, locale, name)
VALUES
  ('00000000-0000-4000-8000-000000010001', 'en', 'Teapots'),
  ('00000000-0000-4000-8000-000000010001', 'zh', '茶壶'),
  ('00000000-0000-4000-8000-000000010002', 'en', 'Teacups'),
  ('00000000-0000-4000-8000-000000010002', 'zh', '茶杯'),
  ('00000000-0000-4000-8000-000000010003', 'en', 'Travel sets'),
  ('00000000-0000-4000-8000-000000010003', 'zh', '旅行茶具'),
  ('00000000-0000-4000-8000-000000010004', 'en', 'Gift sets'),
  ('00000000-0000-4000-8000-000000010004', 'zh', '礼品套装'),
  ('00000000-0000-4000-8000-000000010005', 'en', 'Accessories'),
  ('00000000-0000-4000-8000-000000010005', 'zh', '配件'),
  ('00000000-0000-4000-8000-000000010006', 'en', 'New arrivals'),
  ('00000000-0000-4000-8000-000000010006', 'zh', '新品')
ON CONFLICT (category_id, locale) DO UPDATE
SET name = EXCLUDED.name;

INSERT INTO regions (id, store_id, slug, image_url, icon, is_visible, show_on_homepage, sort_order)
VALUES
  ('00000000-0000-4000-8000-000000011001', '00000000-0000-4000-8000-000000000001', 'beijing', '/assets/region-beijing-tiananmen.jpg', 'palace', true, true, 10),
  ('00000000-0000-4000-8000-000000011002', '00000000-0000-4000-8000-000000000001', 'shanghai', '/assets/region-shanghai-oriental-pearl.jpg', 'skyline', true, true, 20),
  ('00000000-0000-4000-8000-000000011003', '00000000-0000-4000-8000-000000000001', 'jiangxi', '/assets/region-jiangxi-tengwang.jpg', 'pavilion', true, true, 30),
  ('00000000-0000-4000-8000-000000011004', '00000000-0000-4000-8000-000000000001', 'guangdong', '/assets/region-shanghai-oriental-pearl.jpg', 'tower', true, true, 40)
ON CONFLICT (store_id, slug) DO UPDATE
SET image_url = EXCLUDED.image_url,
    icon = EXCLUDED.icon,
    is_visible = EXCLUDED.is_visible,
    show_on_homepage = EXCLUDED.show_on_homepage,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO region_translations (region_id, locale, name, landmark, title, description, more_label)
VALUES
  ('00000000-0000-4000-8000-000000011001', 'en', 'Beijing', 'Tiananmen', 'Beijing Custom Porcelain', 'Tiananmen-inspired teaware for regional gifts, cultural storytelling, and custom porcelain collections.', 'More'),
  ('00000000-0000-4000-8000-000000011001', 'zh', '北京', '天安门', '北京地域定制瓷器', '以天安门为视觉线索，面向地域礼品、城市故事和定制茶具系列。', '更多'),
  ('00000000-0000-4000-8000-000000011002', 'en', 'Shanghai', 'Oriental Pearl Tower', 'Shanghai Custom Porcelain', 'Oriental Pearl Tower-inspired teaware for regional gifts, cultural storytelling, and custom porcelain collections.', 'More'),
  ('00000000-0000-4000-8000-000000011002', 'zh', '上海', '东方明珠', '上海地域定制瓷器', '以东方明珠为视觉线索，面向地域礼品、城市故事和定制茶具系列。', '更多'),
  ('00000000-0000-4000-8000-000000011003', 'en', 'Jiangxi', 'Tengwang Pavilion', 'Jiangxi Custom Porcelain', 'Tengwang Pavilion-inspired teaware for regional gifts, cultural storytelling, and custom porcelain collections.', 'More'),
  ('00000000-0000-4000-8000-000000011003', 'zh', '江西', '滕王阁', '江西地域定制瓷器', '以滕王阁为视觉线索，面向地域礼品、城市故事和定制茶具系列。', '更多'),
  ('00000000-0000-4000-8000-000000011004', 'en', 'Guangdong', 'Canton Tower', 'Guangdong Custom Porcelain', 'Canton Tower-inspired teaware for regional gifts, cultural storytelling, and custom porcelain collections.', 'More'),
  ('00000000-0000-4000-8000-000000011004', 'zh', '广东', '广州塔', '广东地域定制瓷器', '以广州塔为视觉线索，面向地域礼品、城市故事和定制茶具系列。', '更多')
ON CONFLICT (region_id, locale) DO UPDATE
SET name = EXCLUDED.name,
    landmark = EXCLUDED.landmark,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    more_label = EXCLUDED.more_label;

UPDATE products
SET category_id = '00000000-0000-4000-8000-000000010004',
    region_id = '00000000-0000-4000-8000-000000011003',
    image_url = '/assets/porcelain-tea-set-photo.jpg',
    original_price_minor = 12800,
    monthly_sales = 86,
    stock_qty = 42,
    sales_count = 326
WHERE store_id = '00000000-0000-4000-8000-000000000001'
  AND slug = 'porcelain-tea-set';

INSERT INTO product_translations (
  product_id,
  locale,
  name,
  tag,
  short_description,
  long_description,
  highlights,
  material,
  capacity,
  origin,
  hs_code,
  customs_declaration
)
VALUES
  (
    '00000000-0000-4000-8000-000000001001',
    'en',
    'Porcelain Tea Set',
    'Gift',
    'White porcelain teapot and cups for gifting and daily brewing.',
    'A clean porcelain tea set with a quiet profile for modern tables, gift boxes, and first-time buyers who want a complete brewing setup.',
    '["Gift-ready set", "Neutral white finish", "Tea room and home display friendly"]'::jsonb,
    'Porcelain ceramic',
    'Teapot 180 ml, cups 40 ml',
    'China',
    '6911.10',
    'Porcelain teaware set for household tea brewing'
  ),
  (
    '00000000-0000-4000-8000-000000001001',
    'zh',
    '白瓷功夫茶具套装',
    '礼品',
    '适合送礼和日常冲泡的白瓷茶壶与茶杯组合。',
    '这套白瓷茶具线条干净，适合现代家居、礼盒组合和入门用户，一套即可完成基础冲泡场景。',
    '["适合礼盒销售", "中性白瓷釉面", "适合茶室与家用陈列"]'::jsonb,
    '白瓷陶瓷',
    '茶壶 180 ml，茶杯 40 ml',
    '中国',
    '6911.10',
    '家用茶具白瓷套装'
  )
ON CONFLICT (product_id, locale) DO UPDATE
SET name = EXCLUDED.name,
    tag = EXCLUDED.tag,
    short_description = EXCLUDED.short_description,
    long_description = EXCLUDED.long_description,
    highlights = EXCLUDED.highlights,
    material = EXCLUDED.material,
    capacity = EXCLUDED.capacity,
    origin = EXCLUDED.origin,
    hs_code = EXCLUDED.hs_code,
    customs_declaration = EXCLUDED.customs_declaration;

INSERT INTO product_story_blocks (id, store_id, product_id, locale, sort_order, title, body, image_url, image_alt)
VALUES
  ('00000000-0000-4000-8000-000000012001', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001001', 'en', 10, 'Gift-ready table setting', 'The set is photographed and arranged for a compact gift page: teapot, cups, and a neutral porcelain finish that works across Western home interiors.', '/assets/porcelain-tea-set-photo.jpg', 'Porcelain teapot and teacups arranged for a gift table'),
  ('00000000-0000-4000-8000-000000012002', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001001', 'zh', 10, '适合礼品陈列的茶席', '整套茶具以白瓷、金边和完整茶杯组合呈现，适合做欧美礼品页、家庭茶席和入门套装展示。', '/assets/porcelain-tea-set-photo.jpg', '白瓷茶壶与茶杯礼品茶席')
ON CONFLICT (id) DO UPDATE
SET title = EXCLUDED.title,
    body = EXCLUDED.body,
    image_url = EXCLUDED.image_url,
    image_alt = EXCLUDED.image_alt;
