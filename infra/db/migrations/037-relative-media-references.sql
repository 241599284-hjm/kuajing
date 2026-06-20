\connect app_db

UPDATE product_assets asset
SET url = '/media/public/' || asset.object_key,
    poster_url = CASE
      WHEN asset.poster_url IS NULL THEN NULL
      ELSE (
        SELECT '/media/public/' || (source->>'objectKey')
        FROM jsonb_array_elements(asset.responsive_sources) source
        WHERE source->>'url' = asset.poster_url
          AND COALESCE(source->>'objectKey', '') <> ''
        LIMIT 1
      )
    END,
    variants = COALESCE((
      SELECT jsonb_object_agg(variant.key, '/media/public/' || (source.item->>'objectKey'))
      FROM jsonb_each_text(asset.variants) variant
      JOIN LATERAL (
        SELECT item
        FROM jsonb_array_elements(asset.responsive_sources) item
        WHERE item->>'url' = variant.value
          AND COALESCE(item->>'objectKey', '') <> ''
        LIMIT 1
      ) source ON TRUE
    ), '{}'::jsonb),
    responsive_sources = COALESCE((
      SELECT jsonb_agg(source || jsonb_build_object('url', '/media/public/' || (source->>'objectKey')))
      FROM jsonb_array_elements(asset.responsive_sources) source
      WHERE COALESCE(source->>'objectKey', '') <> ''
    ), '[]'::jsonb)
WHERE COALESCE(asset.object_key, '') <> '';

UPDATE products product
SET image_url = (
  SELECT asset.url
  FROM product_assets asset
  WHERE asset.product_id = product.id
    AND asset.store_id = product.store_id
    AND asset.usage_status <> 'deleted'
  ORDER BY asset.sort_order ASC
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM product_assets asset
  WHERE asset.product_id = product.id
    AND asset.store_id = product.store_id
    AND asset.usage_status <> 'deleted'
);

UPDATE categories SET image_url = regexp_replace(image_url, '^https?://[^/]+', '')
WHERE image_url ~* '^https?://[^/]+/(assets|static)/';
UPDATE regions SET image_url = regexp_replace(image_url, '^https?://[^/]+', '')
WHERE image_url ~* '^https?://[^/]+/(assets|static)/';
UPDATE products SET image_url = regexp_replace(image_url, '^https?://[^/]+', '')
WHERE image_url ~* '^https?://[^/]+/(assets|static)/';
UPDATE product_story_blocks SET image_url = regexp_replace(image_url, '^https?://[^/]+', '')
WHERE image_url ~* '^https?://[^/]+/(assets|static)/';

ALTER TABLE product_assets DROP CONSTRAINT IF EXISTS product_assets_relative_url_check;
ALTER TABLE product_assets ADD CONSTRAINT product_assets_relative_url_check
  CHECK (
    url ~ '^/media/public/'
    AND (poster_url IS NULL OR poster_url ~ '^/media/public/')
    AND variants::text !~* 'http://'
    AND responsive_sources::text !~* 'http://'
  );
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_no_http_image_check;
ALTER TABLE categories ADD CONSTRAINT categories_no_http_image_check CHECK (image_url !~* '^http://');
ALTER TABLE regions DROP CONSTRAINT IF EXISTS regions_no_http_image_check;
ALTER TABLE regions ADD CONSTRAINT regions_no_http_image_check CHECK (image_url !~* '^http://');
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_no_http_image_check;
ALTER TABLE products ADD CONSTRAINT products_no_http_image_check CHECK (image_url !~* '^http://');
ALTER TABLE product_story_blocks DROP CONSTRAINT IF EXISTS product_story_blocks_no_http_media_check;
ALTER TABLE product_story_blocks ADD CONSTRAINT product_story_blocks_no_http_media_check
  CHECK (image_url !~* '^http://' AND (poster_url IS NULL OR poster_url !~* '^http://'));

\connect review_db

ALTER TABLE product_reviews DROP CONSTRAINT IF EXISTS product_reviews_no_http_images_check;
ALTER TABLE product_reviews ADD CONSTRAINT product_reviews_no_http_images_check
  CHECK (image_urls::text !~* 'http://');

\connect notification_db

ALTER TABLE notification_email_templates DROP CONSTRAINT IF EXISTS notification_templates_no_http_check;
ALTER TABLE notification_email_templates ADD CONSTRAINT notification_templates_no_http_check
  CHECK (html_zh !~* 'http://' AND html_en !~* 'http://' AND text_zh !~* 'http://' AND text_en !~* 'http://');

-- Forward-only migration. Rollback before application rollout:
-- ALTER TABLE product_assets DROP CONSTRAINT product_assets_relative_url_check;
-- ALTER TABLE categories DROP CONSTRAINT categories_no_http_image_check;
-- ALTER TABLE regions DROP CONSTRAINT regions_no_http_image_check;
-- ALTER TABLE products DROP CONSTRAINT products_no_http_image_check;
-- ALTER TABLE product_story_blocks DROP CONSTRAINT product_story_blocks_no_http_media_check;
-- ALTER TABLE product_reviews DROP CONSTRAINT product_reviews_no_http_images_check;
-- ALTER TABLE notification_email_templates DROP CONSTRAINT notification_templates_no_http_check;
