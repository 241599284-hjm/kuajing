export const catalogCacheKeys = {
  storefront: "catalog:storefront:v2",
  categories: "catalog:categories:v1",
  regions: "catalog:regions:v1",
  productSummaries: "catalog:product-summaries:v1",
  storefrontProducts: "catalog:storefront-products:v2"
} as const;

export function categoryWriteInvalidationKeys(): string[] {
  return [
    catalogCacheKeys.categories,
    catalogCacheKeys.productSummaries,
    catalogCacheKeys.storefrontProducts,
    catalogCacheKeys.storefront
  ];
}

export function regionWriteInvalidationKeys(): string[] {
  return [
    catalogCacheKeys.regions,
    catalogCacheKeys.productSummaries,
    catalogCacheKeys.storefrontProducts,
    catalogCacheKeys.storefront
  ];
}

export function productWriteInvalidationKeys(): string[] {
  return [catalogCacheKeys.productSummaries, catalogCacheKeys.storefrontProducts, catalogCacheKeys.storefront];
}
