import { describe, expect, it } from "vitest";
import { trustedCheckoutLine } from "./trusted-checkout.js";

const product = {
  slug: "white-porcelain-tea-set",
  status: "active",
  skuId: "00000000-0000-4000-8000-000000002001",
  skuCode: "TEA-PORCELAIN-SET-001",
  originCountry: "CN",
  price: { amountMinor: 9600, currency: "USD" },
  copy: {
    en: {
      name: "White Porcelain Tea Set",
      details: {
        material: "Porcelain ceramic",
        hsCode: "691110",
        customsDeclaration: "Porcelain teaware set for household tea brewing",
        weightGrams: 1500
      }
    }
  }
};

describe("trusted checkout catalog boundary", () => {
  it("ignores browser-owned price and product metadata", () => {
    expect(trustedCheckoutLine({
      slug: product.slug,
      quantity: 2,
      skuId: "attacker-sku",
      skuCode: "FREE",
      title: "Free product",
      unitPriceMinor: 1,
      currency: "CNY"
    }, product)).toEqual({
      slug: product.slug,
      skuId: product.skuId,
      skuCode: product.skuCode,
      title: "White Porcelain Tea Set",
      hsCode: "691110",
      material: "Porcelain ceramic",
      customsDeclaration: "Porcelain teaware set for household tea brewing",
      originCountry: "CN",
      weightGrams: 1500,
      quantity: 2,
      unitPriceMinor: 9600,
      currency: "USD"
    });
  });

  it("rejects products that are not active or lack customs metadata", () => {
    expect(() => trustedCheckoutLine({ slug: product.slug, quantity: 1 }, { ...product, status: "draft" }))
      .toThrow("not available");
    expect(() => trustedCheckoutLine({
      slug: product.slug,
      quantity: 1
    }, {
      ...product,
      copy: { en: { ...product.copy.en, details: { ...product.copy.en.details, hsCode: "" } } }
    })).toThrow("customs");
  });
});
