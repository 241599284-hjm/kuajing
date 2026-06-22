\connect logistics_db

CREATE TABLE IF NOT EXISTS shipments (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  order_number text NOT NULL,
  carrier_code text NOT NULL,
  carrier_name text NOT NULL,
  tracking_number text NOT NULL,
  status text NOT NULL,
  created_by text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  shipped_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, idempotency_key),
  UNIQUE (store_id, carrier_code, tracking_number),
  CHECK (status IN ('shipped', 'in_transit', 'customs', 'out_for_delivery', 'delivered', 'exception'))
);

CREATE TABLE IF NOT EXISTS shipment_events (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  location text NOT NULL DEFAULT '',
  reason text NOT NULL,
  actor_id text NOT NULL,
  correlation_id text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, idempotency_key),
  CHECK (to_status IN ('shipped', 'in_transit', 'customs', 'out_for_delivery', 'delivered', 'exception'))
);

CREATE INDEX IF NOT EXISTS shipments_order_idx ON shipments (store_id, order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shipment_events_timeline_idx ON shipment_events (store_id, shipment_id, created_at ASC);
