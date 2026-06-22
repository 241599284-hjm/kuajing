import { describe, expect, it } from "vitest";
import { adminPreviewUrl, createBlankCategory, createBlankProduct, normalizeProductDetail } from "./catalog-editor.js";

describe("catalog editor defaults", () => {
  it("creates a complete inactive product draft", () => {
    expect(createBlankProduct()).toMatchObject({
      sku: "",
      category: "teapot",
      region: "beijing",
      price: 0,
      status: "inactive",
      mediaAssets: []
    });
  });

  it("normalizes a product detail without losing editable fields", () => {
    expect(normalizeProductDetail({
      sku: "DT-1",
      nameZh: "茶壶",
      nameEn: "Tea Pot",
      price: 88,
      mediaAssets: undefined
    })).toMatchObject({
      sku: "DT-1",
      nameZh: "茶壶",
      nameEn: "Tea Pot",
      price: 88,
      mediaAssets: [],
      status: "inactive"
    });
  });

  it("creates a disabled category draft after the current sort order", () => {
    expect(createBlankCategory(40)).toEqual({
      slug: "",
      nameZh: "",
      nameEn: "",
      sortOrder: 50,
      status: "inactive"
    });
  });

  it("only previews media URLs reachable from the admin origin", () => {
    expect(adminPreviewUrl("/media/public/products/a.webp")).toBe("/media/public/products/a.webp");
    expect(adminPreviewUrl("https://cdn.example.com/a.webp")).toBe("https://cdn.example.com/a.webp");
    expect(adminPreviewUrl("/assets/storefront-only.jpg")).toBeNull();
  });
});
