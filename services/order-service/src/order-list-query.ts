export const ORDER_STATUSES = ["pending_payment", "paid", "cancelled", "compensating"] as const;
export const PAYMENT_STATUSES = [
  "mock_created",
  "paid",
  "cancelled",
  "partially_refunded",
  "refunded"
] as const;

export type OrderListQuery = {
  page: number;
  size: number;
  search: string;
  status?: string;
  paymentStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  amountMinMinor?: number;
  amountMaxMinor?: number;
};

export type OrderListItem = {
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
  providerPaymentId?: string;
};

export type OrderListResult = {
  items: OrderListItem[];
  page: number;
  size: number;
  total: number;
  totalPages: number;
};

export class OrderListQueryError extends Error {}

function positiveInteger(value: unknown, fallback: number, field: string, max: number) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new OrderListQueryError(`${field} must be an integer between 1 and ${max}`);
  }
  return parsed;
}

function optionalMinor(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new OrderListQueryError(`${field} must be a non-negative integer`);
  }
  return parsed;
}

function optionalDate(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new OrderListQueryError(`${field} must use YYYY-MM-DD`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new OrderListQueryError(`${field} is not a valid date`);
  }
  return value;
}

function optionalEnum(value: unknown, allowed: readonly string[], field: string) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new OrderListQueryError(`${field} is invalid`);
  }
  return value;
}

export function normalizeOrderListQuery(input: Record<string, unknown>): OrderListQuery {
  const page = positiveInteger(input.page, 1, "page", 1_000_000);
  const size = positiveInteger(input.size, 20, "size", 100);
  const search = typeof input.search === "string" ? input.search.trim() : "";
  const status = optionalEnum(input.status, ORDER_STATUSES, "status");
  const paymentStatus = optionalEnum(input.paymentStatus, PAYMENT_STATUSES, "paymentStatus");
  const dateFrom = optionalDate(input.dateFrom, "dateFrom");
  const dateTo = optionalDate(input.dateTo, "dateTo");
  const amountMinMinor = optionalMinor(input.amountMinMinor, "amountMinMinor");
  const amountMaxMinor = optionalMinor(input.amountMaxMinor, "amountMaxMinor");

  if (search.length > 200) throw new OrderListQueryError("search must not exceed 200 characters");
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new OrderListQueryError("dateFrom must be before or equal to dateTo");
  }
  if (amountMinMinor !== undefined && amountMaxMinor !== undefined && amountMinMinor > amountMaxMinor) {
    throw new OrderListQueryError("amountMinMinor must be less than or equal to amountMaxMinor");
  }
  return { page, size, search, status, paymentStatus, dateFrom, dateTo, amountMinMinor, amountMaxMinor };
}

export function buildOrderListSql(storeId: string, query: OrderListQuery) {
  const values: unknown[] = [storeId];
  const conditions = ["o.store_id = $1"];
  const parameter = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (query.search) {
    const token = parameter(`%${query.search}%`);
    conditions.push(`(
      o.order_number ILIKE ${token}
      OR o.customer_email ILIKE ${token}
      OR EXISTS (
        SELECT 1 FROM payment_transactions pt
        WHERE pt.store_id = o.store_id
          AND pt.order_id = o.id
          AND (pt.provider_payment_id ILIKE ${token} OR pt.provider_capture_id ILIKE ${token})
      )
    )`);
  }
  if (query.status) conditions.push(`o.status = ${parameter(query.status)}`);
  if (query.paymentStatus) conditions.push(`o.payment_status = ${parameter(query.paymentStatus)}`);
  if (query.dateFrom) conditions.push(`o.created_at >= ${parameter(query.dateFrom)}::date`);
  if (query.dateTo) conditions.push(`o.created_at < ${parameter(query.dateTo)}::date + INTERVAL '1 day'`);
  if (query.amountMinMinor !== undefined) conditions.push(`o.total_minor >= ${parameter(query.amountMinMinor)}`);
  if (query.amountMaxMinor !== undefined) conditions.push(`o.total_minor <= ${parameter(query.amountMaxMinor)}`);

  const limit = parameter(query.size);
  const offset = parameter((query.page - 1) * query.size);
  return {
    text: `
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
        COALESCE(comp.last_failure_reason, '') AS last_failure_reason,
        payment.provider_payment_id,
        COUNT(*) OVER()::int AS total_count
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
      LEFT JOIN LATERAL (
        SELECT pt.provider_payment_id
        FROM payment_transactions pt
        WHERE pt.store_id = o.store_id AND pt.order_id = o.id
        ORDER BY pt.created_at DESC
        LIMIT 1
      ) payment ON true
      WHERE ${conditions.join("\n        AND ")}
      ORDER BY o.created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `,
    values
  };
}

export function filterAndPaginateMemoryOrders(
  orders: OrderListItem[],
  query: OrderListQuery
): OrderListResult {
  const from = query.dateFrom ? new Date(`${query.dateFrom}T00:00:00.000Z`).getTime() : undefined;
  const to = query.dateTo ? new Date(`${query.dateTo}T23:59:59.999Z`).getTime() : undefined;
  const search = query.search.toLowerCase();
  const filtered = orders.filter((order) => {
    const createdAt = new Date(order.createdAt).getTime();
    return (!search || [order.orderNumber, order.customerEmail, order.providerPaymentId ?? ""]
      .some((value) => value.toLowerCase().includes(search)))
      && (!query.status || order.status === query.status)
      && (!query.paymentStatus || order.paymentStatus === query.paymentStatus)
      && (from === undefined || createdAt >= from)
      && (to === undefined || createdAt <= to)
      && (query.amountMinMinor === undefined || order.totalMinor >= query.amountMinMinor)
      && (query.amountMaxMinor === undefined || order.totalMinor <= query.amountMaxMinor);
  });
  const total = filtered.length;
  const start = (query.page - 1) * query.size;
  return {
    items: filtered.slice(start, start + query.size),
    page: query.page,
    size: query.size,
    total,
    totalPages: Math.ceil(total / query.size)
  };
}
