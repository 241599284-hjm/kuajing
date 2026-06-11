import "reflect-metadata";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  HttpException,
  Inject,
  Injectable,
  Module,
  OnApplicationShutdown,
  Param,
  Post,
  ServiceUnavailableException
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { assertStoreContext, type StoreContext } from "@commerce/store-context";
import { nextRetryAt } from "@commerce/outbox-inbox";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";

type MockCheckoutLine = {
  slug?: string;
  skuId?: string;
  skuCode?: string;
  title?: string;
  quantity?: number;
  unitPriceMinor?: number;
  currency?: string;
};

type NormalizedCheckoutLine = {
  slug: string;
  skuId: string;
  skuCode: string;
  title: string;
  quantity: number;
  unitPriceMinor: number;
  currency: string;
};

type MockCheckoutRequest = {
  customerEmail?: string;
  paymentMethod?: string;
  shippingAddress?: {
    country?: string;
    province?: string;
    city?: string;
    postalCode?: string;
    street?: string;
  };
  lines?: MockCheckoutLine[];
};

type MockCheckoutOrder = {
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  status: "pending_payment" | "paid" | "cancelled" | "compensating";
  paymentStatus: "mock_created" | "paid" | "cancelled";
  inventoryStatus: "reserved" | "confirmed" | "cancelled" | "compensation_pending";
  storageMode: "postgres" | "memory";
  inventoryMode: "postgres" | "memory";
  paymentMode: "provider" | "local-fallback";
  totalMinor: number;
  currency: string;
  paymentRedirectUrl: string;
  idempotencyKey: string;
  createdAt: string;
  inventoryReservations: InventoryReservationResult[];
  lines: NormalizedCheckoutLine[];
};

type AdminOrderSummary = {
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  status: string;
  paymentStatus: string;
  inventoryStatus: string;
  isException: boolean;
  failureCount: number;
  lastFailureReason: string;
  totalMinor: number;
  currency: string;
  storageMode: "postgres" | "memory";
  createdAt: string;
};

type AdminOrderLine = {
  skuId: string;
  skuCode: string;
  title: string;
  hsCode: string;
  material: string;
  inventoryVersion: number;
  inventoryReservationKey: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  currency: string;
};

type AdminOrderDetail = AdminOrderSummary & {
  idempotencyKey: string;
  lines: AdminOrderLine[];
};

type InventoryReservationResult = {
  reservationId: string;
  status: "reserved" | "confirmed" | "cancelled";
  skuId: string;
  warehouseId: string;
  qty: number;
  inventoryVersion: number;
  idempotencyKey: string;
  storageMode: "postgres" | "memory";
};

type PaymentTransitionRequest = {
  orderId?: string;
};

type OrderLineReservation = {
  skuId: string;
  warehouseId?: string;
  qty: number;
  idempotencyKey: string;
};

type PaymentTransitionResult = {
  orderId: string;
  status: MockCheckoutOrder["status"];
  paymentStatus: MockCheckoutOrder["paymentStatus"];
  inventoryStatus: MockCheckoutOrder["inventoryStatus"];
  compensationQueued: boolean;
  storageMode: "postgres" | "memory";
};

type OrderStateSnapshot = {
  orderId: string;
  status: MockCheckoutOrder["status"];
  paymentStatus: MockCheckoutOrder["paymentStatus"];
  inventoryStatus: MockCheckoutOrder["inventoryStatus"];
  storageMode: "postgres" | "memory";
};

type CompensationTaskInput = {
  taskType: "inventory_confirm" | "inventory_cancel";
  aggregateType: "order";
  aggregateId: string;
  idempotencyKey: string;
  payload: unknown;
  lastError: string;
};

const mockOrdersByIdempotencyKey = new Map<string, MockCheckoutOrder>();
const paymentServiceUrl = process.env.PAYMENT_SERVICE_URL ?? "http://localhost:4106";
const inventoryServiceUrl = process.env.INVENTORY_SERVICE_URL ?? "http://localhost:4104";
const selfHostedStore = {
  storeId: process.env.DEFAULT_STORE_ID ?? "00000000-0000-4000-8000-000000000001",
  region: process.env.DEFAULT_STORE_REGION ?? "local",
  timezone: process.env.DEFAULT_STORE_TIMEZONE ?? "Asia/Hong_Kong"
};
const defaultSkuId = process.env.DEFAULT_SKU_ID ?? "00000000-0000-4000-8000-000000002001";
const slowOrderCreateMs = Number(process.env.SLOW_ORDER_CREATE_MS ?? 2000);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createStoreContext(correlationId: string | undefined): StoreContext {
  return assertStoreContext({
    storeId: selfHostedStore.storeId,
    region: selfHostedStore.region,
    timezone: selfHostedStore.timezone,
    correlationId: correlationId ?? randomUUID()
  });
}

function isExceptionState(status: string, inventoryStatus: string): boolean {
  return status === "compensating" || inventoryStatus === "compensation_pending";
}

function warnIfSlow(operation: string, startedAt: number, thresholdMs: number, ctx: StoreContext) {
  const durationMs = Date.now() - startedAt;

  if (durationMs <= thresholdMs) {
    return;
  }

  console.warn(
    JSON.stringify({
      event: "slow_request",
      service: "order-service",
      operation,
      durationMs,
      thresholdMs,
      correlationId: ctx.correlationId
    })
  );
}

function normalizeEmail(value: string | undefined): string {
  const email = value?.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BadRequestException("valid customerEmail is required");
  }

  return email;
}

function normalizeSkuId(value: string | undefined): string {
  const skuId = value?.trim() || defaultSkuId;

  if (!uuidPattern.test(skuId)) {
    throw new BadRequestException("line skuId must be a UUID");
  }

  return skuId;
}

function normalizeOrderId(value: string | undefined): string {
  const orderId = value?.trim();

  if (!orderId || !uuidPattern.test(orderId)) {
    throw new BadRequestException("orderId must be a UUID");
  }

  return orderId;
}

function normalizeLine(line: MockCheckoutLine): NormalizedCheckoutLine {
  const slug = line.slug?.trim();
  const skuId = normalizeSkuId(line.skuId);
  const skuCode = line.skuCode?.trim();
  const title = line.title?.trim();
  const quantity = Number(line.quantity);
  const unitPriceMinor = Number(line.unitPriceMinor);
  const currency = line.currency?.trim().toUpperCase() || "USD";

  if (!slug || !skuCode || !title) {
    throw new BadRequestException("line slug, skuCode, and title are required");
  }

  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 99) {
    throw new BadRequestException("line quantity must be 1-99");
  }

  if (!Number.isInteger(unitPriceMinor) || unitPriceMinor < 0) {
    throw new BadRequestException("line unitPriceMinor must be a non-negative integer");
  }

  return { slug, skuId, skuCode, title, quantity, unitPriceMinor, currency };
}

function normalizeCheckout(body: MockCheckoutRequest) {
  const lines = body.lines?.map(normalizeLine) ?? [];

  if (lines.length === 0) {
    throw new BadRequestException("at least one checkout line is required");
  }

  const currency = lines[0]?.currency ?? "USD";

  if (lines.some((line) => line.currency !== currency)) {
    throw new BadRequestException("mixed checkout currencies are not supported in local mock checkout");
  }

  return {
    customerEmail: normalizeEmail(body.customerEmail),
    paymentMethod: body.paymentMethod?.trim() || "mock",
    lines,
    currency
  };
}

function paymentRedirectUrl(orderId: string): string {
  return `${process.env.STOREFRONT_PUBLIC_URL ?? "http://localhost:3000"}/payment-result?mock=success&orderId=${orderId}`;
}

function buildMockOrder(
  checkout: ReturnType<typeof normalizeCheckout>,
  idempotencyKey: string,
  storageMode: MockCheckoutOrder["storageMode"],
  inventoryMode: MockCheckoutOrder["inventoryMode"],
  inventoryReservations: InventoryReservationResult[],
  orderId: string = randomUUID(),
  orderNumber: string = `MOCK-${Date.now().toString(36).toUpperCase()}`,
  createdAt: string = new Date().toISOString()
): MockCheckoutOrder {
  return {
    orderId,
    orderNumber,
    customerEmail: checkout.customerEmail,
    status: "pending_payment",
    paymentStatus: "mock_created",
    inventoryStatus: "reserved",
    storageMode,
    inventoryMode,
    paymentMode: "local-fallback",
    totalMinor: checkout.lines.reduce((total, line) => total + line.unitPriceMinor * line.quantity, 0),
    currency: checkout.currency,
    paymentRedirectUrl: paymentRedirectUrl(orderId),
    idempotencyKey,
    createdAt,
    inventoryReservations,
    lines: checkout.lines
  };
}

function mockMemoryOrder(
  checkout: ReturnType<typeof normalizeCheckout>,
  idempotencyKey: string,
  inventoryMode: MockCheckoutOrder["inventoryMode"],
  inventoryReservations: InventoryReservationResult[],
  orderId = randomUUID()
): MockCheckoutOrder {
  const existingOrder = mockOrdersByIdempotencyKey.get(idempotencyKey);

  if (existingOrder) {
    return existingOrder;
  }

  const order = buildMockOrder(checkout, idempotencyKey, "memory", inventoryMode, inventoryReservations, orderId);
  mockOrdersByIdempotencyKey.set(idempotencyKey, order);
  return order;
}

function listMemoryOrders(): AdminOrderSummary[] {
  return [...mockOrdersByIdempotencyKey.values()]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 50)
    .map((order) => ({
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      customerEmail: order.customerEmail,
      status: order.status,
      paymentStatus: order.paymentStatus,
      inventoryStatus: order.inventoryStatus,
      isException: isExceptionState(order.status, order.inventoryStatus),
      failureCount: 0,
      lastFailureReason: "",
      totalMinor: order.totalMinor,
      currency: order.currency,
      storageMode: order.storageMode,
      createdAt: order.createdAt
    }));
}

function findMemoryOrder(orderId: string): MockCheckoutOrder | undefined {
  return [...mockOrdersByIdempotencyKey.values()].find((order) => order.orderId === orderId);
}

function transitionMemoryOrder(
  orderId: string,
  status: MockCheckoutOrder["status"],
  paymentStatus: MockCheckoutOrder["paymentStatus"],
  inventoryStatus: MockCheckoutOrder["inventoryStatus"]
): PaymentTransitionResult | undefined {
  const order = findMemoryOrder(orderId);

  if (!order) {
    return undefined;
  }

  assertOrderTransition(
    {
      orderId,
      status: order.status,
      paymentStatus: order.paymentStatus,
      inventoryStatus: order.inventoryStatus,
      storageMode: "memory"
    },
    status,
    paymentStatus,
    inventoryStatus
  );

  order.status = status;
  order.paymentStatus = paymentStatus;
  order.inventoryStatus = inventoryStatus;

  return {
    orderId,
    status,
    paymentStatus,
    inventoryStatus,
    compensationQueued: false,
    storageMode: "memory"
  };
}

function isFinalTransition(
  state: OrderStateSnapshot,
  action: "confirm" | "cancel"
): boolean {
  return (
    (action === "confirm" && state.status === "paid" && state.paymentStatus === "paid" && state.inventoryStatus === "confirmed") ||
    (action === "cancel" && state.status === "cancelled" && state.paymentStatus === "cancelled" && state.inventoryStatus === "cancelled")
  );
}

function desiredStateForAction(action: "confirm" | "cancel") {
  return action === "confirm"
    ? {
        status: "paid" as const,
        paymentStatus: "paid" as const,
        inventoryStatus: "confirmed" as const
      }
    : {
        status: "cancelled" as const,
        paymentStatus: "cancelled" as const,
        inventoryStatus: "cancelled" as const
      };
}

function assertOrderTransition(
  current: OrderStateSnapshot,
  nextStatus: MockCheckoutOrder["status"],
  nextPaymentStatus: MockCheckoutOrder["paymentStatus"],
  nextInventoryStatus: MockCheckoutOrder["inventoryStatus"]
) {
  if (
    current.status === nextStatus &&
    current.paymentStatus === nextPaymentStatus &&
    current.inventoryStatus === nextInventoryStatus
  ) {
    return;
  }

  if (current.status === "pending_payment") {
    if (nextStatus === "paid" && nextPaymentStatus === "paid" && nextInventoryStatus === "confirmed") return;
    if (nextStatus === "cancelled" && nextPaymentStatus === "cancelled" && nextInventoryStatus === "cancelled") return;
    if (nextStatus === "compensating" && nextInventoryStatus === "compensation_pending") return;
  }

  if (current.status === "compensating") {
    if (nextStatus === "paid" && nextPaymentStatus === "paid" && nextInventoryStatus === "confirmed") return;
    if (nextStatus === "cancelled" && nextPaymentStatus === "cancelled" && nextInventoryStatus === "cancelled") return;
    if (nextStatus === "compensating" && nextInventoryStatus === "compensation_pending") return;
  }

  throw new ConflictException(
    `invalid order transition from ${current.status}/${current.paymentStatus}/${current.inventoryStatus} to ${nextStatus}/${nextPaymentStatus}/${nextInventoryStatus}`
  );
}

@Injectable()
class OrderRepository implements OnApplicationShutdown {
  private readonly pool = new Pool({
    connectionString: process.env.ORDER_DATABASE_URL ?? "postgres://commerce:commerce@localhost:5432/order_db",
    connectionTimeoutMillis: 800
  });

  async createMockOrder(
    ctx: StoreContext,
    checkout: ReturnType<typeof normalizeCheckout>,
    idempotencyKey: string,
    orderId: string,
    inventoryMode: MockCheckoutOrder["inventoryMode"],
    inventoryReservations: InventoryReservationResult[],
    inventoryVersionSnapshots: number[]
  ): Promise<MockCheckoutOrder> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const existing = await client.query<{
        id: string;
        order_number: string;
        customer_email: string;
        status: "pending_payment";
        payment_status: "mock_created";
        inventory_status: MockCheckoutOrder["inventoryStatus"];
        total_minor: number;
        currency: string;
        idempotency_key: string;
        created_at: Date;
      }>(
        `
          SELECT id, order_number, customer_email, status, payment_status, inventory_status, total_minor, currency, idempotency_key, created_at
          FROM orders
          WHERE store_id = $1 AND idempotency_key = $2
        `,
        [ctx.storeId, idempotencyKey]
      );

      const existingRow = existing.rows[0];

      if (existingRow) {
        await client.query("COMMIT");
        return {
          orderId: existingRow.id,
          orderNumber: existingRow.order_number,
          customerEmail: existingRow.customer_email,
          status: existingRow.status,
          paymentStatus: existingRow.payment_status,
          inventoryStatus: existingRow.inventory_status,
          storageMode: "postgres",
          inventoryMode: "postgres",
          paymentMode: "local-fallback",
          totalMinor: existingRow.total_minor,
          currency: existingRow.currency,
          paymentRedirectUrl: paymentRedirectUrl(existingRow.id),
          idempotencyKey: existingRow.idempotency_key,
          createdAt: existingRow.created_at.toISOString(),
          inventoryReservations: [],
          lines: []
        };
      }

      const order = buildMockOrder(checkout, idempotencyKey, "postgres", inventoryMode, inventoryReservations, orderId);
      await this.insertOrder(client, ctx, checkout, order, inventoryVersionSnapshots);
      await client.query("COMMIT");
      return order;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listOrders(ctx: StoreContext): Promise<AdminOrderSummary[]> {
    const result = await this.pool.query<{
      id: string;
      order_number: string;
      customer_email: string;
      status: string;
      payment_status: string;
      inventory_status: string;
      is_exception: boolean;
      failure_count: number;
      last_failure_reason: string | null;
      total_minor: number;
      currency: string;
      created_at: Date;
    }>(
      `
        SELECT
          o.id,
          o.order_number,
          o.customer_email,
          o.status,
          o.payment_status,
          o.inventory_status,
          o.total_minor,
          o.currency,
          o.created_at,
          (o.status = 'compensating' OR o.inventory_status = 'compensation_pending') AS is_exception,
          COALESCE(comp.failure_count, 0)::int AS failure_count,
          COALESCE(comp.last_failure_reason, '') AS last_failure_reason
        FROM orders o
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::int AS failure_count,
            (ARRAY_AGG(ct.last_error ORDER BY ct.updated_at DESC))[1] AS last_failure_reason
          FROM compensation_tasks ct
          WHERE ct.store_id = o.store_id
            AND ct.aggregate_type = 'order'
            AND ct.aggregate_id = o.id
            AND ct.status IN ('pending', 'processing', 'retrying', 'dead_lettered')
        ) comp ON true
        WHERE o.store_id = $1
        ORDER BY o.created_at DESC
        LIMIT 50
      `,
      [ctx.storeId]
    );

    return result.rows.map((row) => ({
      orderId: row.id,
      orderNumber: row.order_number,
      customerEmail: row.customer_email,
      status: row.status,
      paymentStatus: row.payment_status,
      inventoryStatus: row.inventory_status,
      isException: row.is_exception,
      failureCount: row.failure_count,
      lastFailureReason: row.last_failure_reason ?? "",
      totalMinor: row.total_minor,
      currency: row.currency,
      storageMode: "postgres",
      createdAt: row.created_at.toISOString()
    }));
  }

  async getOrderDetail(ctx: StoreContext, orderId: string): Promise<AdminOrderDetail> {
    const [orderResult, lineResult] = await Promise.all([
      this.pool.query<{
        id: string;
        order_number: string;
        customer_email: string;
        status: string;
        payment_status: string;
        inventory_status: string;
        is_exception: boolean;
        failure_count: number;
        last_failure_reason: string | null;
        total_minor: number;
        currency: string;
        idempotency_key: string;
        created_at: Date;
      }>(
        `
          SELECT
            o.id,
            o.order_number,
            o.customer_email,
            o.status,
            o.payment_status,
            o.inventory_status,
            o.total_minor,
            o.currency,
            o.idempotency_key,
            o.created_at,
            (o.status = 'compensating' OR o.inventory_status = 'compensation_pending') AS is_exception,
            COALESCE(comp.failure_count, 0)::int AS failure_count,
            COALESCE(comp.last_failure_reason, '') AS last_failure_reason
          FROM orders o
          LEFT JOIN LATERAL (
            SELECT
              COUNT(*)::int AS failure_count,
              (ARRAY_AGG(ct.last_error ORDER BY ct.updated_at DESC))[1] AS last_failure_reason
            FROM compensation_tasks ct
            WHERE ct.store_id = o.store_id
              AND ct.aggregate_type = 'order'
              AND ct.aggregate_id = o.id
              AND ct.status IN ('pending', 'processing', 'retrying', 'dead_lettered')
          ) comp ON true
          WHERE o.store_id = $1
            AND o.id = $2
        `,
        [ctx.storeId, orderId]
      ),
      this.pool.query<{
        sku_id: string;
        title_snapshot: string;
        sku_code_snapshot: string;
        hs_code_snapshot: string;
        material_snapshot: string;
        inventory_version_snapshot: number;
        inventory_reservation_key_snapshot: string | null;
        qty: number;
        unit_price_minor: number;
        currency: string;
      }>(
        `
          SELECT
            sku_id,
            title_snapshot,
            sku_code_snapshot,
            hs_code_snapshot,
            material_snapshot,
            inventory_version_snapshot,
            inventory_reservation_key_snapshot,
            qty,
            unit_price_minor,
            currency
          FROM order_lines
          WHERE store_id = $1
            AND order_id = $2
          ORDER BY id ASC
        `,
        [ctx.storeId, orderId]
      )
    ]);
    const order = orderResult.rows[0];

    if (!order) {
      throw new BadRequestException("order does not exist");
    }

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      customerEmail: order.customer_email,
      status: order.status,
      paymentStatus: order.payment_status,
      inventoryStatus: order.inventory_status,
      isException: order.is_exception,
      failureCount: order.failure_count,
      lastFailureReason: order.last_failure_reason ?? "",
      totalMinor: order.total_minor,
      currency: order.currency,
      storageMode: "postgres",
      createdAt: order.created_at.toISOString(),
      idempotencyKey: order.idempotency_key,
      lines: lineResult.rows.map((line) => ({
        skuId: line.sku_id,
        skuCode: line.sku_code_snapshot,
        title: line.title_snapshot,
        hsCode: line.hs_code_snapshot,
        material: line.material_snapshot,
        inventoryVersion: line.inventory_version_snapshot,
        inventoryReservationKey: line.inventory_reservation_key_snapshot ?? "",
        quantity: line.qty,
        unitPriceMinor: line.unit_price_minor,
        lineTotalMinor: line.unit_price_minor * line.qty,
        currency: line.currency
      }))
    };
  }

  async getOrderReservations(ctx: StoreContext, orderId: string): Promise<OrderLineReservation[]> {
    const result = await this.pool.query<{
      sku_id: string;
      qty: number;
      inventory_reservation_key_snapshot: string | null;
    }>(
      `
        SELECT sku_id, qty, inventory_reservation_key_snapshot
        FROM order_lines
        WHERE store_id = $1
          AND order_id = $2
        ORDER BY id ASC
      `,
      [ctx.storeId, orderId]
    );

    if (result.rows.length === 0) {
      throw new BadRequestException("order lines do not exist");
    }

    return result.rows.map((row) => {
      if (!row.inventory_reservation_key_snapshot) {
        throw new BadRequestException("order line missing inventory reservation key snapshot");
      }

      return {
        skuId: row.sku_id,
        qty: row.qty,
        idempotencyKey: row.inventory_reservation_key_snapshot
      };
    });
  }

  async getOrderState(ctx: StoreContext, orderId: string): Promise<OrderStateSnapshot> {
    const result = await this.pool.query<{
      id: string;
      status: MockCheckoutOrder["status"];
      payment_status: MockCheckoutOrder["paymentStatus"];
      inventory_status: MockCheckoutOrder["inventoryStatus"];
    }>(
      `
        SELECT id, status, payment_status, inventory_status
        FROM orders
        WHERE store_id = $1
          AND id = $2
      `,
      [ctx.storeId, orderId]
    );
    const row = result.rows[0];

    if (!row) {
      throw new BadRequestException("order does not exist");
    }

    return {
      orderId: row.id,
      status: row.status,
      paymentStatus: row.payment_status,
      inventoryStatus: row.inventory_status,
      storageMode: "postgres"
    };
  }

  async transitionOrder(
    ctx: StoreContext,
    orderId: string,
    status: MockCheckoutOrder["status"],
    paymentStatus: MockCheckoutOrder["paymentStatus"],
    inventoryStatus: MockCheckoutOrder["inventoryStatus"]
  ): Promise<PaymentTransitionResult> {
    return this.withTransaction(async (client) => {
      const currentResult = await client.query<{
        id: string;
        status: MockCheckoutOrder["status"];
        payment_status: MockCheckoutOrder["paymentStatus"];
        inventory_status: MockCheckoutOrder["inventoryStatus"];
      }>(
        `
          SELECT id, status, payment_status, inventory_status
          FROM orders
          WHERE store_id = $1
            AND id = $2
          FOR UPDATE
        `,
        [ctx.storeId, orderId]
      );
      const current = currentResult.rows[0];

      if (!current) {
        throw new BadRequestException("order does not exist");
      }

      assertOrderTransition(
        {
          orderId: current.id,
          status: current.status,
          paymentStatus: current.payment_status,
          inventoryStatus: current.inventory_status,
          storageMode: "postgres"
        },
        status,
        paymentStatus,
        inventoryStatus
      );

      const result = await client.query<{
        id: string;
        status: MockCheckoutOrder["status"];
        payment_status: MockCheckoutOrder["paymentStatus"];
        inventory_status: MockCheckoutOrder["inventoryStatus"];
      }>(
        `
          UPDATE orders
          SET status = $3,
              payment_status = $4,
              inventory_status = $5
          WHERE store_id = $1
            AND id = $2
          RETURNING id, status, payment_status, inventory_status
        `,
        [ctx.storeId, orderId, status, paymentStatus, inventoryStatus]
      );
      const row = result.rows[0];

      return {
        orderId: row.id,
        status: row.status,
        paymentStatus: row.payment_status,
        inventoryStatus: row.inventory_status,
        compensationQueued: inventoryStatus === "compensation_pending",
        storageMode: "postgres"
      };
    });
  }

  async enqueueCompensationTask(ctx: StoreContext, input: CompensationTaskInput): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO compensation_tasks (
          id,
          store_id,
          task_type,
          aggregate_type,
          aggregate_id,
          idempotency_key,
          status,
          attempt_count,
          max_attempts,
          next_run_at,
          last_error,
          correlation_id,
          payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'pending', 0, 8, $7, $8, $9, $10)
        ON CONFLICT (store_id, idempotency_key) DO UPDATE
        SET status = 'pending',
            next_run_at = EXCLUDED.next_run_at,
            last_error = EXCLUDED.last_error,
            correlation_id = EXCLUDED.correlation_id,
            payload = EXCLUDED.payload,
            updated_at = now()
      `,
      [
        randomUUID(),
        ctx.storeId,
        input.taskType,
        input.aggregateType,
        input.aggregateId,
        input.idempotencyKey,
        nextRetryAt(0),
        input.lastError.slice(0, 2000),
        ctx.correlationId,
        JSON.stringify(input.payload)
      ]
    );
  }

  private async insertOrder(
    client: PoolClient,
    ctx: StoreContext,
    checkout: ReturnType<typeof normalizeCheckout>,
    order: MockCheckoutOrder,
    inventoryVersionSnapshots: number[]
  ) {
    await client.query(
      `
        INSERT INTO orders (
          id,
          store_id,
          order_number,
          customer_email,
          status,
          payment_status,
          inventory_status,
          currency,
          total_minor,
          idempotency_key
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        order.orderId,
        ctx.storeId,
        order.orderNumber,
        checkout.customerEmail,
        order.status,
        order.paymentStatus,
        order.inventoryStatus,
        order.currency,
        order.totalMinor,
        order.idempotencyKey
      ]
    );

    for (const [index, line] of checkout.lines.entries()) {
      await client.query(
        `
          INSERT INTO order_lines (
            id,
            store_id,
            order_id,
            sku_id,
            title_snapshot,
            sku_code_snapshot,
            hs_code_snapshot,
            material_snapshot,
            inventory_version_snapshot,
            inventory_reservation_key_snapshot,
            qty,
            unit_price_minor,
            currency
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `,
        [
          randomUUID(),
          ctx.storeId,
          order.orderId,
          line.skuId,
          line.title,
          line.skuCode,
          "LOCAL-MOCK",
          "LOCAL-MOCK",
          inventoryVersionSnapshots[index] ?? 1,
          `${order.idempotencyKey}:inventory:${index}`,
          line.quantity,
          line.unitPriceMinor,
          line.currency
        ]
      );
    }
  }

  private async withTransaction<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const result = await handler(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async onApplicationShutdown() {
    await this.pool.end();
  }
}

@Controller()
class OrderController {
  constructor(@Inject(OrderRepository) private readonly orderRepository: OrderRepository) {}

  @Get("/health")
  health() {
    return {
      service: "order-service",
      status: "ok",
      saga: "create-order-reserve-inventory-create-payment"
    };
  }

  @Get("/orders")
  async orders(@Headers("x-correlation-id") correlationId: string | undefined) {
    const ctx = createStoreContext(correlationId);

    try {
      return await this.orderRepository.listOrders(ctx);
    } catch {
      return listMemoryOrders();
    }
  }

  @Get("/orders/:id")
  async orderDetail(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Param("id") id: string
  ): Promise<AdminOrderDetail> {
    const ctx = createStoreContext(correlationId);
    const orderId = normalizeOrderId(id);

    try {
      return await this.orderRepository.getOrderDetail(ctx, orderId);
    } catch (error) {
      const memoryOrder = findMemoryOrder(orderId);

      if (!memoryOrder) {
        if (error instanceof HttpException) {
          throw error;
        }

        throw new BadRequestException("order does not exist");
      }

      return {
        orderId: memoryOrder.orderId,
        orderNumber: memoryOrder.orderNumber,
        customerEmail: memoryOrder.customerEmail,
        status: memoryOrder.status,
        paymentStatus: memoryOrder.paymentStatus,
        inventoryStatus: memoryOrder.inventoryStatus,
        isException: isExceptionState(memoryOrder.status, memoryOrder.inventoryStatus),
        failureCount: 0,
        lastFailureReason: "",
        totalMinor: memoryOrder.totalMinor,
        currency: memoryOrder.currency,
        storageMode: "memory",
        createdAt: memoryOrder.createdAt,
        idempotencyKey: memoryOrder.idempotencyKey,
        lines: memoryOrder.lines.map((line, index) => ({
          skuId: line.skuId,
          skuCode: line.skuCode,
          title: line.title,
          hsCode: "LOCAL-MOCK",
          material: "LOCAL-MOCK",
          inventoryVersion: memoryOrder.inventoryReservations[index]?.inventoryVersion ?? 1,
          inventoryReservationKey: memoryOrder.inventoryReservations[index]?.idempotencyKey ?? `${memoryOrder.idempotencyKey}:inventory:${index}`,
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          lineTotalMinor: line.unitPriceMinor * line.quantity,
          currency: line.currency
        }))
      };
    }
  }

  @Post("/checkout/mock-order")
  async createMockOrder(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Headers("idempotency-key") idempotencyKeyHeader: string | undefined,
    @Headers("x-idempotency-key") alternateIdempotencyKeyHeader: string | undefined,
    @Body() body: MockCheckoutRequest
  ) {
    const idempotencyKey = idempotencyKeyHeader ?? alternateIdempotencyKeyHeader ?? randomUUID();
    const checkout = normalizeCheckout(body);
    const ctx = createStoreContext(correlationId);
    const startedAt = Date.now();
    try {
      const orderId = randomUUID();
      const reservations = await this.reserveInventory(ctx, checkout, idempotencyKey, orderId);
      const inventoryMode = reservations.some((reservation) => reservation.storageMode === "postgres") ? "postgres" : "memory";
      const inventoryVersionSnapshots = reservations.map((reservation) => reservation.inventoryVersion);

      try {
        const order = await this.orderRepository.createMockOrder(
          ctx,
          checkout,
          idempotencyKey,
          orderId,
          inventoryMode,
          reservations,
          inventoryVersionSnapshots
        );
        return this.attachMockPayment(ctx, checkout, order);
      } catch (error) {
        if (inventoryMode === "memory") {
          const order = mockMemoryOrder(checkout, idempotencyKey, inventoryMode, reservations, orderId);
          return this.attachMockPayment(ctx, checkout, order);
        }

        await this.cancelInventory(ctx, reservations);

        if (error instanceof HttpException) {
          throw error;
        }

        throw new ServiceUnavailableException("order storage unavailable after inventory reservation; reservation was cancelled");
      }
    } finally {
      warnIfSlow("order.create", startedAt, slowOrderCreateMs, ctx);
    }
  }

  @Post("/payments/mock-confirm")
  async confirmMockPayment(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Body() body: PaymentTransitionRequest
  ): Promise<PaymentTransitionResult> {
    const ctx = createStoreContext(correlationId);
    const orderId = normalizeOrderId(body.orderId);
    return this.transitionPayment(ctx, orderId, "confirm");
  }

  @Post("/payments/mock-cancel")
  async cancelMockPayment(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Body() body: PaymentTransitionRequest
  ): Promise<PaymentTransitionResult> {
    const ctx = createStoreContext(correlationId);
    const orderId = normalizeOrderId(body.orderId);
    return this.transitionPayment(ctx, orderId, "cancel");
  }

  private async transitionPayment(
    ctx: StoreContext,
    orderId: string,
    action: "confirm" | "cancel"
  ): Promise<PaymentTransitionResult> {
    const memoryOrder = findMemoryOrder(orderId);

    if (memoryOrder?.storageMode === "memory") {
      const currentState: OrderStateSnapshot = {
        orderId,
        status: memoryOrder.status,
        paymentStatus: memoryOrder.paymentStatus,
        inventoryStatus: memoryOrder.inventoryStatus,
        storageMode: "memory"
      };

      if (isFinalTransition(currentState, action)) {
        return {
          ...currentState,
          compensationQueued: false
        };
      }

      const desired = desiredStateForAction(action);
      assertOrderTransition(currentState, desired.status, desired.paymentStatus, desired.inventoryStatus);

      const reservations = memoryOrder.inventoryReservations;
      const compensationQueued = await this.applyInventoryTransition(ctx, orderId, reservations, action, false);
      const inventoryStatus = compensationQueued ? "compensation_pending" : action === "confirm" ? "confirmed" : "cancelled";
      return (
        transitionMemoryOrder(
          orderId,
          compensationQueued ? "compensating" : action === "confirm" ? "paid" : "cancelled",
          action === "confirm" ? "paid" : "cancelled",
          inventoryStatus
        ) ?? {
          orderId,
          status: "compensating",
          paymentStatus: action === "confirm" ? "paid" : "cancelled",
          inventoryStatus: "compensation_pending",
          compensationQueued: true,
          storageMode: "memory"
        }
      );
    }

    let currentState: OrderStateSnapshot;
    let reservations: OrderLineReservation[];

    try {
      currentState = await this.orderRepository.getOrderState(ctx, orderId);

      if (isFinalTransition(currentState, action)) {
        return {
          ...currentState,
          compensationQueued: false
        };
      }

      const desired = desiredStateForAction(action);
      assertOrderTransition(currentState, desired.status, desired.paymentStatus, desired.inventoryStatus);

      reservations = await this.orderRepository.getOrderReservations(ctx, orderId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      const memoryFallback = transitionMemoryOrder(
        orderId,
        "compensating",
        action === "confirm" ? "paid" : "cancelled",
        "compensation_pending"
      );

      if (memoryFallback) {
        return { ...memoryFallback, compensationQueued: true };
      }

      throw new BadRequestException("order does not exist");
    }

    const compensationQueued = await this.applyInventoryTransition(ctx, orderId, reservations, action, true);
    return this.orderRepository.transitionOrder(
      ctx,
      orderId,
      compensationQueued ? "compensating" : action === "confirm" ? "paid" : "cancelled",
      action === "confirm" ? "paid" : "cancelled",
      compensationQueued ? "compensation_pending" : action === "confirm" ? "confirmed" : "cancelled"
    );
  }

  private async applyInventoryTransition(
    ctx: StoreContext,
    orderId: string,
    reservations: OrderLineReservation[],
    action: "confirm" | "cancel",
    persistCompensation: boolean
  ): Promise<boolean> {
    let compensationQueued = false;

    for (const reservation of reservations) {
      try {
        await this.callInventory(ctx, action === "confirm" ? "/reservations/confirm" : "/reservations/cancel", reservation.idempotencyKey, {
          skuId: reservation.skuId,
          warehouseId: reservation.warehouseId,
          qty: reservation.qty
        });
      } catch (error) {
        compensationQueued = true;

        if (persistCompensation) {
          await this.enqueueInventoryCompensation(ctx, orderId, reservation, action, error);
        }
      }
    }

    return compensationQueued;
  }

  private async enqueueInventoryCompensation(
    ctx: StoreContext,
    orderId: string,
    reservation: OrderLineReservation,
    action: "confirm" | "cancel",
    error: unknown
  ) {
    const message = error instanceof Error ? error.message : "inventory compensation failed";

    try {
      await this.orderRepository.enqueueCompensationTask(ctx, {
        taskType: action === "confirm" ? "inventory_confirm" : "inventory_cancel",
        aggregateType: "order",
        aggregateId: orderId,
        idempotencyKey: `${reservation.idempotencyKey}:compensation:${action}`,
        lastError: message,
        payload: {
          orderId,
          action,
          reservation
        }
      });
    } catch {
      // If the durable task table is unavailable, the order transition still exposes compensation_pending.
      // The next worker/DLQ step will make this path visible in the admin surface.
    }
  }

  private async reserveInventory(
    ctx: StoreContext,
    checkout: ReturnType<typeof normalizeCheckout>,
    orderIdempotencyKey: string,
    orderId: string
  ): Promise<InventoryReservationResult[]> {
    const reservations: InventoryReservationResult[] = [];

    for (const [index, line] of checkout.lines.entries()) {
      const idempotencyKey = `${orderIdempotencyKey}:inventory:${index}`;

      try {
        const reservation = await this.callInventory(ctx, "/reservations/try", idempotencyKey, {
          skuId: line.skuId,
          orderId,
          qty: line.quantity
        });
        reservations.push(reservation);
      } catch (error) {
        await this.cancelInventory(ctx, reservations);

        if (error instanceof HttpException) {
          throw error;
        }

        throw new ServiceUnavailableException("inventory reservation failed");
      }
    }

    return reservations;
  }

  private async cancelInventory(ctx: StoreContext, reservations: InventoryReservationResult[]) {
    await Promise.all(
      reservations
        .filter((reservation) => reservation.status === "reserved")
        .map((reservation) =>
          this.callInventory(ctx, "/reservations/cancel", reservation.idempotencyKey, {
            skuId: reservation.skuId,
            warehouseId: reservation.warehouseId,
            qty: reservation.qty
          }).catch(() => undefined)
        )
    );
  }

  private async callInventory(
    ctx: StoreContext,
    path: "/reservations/try" | "/reservations/confirm" | "/reservations/cancel",
    idempotencyKey: string,
    body: { skuId: string; warehouseId?: string; orderId?: string; qty: number }
  ): Promise<InventoryReservationResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 900);

    try {
      const response = await fetch(`${inventoryServiceUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-correlation-id": ctx.correlationId,
          "x-idempotency-key": idempotencyKey
        },
        body: JSON.stringify({ ...body, idempotencyKey }),
        signal: controller.signal
      });
      const payload = (await response.json().catch(() => ({}))) as Partial<InventoryReservationResult> & {
        message?: string;
      };

      if (!response.ok) {
        if (response.status === 409) {
          throw new ConflictException(payload.message ?? "insufficient inventory");
        }

        throw new ServiceUnavailableException(payload.message ?? "inventory service unavailable");
      }

      if (!payload.reservationId || !payload.skuId || !payload.warehouseId || !payload.storageMode) {
        throw new ServiceUnavailableException("inventory service returned an invalid reservation");
      }

      return payload as InventoryReservationResult;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new ServiceUnavailableException("inventory service unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }

  private async attachMockPayment(
    ctx: StoreContext,
    checkout: ReturnType<typeof normalizeCheckout>,
    order: MockCheckoutOrder
  ): Promise<MockCheckoutOrder> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 900);

    try {
      const response = await fetch(`${paymentServiceUrl}/payments/mock-intents`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-correlation-id": ctx.correlationId
        },
        body: JSON.stringify({
          orderId: order.orderId,
          idempotencyKey: `${order.idempotencyKey}:payment`,
          amountMinor: order.totalMinor,
          currency: order.currency,
          customerEmail: checkout.customerEmail,
          returnUrl: order.paymentRedirectUrl
        }),
        signal: controller.signal
      });
      const payload = (await response.json().catch(() => ({}))) as { redirectUrl?: string };

      if (!response.ok || !payload.redirectUrl) {
        return order;
      }

      return {
        ...order,
        paymentMode: "provider",
        paymentRedirectUrl: payload.redirectUrl
      };
    } catch {
      return order;
    } finally {
      clearTimeout(timeout);
    }
  }
}

@Module({ controllers: [OrderController], providers: [OrderRepository] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  await app.listen(Number(process.env.PORT ?? 4105), "0.0.0.0");
}

void bootstrap();
