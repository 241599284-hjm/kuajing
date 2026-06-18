import { describe, expect, it } from "vitest";
import { normalizeProductPriceMinor } from "./product-price.js";

describe("normalizeProductPriceMinor", () => {
  it("keeps integer minor units unchanged", () => {
    expect(normalizeProductPriceMinor(undefined, 1299)).toBe(1299);
  });

  it("supports the existing major-unit admin field", () => {
    expect(normalizeProductPriceMinor(12.99)).toBe(1299);
  });

  it("rejects non-integer minor units", () => {
    expect(() => normalizeProductPriceMinor(undefined, 12.5)).toThrow(
      "product.priceMinor must be a non-negative integer"
    );
  });
});
