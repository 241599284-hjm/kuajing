import type { HomepageLayout, HomepageModule } from "@commerce/contracts";
import type { StorefrontCategory, StorefrontProduct } from "./storefront-content.js";

export type ResolvedHomepageModule = HomepageModule & {
  categories?: StorefrontCategory[];
  products?: StorefrontProduct[];
};

export function resolveHomepageModules(
  layout: HomepageLayout,
  products: StorefrontProduct[],
  categories: StorefrontCategory[]
): ResolvedHomepageModule[] {
  const productBySlug = new Map(products.map((product) => [product.slug, product]));
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));

  return layout.modules
    .filter((module) => module.enabled)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((module) => ({
      ...module,
      categories: module.type === "categoryGrid"
        ? (module.content.categorySlugs ?? []).flatMap((slug) => {
            const category = categoryBySlug.get(slug);
            return category ? [category] : [];
          })
        : undefined,
      products: module.type === "limitedCollection"
        ? (module.content.productSlugs ?? []).flatMap((slug) => {
            const product = productBySlug.get(slug);
            return product ? [product] : [];
          })
        : undefined
    }));
}
