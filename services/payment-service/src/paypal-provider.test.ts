import { describe, expect, it } from "vitest";
import { PayPalProvider, PayPalProviderError } from "./paypal-provider.js";

const store = {
  storeId: "00000000-0000-4000-8000-000000000001",
  region: "local",
  timezone: "Asia/Hong_Kong",
  correlationId: "paypal-provider-test"
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("PayPalProvider", () => {
  it("rejects an insecure base URL or invalid timeout configuration", () => {
    expect(() => new PayPalProvider({
      clientId: "sandbox-client-id",
      clientSecret: "sandbox-client-secret",
      baseUrl: "http://api-m.sandbox.paypal.com"
    })).toThrowError(expect.objectContaining({ code: "PAYPAL_CONFIG_INVALID" }));

    expect(() => new PayPalProvider({
      clientId: "sandbox-client-id",
      clientSecret: "sandbox-client-secret",
      baseUrl: "https://api-m.sandbox.paypal.com",
      timeoutMs: 0
    })).toThrowError(expect.objectContaining({ code: "PAYPAL_CONFIG_INVALID" }));
  });

  it("creates a sandbox order with integer minor units and an idempotency key", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const responses = [
      jsonResponse({ access_token: "sandbox-access-token", expires_in: 32400 }),
      jsonResponse({
        id: "PAYPAL-ORDER-1",
        status: "CREATED",
        links: [{ rel: "payer-action", href: "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-ORDER-1" }]
      }, 201)
    ];
    const fetchFn = async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return responses.shift() ?? jsonResponse({}, 500);
    };
    const provider = new PayPalProvider({
      clientId: "sandbox-client-id",
      clientSecret: "sandbox-client-secret",
      baseUrl: "https://api-m.sandbox.paypal.com",
      fetchFn
    });

    const result = await provider.createPayment({
      store,
      orderId: "00000000-0000-4000-8000-000000009001",
      idempotencyKey: "checkout-key:payment",
      amount: { amountMinor: 9600, currency: "USD" },
      customerEmail: "buyer@example.com",
      returnUrl: "https://shop.example.com/payment-result"
    });

    expect(result).toEqual({
      provider: "paypal",
      providerPaymentId: "PAYPAL-ORDER-1",
      status: "requires_action",
      redirectUrl: "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-ORDER-1"
    });
    expect(requests[0]?.url).toBe("https://api-m.sandbox.paypal.com/v1/oauth2/token");
    expect(requests[0]?.init?.body).toBe("grant_type=client_credentials");
    expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe(
      `Basic ${Buffer.from("sandbox-client-id:sandbox-client-secret").toString("base64")}`
    );
    expect(requests[1]?.url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders");
    expect(new Headers(requests[1]?.init?.headers).get("paypal-request-id")).toBe("checkout-key:payment");
    expect(JSON.parse(String(requests[1]?.init?.body))).toMatchObject({
      intent: "CAPTURE",
      purchase_units: [{
        custom_id: "00000000-0000-4000-8000-000000009001",
        amount: { currency_code: "USD", value: "96.00" }
      }],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: "https://shop.example.com/payment-result",
            cancel_url: "https://shop.example.com/payment-result"
          }
        }
      }
    });
  });

  it("reports OAuth rejection without exposing credentials", async () => {
    const provider = new PayPalProvider({
      clientId: "client-id-must-not-leak",
      clientSecret: "secret-must-not-leak",
      baseUrl: "https://api-m.sandbox.paypal.com",
      fetchFn: async () => jsonResponse({ error: "invalid_client", error_description: "Client Authentication failed" }, 401)
    });

    const error = await provider.healthCheck(store).then(() => undefined, (reason: unknown) => reason);

    expect(error).toBeInstanceOf(PayPalProviderError);
    expect(error).toMatchObject({ code: "PAYPAL_AUTH_FAILED", status: 401, retryable: false });
    expect(String((error as Error).message)).not.toContain("client-id-must-not-leak");
    expect(String((error as Error).message)).not.toContain("secret-must-not-leak");
  });

  it("tests that the configured webhook exists in the selected PayPal environment", async () => {
    const requests: string[] = [];
    const responses = [
      jsonResponse({ access_token: "sandbox-access-token", expires_in: 32400 }),
      jsonResponse({ id: "WH-SANDBOX-1", url: "https://shop.example.com/webhooks/paypal" })
    ];
    const provider = new PayPalProvider({
      clientId: "sandbox-client-id",
      clientSecret: "sandbox-client-secret",
      webhookId: "WH-SANDBOX-1",
      baseUrl: "https://api-m.sandbox.paypal.com",
      fetchFn: async (url) => {
        requests.push(String(url));
        return responses.shift() ?? jsonResponse({}, 500);
      }
    });

    await expect(provider.webhookHealthCheck(store)).resolves.toMatchObject({ status: "healthy" });
    expect(requests[1]).toBe("https://api-m.sandbox.paypal.com/v1/notifications/webhooks/WH-SANDBOX-1");
  });

  it("classifies provider timeouts as retryable without creating a fake payment", async () => {
    const provider = new PayPalProvider({
      clientId: "sandbox-client-id",
      clientSecret: "sandbox-client-secret",
      baseUrl: "https://api-m.sandbox.paypal.com",
      fetchFn: async () => {
        throw new DOMException("The operation was aborted", "AbortError");
      }
    });

    const error = await provider.createPayment({
      store,
      orderId: "00000000-0000-4000-8000-000000009001",
      idempotencyKey: "checkout-key:payment",
      amount: { amountMinor: 9600, currency: "USD" },
      customerEmail: "buyer@example.com",
      returnUrl: "https://shop.example.com/payment-result"
    }).then(() => undefined, (reason: unknown) => reason);

    expect(error).toMatchObject({ code: "PAYPAL_TIMEOUT", retryable: true });
  });

  it("rejects a create-order response without an approval link", async () => {
    const responses = [
      jsonResponse({ access_token: "sandbox-access-token", expires_in: 32400 }),
      jsonResponse({ id: "PAYPAL-ORDER-1", status: "CREATED", links: [] }, 201)
    ];
    const provider = new PayPalProvider({
      clientId: "sandbox-client-id",
      clientSecret: "sandbox-client-secret",
      baseUrl: "https://api-m.sandbox.paypal.com",
      fetchFn: async () => responses.shift() ?? jsonResponse({}, 500)
    });

    const error = await provider.createPayment({
      store,
      orderId: "00000000-0000-4000-8000-000000009001",
      idempotencyKey: "checkout-key:payment",
      amount: { amountMinor: 9600, currency: "USD" },
      customerEmail: "buyer@example.com",
      returnUrl: "https://shop.example.com/payment-result"
    }).then(() => undefined, (reason: unknown) => reason);

    expect(error).toMatchObject({ code: "PAYPAL_INVALID_RESPONSE", retryable: true });
  });

  it("verifies and maps a completed capture webhook", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const responses = [
      jsonResponse({ access_token: "sandbox-access-token", expires_in: 32400 }),
      jsonResponse({ verification_status: "SUCCESS" })
    ];
    const provider = new PayPalProvider({
      clientId: "sandbox-client-id",
      clientSecret: "sandbox-client-secret",
      webhookId: "WH-SANDBOX-1",
      baseUrl: "https://api-m.sandbox.paypal.com",
      fetchFn: async (url, init) => {
        requests.push({ url: String(url), init });
        return responses.shift() ?? jsonResponse({}, 500);
      }
    });
    const rawBody = JSON.stringify({
      id: "WH-EVENT-1",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: "CAPTURE-1",
        custom_id: "00000000-0000-4000-8000-000000009001",
        amount: { value: "96.00", currency_code: "USD" },
        supplementary_data: { related_ids: { order_id: "PAYPAL-ORDER-1" } }
      }
    });

    const result = await provider.verifyWebhook({
      store,
      headers: {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://api-m.sandbox.paypal.com/certs/CERT-1",
        "paypal-transmission-id": "TRANSMISSION-1",
        "paypal-transmission-sig": "signature",
        "paypal-transmission-time": "2026-06-19T02:00:00Z"
      },
      rawBody
    });

    expect(result).toEqual({
      eventId: "WH-EVENT-1",
      eventType: "PAYMENT.CAPTURE.COMPLETED",
      providerPaymentId: "PAYPAL-ORDER-1",
      providerCaptureId: "CAPTURE-1",
      orderId: "00000000-0000-4000-8000-000000009001",
      status: "paid",
      amount: { amountMinor: 9600, currency: "USD" }
    });
    expect(requests[1]?.url).toBe("https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature");
    expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({
      auth_algo: "SHA256withRSA",
      cert_url: "https://api-m.sandbox.paypal.com/certs/CERT-1",
      transmission_id: "TRANSMISSION-1",
      transmission_sig: "signature",
      transmission_time: "2026-06-19T02:00:00Z",
      webhook_id: "WH-SANDBOX-1",
      webhook_event: JSON.parse(rawBody)
    });
  });

  it.each([
    ["PAYMENT.CAPTURE.REFUNDED", "refund_completed"],
    ["PAYMENT.REFUND.PENDING", "refund_pending"],
    ["PAYMENT.REFUND.FAILED", "refund_failed"]
  ] as const)("verifies and maps a %s webhook", async (eventType, status) => {
    const responses = [
      jsonResponse({ access_token: "sandbox-access-token", expires_in: 32400 }),
      jsonResponse({ verification_status: "SUCCESS" })
    ];
    const provider = new PayPalProvider({
      clientId: "sandbox-client-id",
      clientSecret: "sandbox-client-secret",
      webhookId: "WH-SANDBOX-1",
      baseUrl: "https://api-m.sandbox.paypal.com",
      fetchFn: async () => responses.shift() ?? jsonResponse({}, 500)
    });

    await expect(provider.verifyWebhook({
      store,
      headers: {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://api-m.sandbox.paypal.com/certs/CERT-1",
        "paypal-transmission-id": "TRANSMISSION-REFUND-1",
        "paypal-transmission-sig": "signature",
        "paypal-transmission-time": "2026-06-19T03:00:00Z"
      },
      rawBody: JSON.stringify({
        id: `WH-${status}`,
        event_type: eventType,
        resource: { id: "REFUND-1", amount: { value: "32.00", currency_code: "USD" } }
      })
    })).resolves.toEqual({
      eventId: `WH-${status}`,
      eventType,
      providerPaymentId: "REFUND-1",
      providerRefundId: "REFUND-1",
      status,
      amount: { amountMinor: 3200, currency: "USD" }
    });
  });

  it("creates an idempotent partial refund for a captured payment", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const responses = [
      jsonResponse({ access_token: "sandbox-access-token", expires_in: 32400 }),
      jsonResponse({ id: "REFUND-1", status: "COMPLETED" }, 201)
    ];
    const provider = new PayPalProvider({
      clientId: "sandbox-client-id",
      clientSecret: "sandbox-client-secret",
      baseUrl: "https://api-m.sandbox.paypal.com",
      fetchFn: async (url, init) => {
        requests.push({ url: String(url), init });
        return responses.shift() ?? jsonResponse({}, 500);
      }
    });

    await expect(provider.refundPayment({
      store,
      paymentId: "CAPTURE-1",
      amount: { amountMinor: 3200, currency: "USD" },
      idempotencyKey: "refund-key-1"
    })).resolves.toEqual({ providerRefundId: "REFUND-1", status: "completed" });

    expect(requests[1]?.url).toBe("https://api-m.sandbox.paypal.com/v2/payments/captures/CAPTURE-1/refund");
    expect(new Headers(requests[1]?.init?.headers).get("paypal-request-id")).toBe("refund-key-1");
    expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({
      amount: { value: "32.00", currency_code: "USD" }
    });
  });

  it("rejects missing webhook headers and failed signature verification", async () => {
    const providerWithoutHeaders = new PayPalProvider({
      clientId: "sandbox-client-id",
      clientSecret: "sandbox-client-secret",
      webhookId: "WH-SANDBOX-1",
      baseUrl: "https://api-m.sandbox.paypal.com",
      fetchFn: async () => jsonResponse({}, 500)
    });
    const rawBody = JSON.stringify({
      id: "WH-EVENT-1",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: { id: "CAPTURE-1", custom_id: "00000000-0000-4000-8000-000000009001" }
    });

    const missingHeaderError = await providerWithoutHeaders.verifyWebhook({ store, headers: {}, rawBody })
      .then(() => undefined, (reason: unknown) => reason);
    expect(missingHeaderError).toMatchObject({ code: "PAYPAL_WEBHOOK_HEADERS_MISSING", retryable: false });

    const responses = [
      jsonResponse({ access_token: "sandbox-access-token", expires_in: 32400 }),
      jsonResponse({ verification_status: "FAILURE" })
    ];
    const providerWithBadSignature = new PayPalProvider({
      clientId: "sandbox-client-id",
      clientSecret: "sandbox-client-secret",
      webhookId: "WH-SANDBOX-1",
      baseUrl: "https://api-m.sandbox.paypal.com",
      fetchFn: async () => responses.shift() ?? jsonResponse({}, 500)
    });
    const invalidSignatureError = await providerWithBadSignature.verifyWebhook({
      store,
      headers: {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://api-m.sandbox.paypal.com/certs/CERT-1",
        "paypal-transmission-id": "TRANSMISSION-1",
        "paypal-transmission-sig": "invalid-signature",
        "paypal-transmission-time": "2026-06-19T02:00:00Z"
      },
      rawBody
    }).then(() => undefined, (reason: unknown) => reason);
    expect(invalidSignatureError).toMatchObject({ code: "PAYPAL_WEBHOOK_INVALID", retryable: false });
  });
});
