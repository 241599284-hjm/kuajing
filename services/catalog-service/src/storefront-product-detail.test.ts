import { describe, expect, it } from "vitest";
import type { CatalogStorefrontProduct } from "@commerce/contracts";
import { storefrontProductBySlug } from "./storefront-product-detail.js";

const products = [
  { slug: "porcelain-tea-set" },
  { slug: "yixing-clay-pot" }
] as CatalogStorefrontProduct[];

describe("storefrontProductBySlug", () => {
  it("returns the product identified by its stable business slug", () => {
    expect(storefrontProductBySlug(products, "yixing-clay-pot")).toBe(products[1]);
  });

  it("returns a standard not-found error for deleted or unknown products", () => {
    expect(() => storefrontProductBySlug(products, "missing-product")).toThrowError(
      expect.objectContaining({ status: 404, response: expect.objectContaining({ code: "NOT_FOUND" }) })
    );
  });
});
