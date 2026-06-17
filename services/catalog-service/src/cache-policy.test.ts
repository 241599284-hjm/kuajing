import { describe, expect, it } from "vitest";
import { catalogCacheKeys, categoryWriteInvalidationKeys, productWriteInvalidationKeys, regionWriteInvalidationKeys } from "./cache-policy.js";

describe("catalog cache invalidation policy", () => {
  it("invalidates dependent product projections when categories change", () => {
    expect(categoryWriteInvalidationKeys()).toEqual([
      catalogCacheKeys.categories,
      catalogCacheKeys.productSummaries,
      catalogCacheKeys.storefrontProducts,
      catalogCacheKeys.storefront
    ]);
  });

  it("invalidates dependent product projections when regions change", () => {
    expect(regionWriteInvalidationKeys()).toEqual([
      catalogCacheKeys.regions,
      catalogCacheKeys.productSummaries,
      catalogCacheKeys.storefrontProducts,
      catalogCacheKeys.storefront
    ]);
  });

  it("invalidates product projections when products change", () => {
    expect(productWriteInvalidationKeys()).toEqual([
      catalogCacheKeys.productSummaries,
      catalogCacheKeys.storefrontProducts,
      catalogCacheKeys.storefront
    ]);
  });
});
