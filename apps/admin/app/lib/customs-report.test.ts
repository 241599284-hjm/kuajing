import { describe, expect, it } from "vitest";
import { customsReportCsv } from "./customs-report.js";

describe("customs report CSV", () => {
  it("formats money and escapes declaration text", () => {
    const csv = customsReportCsv({
      orderId: "order-1",
      orderNumber: "ORD-1001",
      currency: "USD",
      totalWeightGrams: 1500,
      totalDeclaredValueMinor: 9600,
      destination: {
        country: "US",
        province: "CA",
        city: "Los Angeles",
        postalCode: "90001",
        street: "1 Tea St"
      },
      rows: [{
        skuCode: "TEA-001",
        productTitle: "Tea Set",
        description: "Porcelain set, \"white\"",
        hsCode: "691110",
        material: "Porcelain",
        originCountry: "CN",
        quantity: 1,
        unitWeightGrams: 1500,
        totalWeightGrams: 1500,
        unitDeclaredValueMinor: 9600,
        totalDeclaredValueMinor: 9600,
        currency: "USD"
      }]
    });

    expect(csv).toContain("\"Porcelain set, \"\"white\"\"\"");
    expect(csv).toContain("96.00");
  });
});
