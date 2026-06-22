import { describe, expect, it } from "vitest";
import { globalSearchSelection, type GlobalSearchResult } from "./global-search.js";

describe("globalSearchSelection", () => {
  it.each([
    [{ type: "order", id: "order-1", section: "orders", title: "ORD-1001", subtitle: "buyer@example.com", meta: "paid" }, { section: "orders", search: "ORD-1001" }],
    [{ type: "product", id: "TEA-001", section: "products", title: "白瓷茶具", subtitle: "White Tea Set", meta: "active" }, { section: "products", search: "TEA-001" }],
    [{ type: "customer", id: "customer-1", section: "customers", title: "Buyer", subtitle: "buyer@example.com", meta: "active" }, { section: "customers", search: "buyer@example.com" }]
  ] as Array<[GlobalSearchResult, { section: string; search: string }]>)("uses a stable business filter for %s", (result, expected) => {
    expect(globalSearchSelection(result)).toEqual(expected);
  });
});
