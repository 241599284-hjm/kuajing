CREATE DATABASE app_db;
CREATE DATABASE order_db;
CREATE DATABASE inventory_db;
CREATE DATABASE ledger_db;
CREATE DATABASE logistics_db;
CREATE DATABASE notification_db;
CREATE DATABASE review_db;

\connect app_db

CREATE TABLE stores (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  region text NOT NULL,
  timezone text NOT NULL,
  default_currency text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_users (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES stores(id),
  email text NOT NULL,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, email)
);

CREATE TABLE customers (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES stores(id),
  username text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending_email_verification',
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, username),
  UNIQUE (store_id, email)
);

CREATE TABLE email_verification_tokens (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES stores(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  token text NOT NULL UNIQUE,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES stores(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_settings (
  store_id uuid PRIMARY KEY REFERENCES stores(id),
  provider text NOT NULL DEFAULT 'smtp',
  smtp_host text NOT NULL,
  smtp_port integer NOT NULL,
  smtp_secure boolean NOT NULL DEFAULT false,
  smtp_username text,
  smtp_password text,
  from_email text NOT NULL,
  from_name text NOT NULL,
  reply_to_email text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (smtp_port > 0 AND smtp_port <= 65535)
);

CREATE TABLE products (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES stores(id),
  title text NOT NULL,
  slug text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, slug)
);

CREATE TABLE skus (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES stores(id),
  product_id uuid NOT NULL REFERENCES products(id),
  sku_code text NOT NULL,
  title text NOT NULL,
  material_composition text NOT NULL,
  hs_code text NOT NULL,
  origin_country text NOT NULL,
  capacity text NOT NULL DEFAULT 'To be maintained',
  package_length_mm integer NOT NULL DEFAULT 0,
  package_width_mm integer NOT NULL DEFAULT 0,
  package_height_mm integer NOT NULL DEFAULT 0,
  weight_grams integer NOT NULL DEFAULT 0,
  customs_declaration text NOT NULL DEFAULT '',
  price_minor integer NOT NULL,
  currency text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, sku_code)
);

INSERT INTO stores (id, slug, name, region, timezone, default_currency)
VALUES ('00000000-0000-4000-8000-000000000001', 'demo-teaware', 'Demo Teaware Store', 'local', 'Asia/Hong_Kong', 'USD');

INSERT INTO admin_users (id, store_id, email, role)
VALUES ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'admin@example.com', 'owner');

INSERT INTO email_settings (
  store_id,
  provider,
  smtp_host,
  smtp_port,
  smtp_secure,
  from_email,
  from_name,
  enabled
)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'smtp',
  'localhost',
  1025,
  false,
  'no-reply@demo-teaware.local',
  'Demo Teaware',
  true
);

INSERT INTO products (id, store_id, title, slug, status)
VALUES ('00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-000000000001', 'Porcelain Tea Set', 'porcelain-tea-set', 'active');

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
VALUES (
  '00000000-0000-4000-8000-000000002001',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000001001',
  'TEA-PORCELAIN-SET-001',
  'Porcelain Tea Set / White',
  'Porcelain ceramic',
  '691110',
  'CN',
  'Teapot 180 ml, cups 40 ml',
  320,
  240,
  120,
  1500,
  'Porcelain teaware set for household tea brewing',
  9600,
  'USD'
);

\connect inventory_db

CREATE TABLE warehouses (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  warehouse_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, code)
);

CREATE TABLE inventory_items (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  sku_id uuid NOT NULL,
  batch_number text NOT NULL,
  available_qty integer NOT NULL,
  reserved_qty integer NOT NULL DEFAULT 0,
  safety_qty integer NOT NULL DEFAULT 0,
  inventory_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, warehouse_id, sku_id, batch_number)
);

CREATE TABLE inventory_reservations (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  order_id uuid,
  sku_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  qty integer NOT NULL,
  status text NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, idempotency_key)
);

CREATE TABLE inventory_audit_events (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  inventory_item_id uuid NOT NULL,
  action text NOT NULL,
  actor_id text NOT NULL,
  reason text NOT NULL,
  old_value jsonb NOT NULL,
  new_value jsonb NOT NULL,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX inventory_audit_events_item_idx
  ON inventory_audit_events (store_id, inventory_item_id, created_at DESC);

CREATE INDEX inventory_audit_events_created_idx
  ON inventory_audit_events (store_id, created_at DESC);

INSERT INTO warehouses (id, store_id, code, name, warehouse_type)
VALUES ('00000000-0000-4000-8000-000000003001', '00000000-0000-4000-8000-000000000001', 'CN-MAIN', 'China Main Warehouse', 'domestic');

INSERT INTO inventory_items (id, store_id, warehouse_id, sku_id, batch_number, available_qty, reserved_qty, safety_qty)
VALUES (
  '00000000-0000-4000-8000-000000004001',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000003001',
  '00000000-0000-4000-8000-000000002001',
  'BATCH-LOCAL-001',
  50,
  0,
  2
);

\connect order_db

CREATE TABLE orders (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  order_number text NOT NULL,
  customer_email text NOT NULL,
  status text NOT NULL,
  payment_status text NOT NULL,
  inventory_status text NOT NULL,
  currency text NOT NULL,
  total_minor integer NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, order_number),
  UNIQUE (store_id, idempotency_key)
);

CREATE TABLE order_lines (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES orders(id),
  sku_id uuid NOT NULL,
  product_slug_snapshot text,
  title_snapshot text NOT NULL,
  sku_code_snapshot text NOT NULL,
  hs_code_snapshot text NOT NULL,
  material_snapshot text NOT NULL,
  inventory_version_snapshot integer NOT NULL,
  inventory_reservation_key_snapshot text,
  qty integer NOT NULL,
  unit_price_minor integer NOT NULL,
  currency text NOT NULL
);

CREATE TABLE order_audit_events (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES orders(id),
  action text NOT NULL,
  actor_id text NOT NULL,
  reason text NOT NULL,
  old_value jsonb NOT NULL,
  new_value jsonb NOT NULL,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_audit_events_order_idx
  ON order_audit_events (store_id, order_id, created_at DESC);

CREATE TABLE compensation_tasks (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  task_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 8,
  next_run_at timestamptz NOT NULL,
  last_error text,
  correlation_id text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, idempotency_key)
);

CREATE INDEX compensation_tasks_due_idx
  ON compensation_tasks (status, next_run_at);

CREATE TABLE dead_letter_tasks (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  source_task_id uuid,
  task_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  status text NOT NULL,
  failure_reason text NOT NULL,
  correlation_id text NOT NULL,
  payload jsonb NOT NULL,
  handler_id text,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  handled_at timestamptz
);

CREATE INDEX dead_letter_tasks_status_idx
  ON dead_letter_tasks (status, created_at DESC);

CREATE TABLE dead_letter_audit_events (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  dead_letter_task_id uuid NOT NULL REFERENCES dead_letter_tasks(id),
  action text NOT NULL,
  actor_id text NOT NULL,
  decision_note text NOT NULL,
  old_status text NOT NULL,
  new_status text NOT NULL,
  correlation_id text NOT NULL,
  client_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX dead_letter_audit_events_task_idx
  ON dead_letter_audit_events (dead_letter_task_id, created_at DESC);

\connect ledger_db

CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  entry_type text NOT NULL,
  amount_minor integer NOT NULL,
  currency text NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE daily_reconciliation (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  business_date date NOT NULL,
  order_count integer NOT NULL DEFAULT 0,
  paid_amount_minor integer NOT NULL DEFAULT 0,
  paid_currency text NOT NULL DEFAULT 'USD',
  inventory_delta integer NOT NULL DEFAULT 0,
  mismatch_flag boolean NOT NULL DEFAULT false,
  mismatch_reason text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, business_date)
);
