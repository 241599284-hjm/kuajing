\connect app_db

INSERT INTO products (
  id,
  store_id,
  title,
  slug,
  status,
  category_id,
  region_id,
  image_url,
  original_price_minor,
  monthly_sales,
  stock_qty,
  sales_count
)
VALUES
  (
    '00000000-0000-4000-8000-000000001002',
    '00000000-0000-4000-8000-000000000001',
    'Celadon Teacup Set',
    'celadon-teacup-set',
    'active',
    '00000000-0000-4000-8000-000000010002',
    '00000000-0000-4000-8000-000000011003',
    '/assets/porcelain-tea-set-photo.jpg',
    6900,
    148,
    96,
    612
  ),
  (
    '00000000-0000-4000-8000-000000001003',
    '00000000-0000-4000-8000-000000000001',
    'Yixing Clay Teapot',
    'yixing-clay-pot',
    'active',
    '00000000-0000-4000-8000-000000010001',
    '00000000-0000-4000-8000-000000011001',
    '/assets/yixing-teapot-photo.jpg',
    16800,
    54,
    18,
    214
  )
ON CONFLICT (store_id, slug) DO UPDATE
SET title = EXCLUDED.title,
    status = EXCLUDED.status,
    category_id = EXCLUDED.category_id,
    region_id = EXCLUDED.region_id,
    image_url = EXCLUDED.image_url,
    original_price_minor = EXCLUDED.original_price_minor,
    monthly_sales = EXCLUDED.monthly_sales,
    stock_qty = EXCLUDED.stock_qty,
    sales_count = EXCLUDED.sales_count,
    updated_at = now();

INSERT INTO skus (
  id,
  store_id,
  product_id,
  sku_code,
  title,
  material_composition,
  hs_code,
  origin_country,
  capacity,
  package_length_mm,
  package_width_mm,
  package_height_mm,
  weight_grams,
  customs_declaration,
  price_minor,
  currency
)
VALUES
  (
    '00000000-0000-4000-8000-000000002002',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000001002',
    'DT-CUP-004',
    'Celadon Teacup Set / Four Cups',
    'High-fired celadon ceramic',
    '691200',
    'CN',
    'Four cups, 55 ml each',
    230,
    180,
    100,
    820,
    'Celadon ceramic teacup set for household tea service',
    5400,
    'USD'
  ),
  (
    '00000000-0000-4000-8000-000000002003',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000001003',
    'DT-POT-002',
    'Yixing Clay Teapot / 180 ml',
    'Yixing zisha clay',
    '691200',
    'CN',
    'Teapot 180 ml',
    190,
    150,
    120,
    680,
    'Unglazed clay teapot for household tea brewing',
    12800,
    'USD'
  )
ON CONFLICT (store_id, sku_code) DO UPDATE
SET product_id = EXCLUDED.product_id,
    title = EXCLUDED.title,
    material_composition = EXCLUDED.material_composition,
    hs_code = EXCLUDED.hs_code,
    origin_country = EXCLUDED.origin_country,
    capacity = EXCLUDED.capacity,
    package_length_mm = EXCLUDED.package_length_mm,
    package_width_mm = EXCLUDED.package_width_mm,
    package_height_mm = EXCLUDED.package_height_mm,
    weight_grams = EXCLUDED.weight_grams,
    customs_declaration = EXCLUDED.customs_declaration,
    price_minor = EXCLUDED.price_minor,
    currency = EXCLUDED.currency;

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
    '00000000-0000-4000-8000-000000001002',
    'en',
    'Celadon Teacup Set',
    'Limited',
    'Four quiet celadon cups with a soft jade-green glaze.',
    'A compact set of hand-finished celadon cups for gongfu tea, intimate table settings, and collectors who value subtle glaze variation.',
    '["Four-cup set", "Soft celadon glaze", "Hand-finished surface variation"]'::jsonb,
    'High-fired celadon ceramic',
    'Four cups, 55 ml each',
    'Jiangxi, China',
    '6912.00',
    'Celadon ceramic teacup set for household tea service'
  ),
  (
    '00000000-0000-4000-8000-000000001002',
    'zh',
    '青瓷品茗杯四件套',
    '限量',
    '四只温润青瓷杯，呈现低饱和玉绿色釉面。',
    '适合功夫茶、小型茶席与收藏陈列，每只杯子的手工修坯和釉色变化都略有不同。',
    '["四杯组合", "温润青瓷釉", "手工釉面自然变化"]'::jsonb,
    '高温青瓷',
    '四只茶杯，每只 55 ml',
    '中国江西',
    '6912.00',
    '家用青瓷茶杯套装'
  ),
  (
    '00000000-0000-4000-8000-000000001003',
    'en',
    'Yixing Clay Teapot',
    'Handmade',
    'A compact unglazed clay teapot shaped for focused brewing.',
    'Made for oolong and dark tea sessions, this Yixing-style pot develops character through repeated use while keeping a restrained sculptural silhouette.',
    '["180 ml brewing size", "Unglazed clay body", "Collector-friendly form"]'::jsonb,
    'Yixing zisha clay',
    'Teapot 180 ml',
    'Jiangsu, China',
    '6912.00',
    'Unglazed clay teapot for household tea brewing'
  ),
  (
    '00000000-0000-4000-8000-000000001003',
    'zh',
    '宜兴紫砂壶',
    '手工',
    '适合专注冲泡的小容量无釉紫砂壶。',
    '适合乌龙茶与黑茶，器身在长期使用中逐渐形成温润质感，同时保持克制的雕塑轮廓。',
    '["180 ml 实用容量", "无釉紫砂泥料", "适合收藏陈列"]'::jsonb,
    '宜兴紫砂泥',
    '茶壶 180 ml',
    '中国江苏',
    '6912.00',
    '家用无釉紫砂茶壶'
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

INSERT INTO product_story_blocks (
  id,
  store_id,
  product_id,
  locale,
  sort_order,
  title,
  body,
  image_url,
  image_alt
)
VALUES
  (
    '00000000-0000-4000-8000-000000012003',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000001002',
    'en',
    10,
    'Quiet glaze variation',
    'Each cup is finished to preserve the soft pooling and tonal shifts that make celadon rewarding at close range.',
    '/assets/porcelain-tea-set-photo.jpg',
    'Celadon teacups showing subtle glaze variation'
  ),
  (
    '00000000-0000-4000-8000-000000012004',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000001002',
    'zh',
    10,
    '安静的釉色变化',
    '每只杯子保留青瓷釉面自然积釉与色阶变化，适合近距离观察和日常使用。',
    '/assets/porcelain-tea-set-photo.jpg',
    '呈现细微釉色变化的青瓷茶杯'
  ),
  (
    '00000000-0000-4000-8000-000000012005',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000001003',
    'en',
    10,
    'Made for repeated brewing',
    'The unglazed clay body and balanced handle support controlled pouring and a surface that matures with use.',
    '/assets/yixing-teapot-photo.jpg',
    'Handmade Yixing clay teapot for repeated brewing'
  ),
  (
    '00000000-0000-4000-8000-000000012006',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000001003',
    'zh',
    10,
    '为长期冲泡而作',
    '无釉泥料与平衡手柄兼顾出汤控制，壶身也会在持续使用中逐渐形成温润光泽。',
    '/assets/yixing-teapot-photo.jpg',
    '适合长期冲泡的手工宜兴紫砂壶'
  )
ON CONFLICT (id) DO UPDATE
SET title = EXCLUDED.title,
    body = EXCLUDED.body,
    image_url = EXCLUDED.image_url,
    image_alt = EXCLUDED.image_alt;
