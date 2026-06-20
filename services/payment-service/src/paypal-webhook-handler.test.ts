import { describe, expect, it } from "vitest";
import { acceptPayPalWebhook } from "./paypal-webhook-handler.js";

describe("acceptPayPalWebhook", () => {
  it("preserves the raw body for verification and enqueues only the verified event", async () => {
    const calls: unknown[] = [];
    const provider = {
      verifyWebhook: async (input: unknown) => {
        calls.push(input);
        return {
          eventId: "WH-EVENT-1",
          eventType: "PAYMENT.CAPTURE.COMPLETED" as const,
          providerPaymentId: "PAYPAL-ORDER-1",
          providerCaptureId: "CAPTURE-1",
          orderId: "00000000-0000-4000-8000-000000009001",
          status: "paid" as const,
          amount: { amountMinor: 9600, currency: "USD" }
        };
      }
    };
    const inbox = {
      claim: async (input: unknown) => {
        calls.push(input);
        return { decision: "claim_new" as const, status: "processing" as const, attemptCount: 1 };
      }
    };
    const rawBody = Buffer.from('{"id":"WH-EVENT-1", "spacing":"preserved"}', "utf8");

    const result = await acceptPayPalWebhook({
      provider,
      inbox,
      store: {
        storeId: "00000000-0000-4000-8000-000000000001",
        region: "local",
        timezone: "Asia/Hong_Kong",
        correlationId: "paypal-webhook-test"
      },
      headers: { "paypal-transmission-id": "TRANSMISSION-1" },
      rawBody
    });

    expect(calls[0]).toMatchObject({ rawBody: rawBody.toString("utf8") });
    expect(calls[1]).toMatchObject({
      eventId: "WH-EVENT-1",
      eventType: "PAYMENT.CAPTURE.COMPLETED",
      correlationId: "paypal-webhook-test",
      payload: {
        eventId: "WH-EVENT-1",
        amount: { amountMinor: 9600, currency: "USD" }
      }
    });
    expect(result).toEqual({ accepted: true, eventId: "WH-EVENT-1", decision: "claim_new" });
  });

  it("enqueues a verified refund event without requiring an order ID", async () => {
    const claims: unknown[] = [];
    const provider = {
      verifyWebhook: async () => ({
        eventId: "WH-REFUND-1",
        eventType: "PAYMENT.CAPTURE.REFUNDED" as const,
        providerPaymentId: "REFUND-1",
        providerRefundId: "REFUND-1",
        status: "refund_completed" as const,
        amount: { amountMinor: 3200, currency: "USD" }
      })
    };
    const inbox = {
      claim: async (input: unknown) => {
        claims.push(input);
        return { decision: "claim_new" as const, status: "processing" as const, attemptCount: 1 };
      }
    };

    await acceptPayPalWebhook({
      provider,
      inbox,
      store: {
        storeId: "00000000-0000-4000-8000-000000000001",
        region: "local",
        timezone: "Asia/Hong_Kong",
        correlationId: "paypal-refund-webhook-test"
      },
      headers: { "paypal-transmission-id": "TRANSMISSION-2" },
      rawBody: Buffer.from('{"id":"WH-REFUND-1"}', "utf8")
    });

    expect(claims[0]).toMatchObject({
      eventId: "WH-REFUND-1",
      eventType: "PAYMENT.CAPTURE.REFUNDED",
      orderId: undefined,
      providerPaymentId: "REFUND-1"
    });
  });

  it("rejects a request when the raw body is unavailable", async () => {
    await expect(acceptPayPalWebhook({
      provider: { verifyWebhook: async () => { throw new Error("must not run"); } },
      inbox: { claim: async () => { throw new Error("must not run"); } },
      store: {
        storeId: "00000000-0000-4000-8000-000000000001",
        region: "local",
        timezone: "Asia/Hong_Kong",
        correlationId: "paypal-webhook-test"
      },
      headers: {},
      rawBody: undefined
    })).rejects.toMatchObject({ code: "PAYPAL_WEBHOOK_RAW_BODY_MISSING" });
  });
});
