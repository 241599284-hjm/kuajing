import { describe, expect, it } from "vitest";
import { buildCustomsReport } from "./customs-report.js";

describe("order customs report", () => {
  it("builds declaration rows from immutable order snapshots", () => {
    const report = buildCustomsReport({
      orderId: "order-1",
      orderNumber: "ORD-1001",
      currency: "USD",
      shippingAddress: {
        country: "US",
        province: "CA",
        city: "Los Angeles",
        postalCode: "90001",
        street: "1 Tea St"
      },
      lines: [{
        skuCode: "TEA-001",
        title: "White Porcelain Tea Set",
        hsCode: "691110",
        material: "Porcelain ceramic",
        customsDeclaration: "Porcelain teaware set for household tea brewing",
        originCountry: "CN",
        weightGrams: 1500,
        quantity: 2,
        unitPriceMinor: 9600
      }]
    });

    expect(report.totalWeightGrams).toBe(3000);
    expect(report.totalDeclaredValueMinor).toBe(19200);
    expect(report.rows[0]).toEqual(expect.objectContaining({
      description: "Porcelain teaware set for household tea brewing",
      hsCode: "691110",
      originCountry: "CN",
      totalWeightGrams: 3000,
      totalDeclaredValueMinor: 19200
    }));
  });

  it("rejects incomplete historical customs snapshots", () => {
    expect(() => buildCustomsReport({
      orderId: "order-2",
      orderNumber: "ORD-OLD",
      currency: "USD",
      shippingAddress: {
        country: "US",
        province: "CA",
        city: "Los Angeles",
        postalCode: "90001",
        street: "1 Tea St"
      },
      lines: [{
        skuCode: "OLD-001",
        title: "Old item",
        hsCode: "",
        material: "",
        customsDeclaration: "",
        originCountry: "",
        weightGrams: 0,
        quantity: 1,
        unitPriceMinor: 1000
      }]
    })).toThrow("incomplete");
  });
});
