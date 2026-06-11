\connect app_db

ALTER TABLE product_story_blocks
  ADD COLUMN IF NOT EXISTS media_kind text NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS poster_url text,
  ADD COLUMN IF NOT EXISTS width integer,
  ADD COLUMN IF NOT EXISTS height integer,
  ADD COLUMN IF NOT EXISTS duration_seconds numeric(8,2),
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS byte_size integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'product_story_blocks_media_kind_check'
  ) THEN
    ALTER TABLE product_story_blocks
      ADD CONSTRAINT product_story_blocks_media_kind_check
      CHECK (media_kind IN ('image', 'gif', 'video'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'product_story_blocks_media_size_check'
  ) THEN
    ALTER TABLE product_story_blocks
      ADD CONSTRAINT product_story_blocks_media_size_check
      CHECK (
        (width IS NULL OR width > 0)
        AND (height IS NULL OR height > 0)
        AND (byte_size IS NULL OR byte_size > 0)
        AND (duration_seconds IS NULL OR duration_seconds >= 0)
      );
  END IF;
END $$;

ALTER TABLE product_assets
  ADD COLUMN IF NOT EXISTS poster_url text,
  ADD COLUMN IF NOT EXISTS byte_size integer,
  ADD COLUMN IF NOT EXISTS duration_seconds numeric(8,2),
  ADD COLUMN IF NOT EXISTS variants jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS responsive_sources jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'product_assets_media_size_check'
  ) THEN
    ALTER TABLE product_assets
      ADD CONSTRAINT product_assets_media_size_check
      CHECK (
        (width IS NULL OR width > 0)
        AND (height IS NULL OR height > 0)
        AND (byte_size IS NULL OR byte_size > 0)
        AND (duration_seconds IS NULL OR duration_seconds >= 0)
      );
  END IF;
END $$;
