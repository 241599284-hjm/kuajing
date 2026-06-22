import { describe, expect, it } from "vitest";
import {
  buildGlobalSearchResults,
  normalizeGlobalSearchQuery
} from "./global-search.js";

describe("global admin search", () => {
  it("requires a useful bounded query", () => {
    expect(() => normalizeGlobalSearchQuery("a")).toThrow("at least 2");
    expect(normalizeGlobalSearchQuery("  tea@example.com  ")).toBe("tea@example.com");
    expect(normalizeGlobalSearchQuery("x".repeat(140))).toHaveLength(100);
  });

  it("combines real business records using stable business ids", () => {
    expect(buildGlobalSearchResults({
      orders: [{
        orderId: "order-1",
        orderNumber: "ORD-1001",
        customerEmail: "buyer@example.com",
        providerPaymentId: "PAYPAL-42",
        status: "paid",
        totalMinor: 9600,
        currency: "USD"
      }],
      products: [{
        sku: "TEA-001",
        nameZh: "白瓷茶具",
        nameEn: "White Porcelain Tea Set",
        category: "gift",
        status: "active"
      }],
      customers: [{
        customerId: "customer-1",
        name: "Buyer",
        email: "buyer@example.com",
        status: "active"
      }]
    }, 10)).toEqual([
      expect.objectContaining({ type: "order", id: "order-1", section: "orders", title: "ORD-1001" }),
      expect.objectContaining({ type: "product", id: "TEA-001", section: "products", title: "白瓷茶具" }),
      expect.objectContaining({ type: "customer", id: "customer-1", section: "customers", title: "Buyer" })
    ]);
  });

  it("applies a single total result limit", () => {
    const orders = Array.from({ length: 8 }, (_, index) => ({
      orderId: `order-${index}`,
      orderNumber: `ORD-${index}`,
      customerEmail: "buyer@example.com",
      status: "paid",
      totalMinor: 100,
      currency: "USD"
    }));
    expect(buildGlobalSearchResults({ orders, products: [], customers: [] }, 5)).toHaveLength(5);
  });
});
