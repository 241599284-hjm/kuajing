import { describe, expect, it } from "vitest";
import { createDefaultHomepageLayout } from "@commerce/contracts";
import { resolveHomepageModules } from "./homepage-layout.js";
import { productCategories, products } from "./storefront-content.js";

describe("resolveHomepageModules", () => {
  it("resolves configured category and product slugs from the live catalog snapshot", () => {
    const layout = createDefaultHomepageLayout();
    const modules = resolveHomepageModules(layout, products, productCategories);
    const categories = modules.find((module) => module.type === "categoryGrid");
    const collection = modules.find((module) => module.type === "limitedCollection");

    expect(categories?.type === "categoryGrid" ? (categories.categories?.length ?? 0) : 0).toBeGreaterThan(0);
    expect(collection?.type === "limitedCollection" ? (collection.products?.length ?? 0) : 0).toBeGreaterThan(0);
  });

  it("omits disabled modules and missing catalog references", () => {
    const layout = createDefaultHomepageLayout();
    const modules = resolveHomepageModules({
      ...layout,
      modules: layout.modules.map((module) => module.type === "newsletter"
        ? { ...module, enabled: false }
        : module.type === "limitedCollection"
          ? { ...module, content: { ...module.content, productSlugs: ["missing-product"] } }
          : module)
    }, products, productCategories);

    expect(modules.some((module) => module.type === "newsletter")).toBe(false);
    expect(modules.find((module) => module.type === "limitedCollection"))
      .toMatchObject({ type: "limitedCollection", products: [] });
  });
});
