\connect app_db

ALTER TABLE IF EXISTS tenants RENAME TO stores;

DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'admin_users',
    'customers',
    'email_verification_tokens',
    'email_settings',
    'products',
    'skus'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = target_table
        AND column_name = 'tenant_id'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = target_table
        AND column_name = 'store_id'
    ) THEN
      EXECUTE format('ALTER TABLE %I RENAME COLUMN tenant_id TO store_id', target_table);
    END IF;
  END LOOP;
END $$;

\connect inventory_db

DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'warehouses',
    'inventory_items',
    'inventory_reservations'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = target_table
        AND column_name = 'tenant_id'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = target_table
        AND column_name = 'store_id'
    ) THEN
      EXECUTE format('ALTER TABLE %I RENAME COLUMN tenant_id TO store_id', target_table);
    END IF;
  END LOOP;
END $$;

\connect order_db

DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'orders',
    'order_lines'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = target_table
        AND column_name = 'tenant_id'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = target_table
        AND column_name = 'store_id'
    ) THEN
      EXECUTE format('ALTER TABLE %I RENAME COLUMN tenant_id TO store_id', target_table);
    END IF;
  END LOOP;
END $$;

\connect ledger_db

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ledger_entries'
      AND column_name = 'tenant_id'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ledger_entries'
      AND column_name = 'store_id'
  ) THEN
    ALTER TABLE ledger_entries RENAME COLUMN tenant_id TO store_id;
  END IF;
END $$;
