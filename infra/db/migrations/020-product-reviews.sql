CREATE TABLE IF NOT EXISTS product_reviews (
  id uuid PRIMARY KEY,
  product_slug text NOT NULL,
  order_id text,
  customer_email text NOT NULL,
  nickname text NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  content text NOT NULL,
  image_urls jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'pending',
  merchant_reply text,
  pinned boolean NOT NULL DEFAULT false,
  like_count integer NOT NULL DEFAULT 0,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_slug, order_id, customer_email)
);

CREATE INDEX IF NOT EXISTS product_reviews_product_status_idx ON product_reviews (product_slug, status, pinned DESC, created_at DESC);
