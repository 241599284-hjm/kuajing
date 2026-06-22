import { describe, expect, it } from "vitest";
import { adminProductSearchFilter, normalizeAdminProductSearch } from "./admin-product-search.js";

describe("admin product search", () => {
  it("normalizes optional search text", () => {
    expect(normalizeAdminProductSearch(undefined)).toBe("");
    expect(normalizeAdminProductSearch("  白瓷  ")).toBe("白瓷");
    expect(normalizeAdminProductSearch("x".repeat(140))).toHaveLength(100);
  });

  it("builds a parameterized product filter", () => {
    expect(adminProductSearchFilter("", 2)).toEqual({ sql: "", values: [] });
    expect(adminProductSearchFilter("tea", 2)).toEqual({
      sql: expect.stringContaining("ILIKE $2"),
      values: ["%tea%"]
    });
  });
});
