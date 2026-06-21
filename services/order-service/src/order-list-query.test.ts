import { describe, expect, it } from "vitest";
import {
  buildOrderListSql,
  filterAndPaginateMemoryOrders,
  normalizeOrderListQuery
} from "./order-list-query.js";

describe("normalizeOrderListQuery", () => {
  it("uses the admin list defaults", () => {
    expect(normalizeOrderListQuery({})).toEqual({
      page: 1,
      size: 20,
      search: "",
      status: undefined,
      paymentStatus: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      amountMinMinor: undefined,
      amountMaxMinor: undefined
    });
  });

  it("normalizes supported filters", () => {
    expect(normalizeOrderListQuery({
      page: "2",
      size: "50",
      search: " buyer@example.com ",
      status: "paid",
      paymentStatus: "partially_refunded",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-21",
      amountMinMinor: "1000",
      amountMaxMinor: "9900"
    })).toMatchObject({
      page: 2,
      size: 50,
      search: "buyer@example.com",
      status: "paid",
      paymentStatus: "partially_refunded",
      amountMinMinor: 1000,
      amountMaxMinor: 9900
    });
  });

  it("rejects invalid pagination, statuses, dates, and amount ranges", () => {
    expect(() => normalizeOrderListQuery({ page: "0" })).toThrow();
    expect(() => normalizeOrderListQuery({ size: "101" })).toThrow();
    expect(() => normalizeOrderListQuery({ status: "unknown" })).toThrow();
    expect(() => normalizeOrderListQuery({ dateFrom: "21-06-2026" })).toThrow();
    expect(() => normalizeOrderListQuery({ amountMinMinor: "200", amountMaxMinor: "100" })).toThrow();
  });
});

describe("buildOrderListSql", () => {
  it("uses parameters for search and filters instead of interpolating input", () => {
    const query = normalizeOrderListQuery({
      search: "buyer@example.com",
      status: "paid",
      amountMinMinor: "1000",
      page: "2",
      size: "20"
    });
    const built = buildOrderListSql("store-1", query);

    expect(built.text).toContain("COUNT(*) OVER()");
    expect(built.text).toContain("ILIKE");
    expect(built.text).not.toContain("buyer@example.com");
    expect(built.values).toContain("%buyer@example.com%");
    expect(built.values.slice(-2)).toEqual([20, 20]);
  });
});

describe("filterAndPaginateMemoryOrders", () => {
  const orders = [
    {
      orderId: "1",
      orderNumber: "ORDER-001",
      customerEmail: "first@example.com",
      status: "paid",
      paymentStatus: "paid",
      inventoryStatus: "confirmed",
      isException: false,
      failureCount: 0,
      lastFailureReason: "",
      totalMinor: 5000,
      currency: "USD",
      storageMode: "memory" as const,
      createdAt: "2026-06-20T10:00:00.000Z"
    },
    {
      orderId: "2",
      orderNumber: "ORDER-002",
      customerEmail: "second@example.com",
      status: "cancelled",
      paymentStatus: "cancelled",
      inventoryStatus: "cancelled",
      isException: false,
      failureCount: 0,
      lastFailureReason: "",
      totalMinor: 9000,
      currency: "USD",
      storageMode: "memory" as const,
      createdAt: "2026-06-19T10:00:00.000Z"
    }
  ];

  it("returns filtered paging metadata", () => {
    const result = filterAndPaginateMemoryOrders(orders, normalizeOrderListQuery({
      search: "first@",
      status: "paid"
    }));

    expect(result).toMatchObject({ page: 1, size: 20, total: 1, totalPages: 1 });
    expect(result.items.map((order) => order.orderNumber)).toEqual(["ORDER-001"]);
  });
});
