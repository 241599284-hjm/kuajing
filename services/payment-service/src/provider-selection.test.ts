import { describe, expect, it } from "vitest";
import { normalizePaymentProviderName } from "./provider-selection.js";

describe("normalizePaymentProviderName", () => {
  it("keeps local deployments on mock unless PayPal is explicitly selected", () => {
    expect(normalizePaymentProviderName(undefined)).toBe("mock");
    expect(normalizePaymentProviderName(" mock ")).toBe("mock");
    expect(normalizePaymentProviderName("PAYPAL")).toBe("paypal");
  });

  it("rejects unsupported payment providers", () => {
    expect(() => normalizePaymentProviderName("stripe")).toThrow("Unsupported payment provider: stripe");
  });
});
