import { describe, expect, it } from "vitest";
import { assertCheckoutReplay, checkoutFingerprint } from "./checkout-idempotency.js";

const checkout = {
  customerEmail: "buyer@example.com",
  paymentMethod: "mock",
  shippingAddress: { country: "US", province: "CA", city: "LA", postalCode: "90001", street: "1 Tea St" },
  lines: [{ skuId: "sku-1", quantity: 1, unitPriceMinor: 1299, currency: "USD" }],
  currency: "USD"
};

describe("checkout idempotency", () => {
  it("produces the same fingerprint for an exact replay", () => {
    expect(checkoutFingerprint({ ...checkout })).toBe(checkoutFingerprint(checkout));
  });

  it.each([
    { ...checkout, customerEmail: "other@example.com" },
    { ...checkout, shippingAddress: { ...checkout.shippingAddress, city: "Seattle" } },
    { ...checkout, lines: [{ ...checkout.lines[0], quantity: 2 }] }
  ])("rejects a changed checkout with IDEMPOTENCY_CONFLICT", (incoming) => {
    expect(() => assertCheckoutReplay(
      "checkout-1",
      checkoutFingerprint(checkout),
      checkoutFingerprint(incoming)
    )).toThrowError(expect.objectContaining({
      status: 409,
      response: expect.objectContaining({ code: "IDEMPOTENCY_CONFLICT" })
    }));
  });

  it("allows legacy orders without a stored fingerprint", () => {
    expect(() => assertCheckoutReplay("legacy", null, checkoutFingerprint(checkout))).not.toThrow();
  });
});
