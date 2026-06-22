import { describe, expect, it } from "vitest";
import { customerSearchFilter, normalizeCustomerSearch } from "./customer-search.js";

describe("admin customer search", () => {
  it("normalizes optional search text", () => {
    expect(normalizeCustomerSearch(undefined)).toBe("");
    expect(normalizeCustomerSearch(" buyer@example.com ")).toBe("buyer@example.com");
    expect(normalizeCustomerSearch("x".repeat(140))).toHaveLength(100);
  });

  it("builds a parameterized customer filter", () => {
    expect(customerSearchFilter("", 2)).toEqual({ sql: "", values: [] });
    expect(customerSearchFilter("buyer", 2)).toEqual({
      sql: expect.stringContaining("ILIKE $2"),
      values: ["%buyer%"]
    });
  });
});
