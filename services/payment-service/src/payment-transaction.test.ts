import { describe, expect, it, vi } from "vitest";
import { createTrackedPayment } from "./payment-transaction.js";

const request = {
  store: {
    storeId: "00000000-0000-4000-8000-000000000001",
    region: "local",
    timezone: "Asia/Hong_Kong",
    correlationId: "payment-transaction-test"
  },
  orderId: "00000000-0000-4000-8000-000000009001",
  idempotencyKey: "checkout-key:payment",
  amount: { amountMinor: 9600, currency: "USD" },
  customerEmail: "buyer@example.com",
  returnUrl: "https://shop.example.com/payment-result"
};

describe("createTrackedPayment", () => {
  it("persists the provider result after payment creation", async () => {
    const result = {
      provider: "paypal",
      providerPaymentId: "PAYPAL-ORDER-1",
      status: "requires_action" as const,
      redirectUrl: "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-ORDER-1"
    };
    const provider = { createPayment: vi.fn().mockResolvedValue(result) };
    const repository = { recordCreated: vi.fn().mockResolvedValue(undefined) };

    await expect(createTrackedPayment(provider, repository, request)).resolves.toEqual(result);
    expect(repository.recordCreated).toHaveBeenCalledWith({
      storeId: request.store.storeId,
      orderId: request.orderId,
      provider: "paypal",
      providerPaymentId: "PAYPAL-ORDER-1",
      amountMinor: 9600,
      currency: "USD",
      idempotencyKey: request.idempotencyKey,
      correlationId: request.store.correlationId
    });
  });

  it("propagates persistence failure so the same provider idempotency key can be retried", async () => {
    const provider = {
      createPayment: vi.fn().mockResolvedValue({
        provider: "paypal",
        providerPaymentId: "PAYPAL-ORDER-1",
        status: "requires_action" as const
      })
    };
    const repository = { recordCreated: vi.fn().mockRejectedValue(new Error("order_db unavailable")) };

    await expect(createTrackedPayment(provider, repository, request)).rejects.toThrow("order_db unavailable");
  });
});
