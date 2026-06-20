import { describe, expect, it } from "vitest";
import { processPaymentWebhookTask } from "./payment-webhook-worker.js";

const task = {
  storeId: "00000000-0000-4000-8000-000000000001",
  provider: "paypal",
  eventId: "WH-EVENT-1",
  providerPaymentId: "PAYPAL-ORDER-1",
  orderId: "00000000-0000-4000-8000-000000009001",
  eventType: "PAYMENT.CAPTURE.COMPLETED",
  payload: {
    eventId: "WH-EVENT-1",
    eventType: "PAYMENT.CAPTURE.COMPLETED",
    providerPaymentId: "PAYPAL-ORDER-1",
    providerCaptureId: "CAPTURE-1",
    orderId: "00000000-0000-4000-8000-000000009001",
    status: "paid",
    amount: { amountMinor: 9600, currency: "USD" }
  },
  attemptCount: 1,
  maxAttempts: 8,
  correlationId: "paypal-worker-test"
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("processPaymentWebhookTask", () => {
  it("checks local amount and currency before confirming the order", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const paidTransactions: unknown[] = [];
    const responses = [
      jsonResponse({ orderId: task.orderId, totalMinor: 9600, currency: "USD", status: "pending_payment" }),
      jsonResponse({ orderId: task.orderId, status: "paid", paymentStatus: "paid", inventoryStatus: "confirmed" }, 201)
    ];

    await processPaymentWebhookTask(task, {
      orderServiceUrl: "http://order-service:4105",
      fetchFn: async (url, init) => {
        requests.push({ url: String(url), init });
        return responses.shift() ?? jsonResponse({}, 500);
      },
      markTransactionPaid: async (input) => { paidTransactions.push(input); }
    });

    expect(requests.map((request) => request.url)).toEqual([
      `http://order-service:4105/orders/${task.orderId}`,
      "http://order-service:4105/payments/confirm"
    ]);
    expect(new Headers(requests[1]?.init?.headers).get("idempotency-key")).toBe("paypal-webhook:WH-EVENT-1");
    expect(paidTransactions).toEqual([{
      storeId: task.storeId,
      orderId: task.orderId,
      provider: task.provider,
      providerPaymentId: task.providerPaymentId,
      providerCaptureId: "CAPTURE-1",
      eventId: task.eventId,
      amountMinor: 9600,
      currency: "USD"
    }]);
  });

  it.each([
    ["PAYMENT.CAPTURE.REFUNDED", "refund_completed", "completed"],
    ["PAYMENT.REFUND.PENDING", "refund_pending", "pending"],
    ["PAYMENT.REFUND.FAILED", "refund_failed", "failed"]
  ] as const)("reconciles %s without calling the order service", async (eventType, status, expectedStatus) => {
    const reconciled: unknown[] = [];
    await processPaymentWebhookTask({
      ...task,
      eventId: `WH-${expectedStatus}`,
      eventType,
      orderId: null,
      providerPaymentId: "REFUND-1",
      payload: {
        eventId: `WH-${expectedStatus}`,
        eventType,
        providerPaymentId: "REFUND-1",
        providerRefundId: "REFUND-1",
        status,
        amount: { amountMinor: 3200, currency: "USD" }
      }
    }, {
      orderServiceUrl: "http://order-service:4105",
      fetchFn: async () => { throw new Error("refund webhook must not call order service"); },
      markTransactionPaid: async () => { throw new Error("refund webhook must not mark a payment paid"); },
      reconcileRefund: async (input) => { reconciled.push(input); }
    });

    expect(reconciled).toEqual([{
      storeId: task.storeId,
      providerRefundId: "REFUND-1",
      status: expectedStatus,
      amountMinor: 3200,
      currency: "USD",
      eventId: `WH-${expectedStatus}`
    }]);
  });

  it("rejects a signed event whose amount differs from the local order", async () => {
    let requestCount = 0;
    await expect(processPaymentWebhookTask(task, {
      orderServiceUrl: "http://order-service:4105",
      markTransactionPaid: async () => { throw new Error("must not mark mismatched payment paid"); },
      fetchFn: async () => {
        requestCount += 1;
        return jsonResponse({ orderId: task.orderId, totalMinor: 9700, currency: "USD", status: "pending_payment" });
      }
    })).rejects.toThrow("amount or currency does not match");
    expect(requestCount).toBe(1);
  });

  it("rejects a PayPal capture event without a capture ID", async () => {
    await expect(processPaymentWebhookTask({
      ...task,
      payload: { ...task.payload, providerCaptureId: undefined }
    }, {
      orderServiceUrl: "http://order-service:4105",
      markTransactionPaid: async () => { throw new Error("must not mark incomplete PayPal capture paid"); },
      fetchFn: async () => jsonResponse({})
    })).rejects.toThrow("capture ID is missing");
  });
});
