import { describe, expect, it, vi } from "vitest";
import { buildPaymentRefundSummary, decideProviderRefundTransition, processPaymentRefund } from "./payment-refund.js";

const input = {
  store: {
    storeId: "00000000-0000-4000-8000-000000000001",
    region: "local",
    timezone: "Asia/Hong_Kong",
    correlationId: "refund-test"
  },
  orderId: "00000000-0000-4000-8000-000000009001",
  amountMinor: 3200,
  currency: "USD",
  idempotencyKey: "refund-key-1",
  actorId: "admin-1",
  reason: "Customer approved partial refund"
};

const claim = {
  decision: "claim_new" as const,
  refundId: "00000000-0000-4000-8000-000000008001",
  provider: "paypal",
  providerCaptureId: "CAPTURE-1"
};

describe("processPaymentRefund", () => {
  it("claims refundable amount before calling the provider and completes the record", async () => {
    const repository = {
      claim: vi.fn().mockResolvedValue(claim),
      recordProviderResult: vi.fn().mockResolvedValue(undefined)
    };
    const provider = {
      name: "paypal",
      refundPayment: vi.fn().mockResolvedValue({ providerRefundId: "REFUND-1", status: "completed" as const })
    };

    await expect(processPaymentRefund(input, { repository, provider })).resolves.toEqual({
      refundId: claim.refundId,
      providerRefundId: "REFUND-1",
      status: "completed"
    });
    expect(provider.refundPayment).toHaveBeenCalledWith({
      store: input.store,
      paymentId: "CAPTURE-1",
      amount: { amountMinor: 3200, currency: "USD" },
      idempotencyKey: input.idempotencyKey
    });
    expect(repository.recordProviderResult).toHaveBeenCalledWith({
      refundId: claim.refundId,
      providerRefundId: "REFUND-1",
      status: "completed"
    });
  });

  it("returns a completed replay without calling the provider", async () => {
    const repository = {
      claim: vi.fn().mockResolvedValue({
        decision: "completed",
        refundId: claim.refundId,
        provider: "paypal",
        providerCaptureId: "CAPTURE-1",
        providerRefundId: "REFUND-1",
        status: "completed"
      }),
      recordProviderResult: vi.fn()
    };
    const provider = { name: "paypal", refundPayment: vi.fn() };

    await expect(processPaymentRefund(input, { repository, provider })).resolves.toEqual({
      refundId: claim.refundId,
      providerRefundId: "REFUND-1",
      status: "completed"
    });
    expect(provider.refundPayment).not.toHaveBeenCalled();
  });

  it("keeps the claimed refund resumable when the provider call is uncertain", async () => {
    const repository = {
      claim: vi.fn().mockResolvedValue(claim),
      recordProviderResult: vi.fn()
    };
    const provider = { name: "paypal", refundPayment: vi.fn().mockRejectedValue(new Error("provider timeout")) };

    await expect(processPaymentRefund(input, { repository, provider })).rejects.toThrow("provider timeout");
    expect(repository.recordProviderResult).not.toHaveBeenCalled();
  });
});

describe("buildPaymentRefundSummary", () => {
  it("separates completed refunds from amounts reserved by pending refunds", () => {
    const summary = buildPaymentRefundSummary(
      {
        id: "transaction-1",
        order_id: input.orderId,
        provider: "paypal",
        amount_minor: "9600",
        currency: "USD",
        status: "partially_refunded"
      },
      [
        {
          id: "refund-2",
          provider_refund_id: "REFUND-2",
          amount_minor: "1600",
          currency: "USD",
          status: "pending",
          reason: "Pending provider settlement",
          actor_id: "admin-2",
          correlation_id: "correlation-2",
          created_at: new Date("2026-06-19T02:00:00.000Z"),
          completed_at: null
        },
        {
          id: "refund-1",
          provider_refund_id: "REFUND-1",
          amount_minor: "3200",
          currency: "USD",
          status: "completed",
          reason: "Approved partial refund",
          actor_id: "admin-1",
          correlation_id: "correlation-1",
          created_at: new Date("2026-06-19T01:00:00.000Z"),
          completed_at: new Date("2026-06-19T01:01:00.000Z")
        }
      ]
    );

    expect(summary).toMatchObject({
      orderId: input.orderId,
      paymentStatus: "partially_refunded",
      amountMinor: 9600,
      refundedMinor: 3200,
      reservedRefundMinor: 4800,
      refundableMinor: 4800
    });
    expect(summary.refunds).toHaveLength(2);
    expect(summary.refunds[0]).toMatchObject({ refundId: "refund-2", status: "pending", amountMinor: 1600 });
  });

  it("never exposes a negative refundable amount", () => {
    const summary = buildPaymentRefundSummary(
      {
        id: "transaction-1",
        order_id: input.orderId,
        provider: "paypal",
        amount_minor: "1000",
        currency: "USD",
        status: "refunded"
      },
      [
        {
          id: "refund-1",
          provider_refund_id: "REFUND-1",
          amount_minor: "1200",
          currency: "USD",
          status: "completed",
          reason: "Legacy correction",
          actor_id: "admin-1",
          correlation_id: "correlation-1",
          created_at: new Date("2026-06-19T01:00:00.000Z"),
          completed_at: new Date("2026-06-19T01:01:00.000Z")
        }
      ]
    );

    expect(summary.refundableMinor).toBe(0);
  });
});

describe("decideProviderRefundTransition", () => {
  it.each([
    ["processing", "completed", "apply"],
    ["processing", "pending", "apply"],
    ["pending", "pending", "replay"],
    ["pending", "failed", "apply"],
    ["completed", "completed", "replay"],
    ["failed", "failed", "replay"],
    ["completed", "failed", "conflict"],
    ["failed", "completed", "conflict"]
  ] as const)("maps %s -> %s to %s", (current, incoming, expected) => {
    expect(decideProviderRefundTransition(current, incoming)).toBe(expected);
  });
});
