import type { CatalogStorefrontProduct } from "@commerce/contracts";
import { catalogNotFound } from "./catalog-errors.js";

export function storefrontProductBySlug(products: CatalogStorefrontProduct[], slug: string) {
  const product = products.find((item) => item.slug === slug);
  if (!product) throw catalogNotFound("storefront product not found", { slug });
  return product;
}
