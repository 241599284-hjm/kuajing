import type { PaymentIntentRequest, PaymentIntentResult, PaymentWebhookResult, ProviderCapability, ProviderHealth } from "@commerce/provider-contracts";
import type { StoreContext } from "@commerce/store-context";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type PayPalProviderConfig = {
  clientId: string;
  clientSecret: string;
  webhookId?: string;
  baseUrl: string;
  timeoutMs?: number;
  fetchFn?: FetchLike;
};

type PayPalErrorBody = {
  error?: string;
  error_description?: string;
  name?: string;
  message?: string;
};

type PayPalOrderBody = {
  id?: string;
  status?: string;
  links?: Array<{ rel?: string; href?: string }>;
};

type PayPalRefundBody = {
  id?: string;
  status?: string;
};

type PayPalWebhookEvent = {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    custom_id?: string;
    amount?: { value?: string; currency_code?: string };
    supplementary_data?: { related_ids?: { order_id?: string } };
  };
};

export class PayPalProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
    public readonly retryable = false
  ) {
    super(message);
    this.name = "PayPalProviderError";
  }
}

function trimBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function formatMinorUnits(amountMinor: number) {
  if (!Number.isInteger(amountMinor) || amountMinor < 0) {
    throw new PayPalProviderError("PAYPAL_INVALID_AMOUNT", "PayPal amount must be a non-negative integer", undefined, false);
  }

  return `${Math.trunc(amountMinor / 100)}.${String(amountMinor % 100).padStart(2, "0")}`;
}

function providerMessage(body: PayPalErrorBody, fallback: string) {
  const code = body.name ?? body.error;
  const message = body.message ?? body.error_description;
  return [code, message].filter(Boolean).join(": ") || fallback;
}

function headerValue(headers: Record<string, string | string[] | undefined>, name: string) {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  const value = entry?.[1];
  return Array.isArray(value) ? value[0]?.trim() : value?.trim();
}

function parsePayPalAmount(value: string | undefined, currency: string | undefined) {
  const normalizedCurrency = currency?.trim().toUpperCase();
  if (!value || !/^\d+\.\d{2}$/.test(value) || !normalizedCurrency || !/^[A-Z]{3}$/.test(normalizedCurrency)) {
    throw new PayPalProviderError("PAYPAL_WEBHOOK_INVALID", "PayPal webhook amount is invalid", undefined, false);
  }
  const [major, minor] = value.split(".");
  const amountMinor = Number(major) * 100 + Number(minor);
  if (!Number.isSafeInteger(amountMinor)) {
    throw new PayPalProviderError("PAYPAL_WEBHOOK_INVALID", "PayPal webhook amount is outside the supported range", undefined, false);
  }
  return { amountMinor, currency: normalizedCurrency };
}

export class PayPalProvider {
  readonly name = "paypal";
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: FetchLike;

  constructor(private readonly config: PayPalProviderConfig) {
    this.baseUrl = trimBaseUrl(config.baseUrl);
    this.timeoutMs = config.timeoutMs ?? 5000;
    this.fetchFn = config.fetchFn ?? fetch;

    if (!config.clientId.trim() || !config.clientSecret.trim() || !this.baseUrl) {
      throw new PayPalProviderError("PAYPAL_CONFIG_MISSING", "PayPal credentials and base URL are required", undefined, false);
    }

    let baseUrl: URL;
    try {
      baseUrl = new URL(this.baseUrl);
    } catch {
      throw new PayPalProviderError("PAYPAL_CONFIG_INVALID", "PayPal base URL must be a valid HTTPS URL", undefined, false);
    }
    if (baseUrl.protocol !== "https:" || baseUrl.pathname !== "/" || baseUrl.search || baseUrl.hash) {
      throw new PayPalProviderError("PAYPAL_CONFIG_INVALID", "PayPal base URL must be an HTTPS origin", undefined, false);
    }
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 100 || this.timeoutMs > 30000) {
      throw new PayPalProviderError("PAYPAL_CONFIG_INVALID", "PayPal timeout must be an integer between 100 and 30000 ms", undefined, false);
    }
  }

  async healthCheck(_store: StoreContext): Promise<ProviderHealth> {
    await this.accessToken();
    return { status: "healthy", checkedAt: new Date().toISOString() };
  }

  async supports(_store: StoreContext): Promise<ProviderCapability> {
    return {
      countries: ["US", "DE", "GB", "HK"],
      currencies: ["USD", "EUR", "GBP", "HKD"],
      methods: ["paypal"]
    };
  }

  async createPayment(request: PaymentIntentRequest): Promise<PaymentIntentResult> {
    const currency = request.amount.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new PayPalProviderError("PAYPAL_INVALID_CURRENCY", "PayPal currency must be a three-letter code", undefined, false);
    }

    const accessToken = await this.accessToken();
    const response = await this.request(`${this.baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        "paypal-request-id": request.idempotencyKey,
        prefer: "return=representation"
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          custom_id: request.orderId,
          amount: {
            currency_code: currency,
            value: formatMinorUnits(request.amount.amountMinor)
          }
        }],
        payment_source: {
          paypal: {
            experience_context: {
              return_url: request.returnUrl,
              cancel_url: request.returnUrl,
              user_action: "PAY_NOW"
            }
          }
        }
      })
    });
    const body = await response.json().catch(() => ({})) as PayPalOrderBody & PayPalErrorBody;

    if (!response.ok) {
      throw new PayPalProviderError(
        "PAYPAL_API_ERROR",
        providerMessage(body, "PayPal create order failed"),
        response.status,
        response.status === 429 || response.status >= 500
      );
    }

    const redirectUrl = body.links?.find((link) => link.rel === "payer-action" || link.rel === "approve")?.href;
    if (!body.id || !redirectUrl) {
      throw new PayPalProviderError(
        "PAYPAL_INVALID_RESPONSE",
        "PayPal create order response is missing an order ID or approval link",
        response.status,
        true
      );
    }

    return {
      provider: this.name,
      providerPaymentId: body.id,
      status: "requires_action",
      redirectUrl
    };
  }

  async refundPayment(request: Parameters<import("@commerce/provider-contracts").IPaymentProvider["refundPayment"]>[0]) {
    const paymentId = request.paymentId.trim();
    const currency = request.amount.currency.trim().toUpperCase();
    if (!paymentId) {
      throw new PayPalProviderError("PAYPAL_INVALID_CAPTURE_ID", "PayPal capture ID is required", undefined, false);
    }
    if (!Number.isInteger(request.amount.amountMinor) || request.amount.amountMinor <= 0) {
      throw new PayPalProviderError("PAYPAL_INVALID_AMOUNT", "PayPal refund amount must be a positive integer", undefined, false);
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new PayPalProviderError("PAYPAL_INVALID_CURRENCY", "PayPal currency must be a three-letter code", undefined, false);
    }

    const accessToken = await this.accessToken();
    const response = await this.request(
      `${this.baseUrl}/v2/payments/captures/${encodeURIComponent(paymentId)}/refund`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          "paypal-request-id": request.idempotencyKey,
          prefer: "return=representation"
        },
        body: JSON.stringify({
          amount: {
            value: formatMinorUnits(request.amount.amountMinor),
            currency_code: currency
          }
        })
      }
    );
    const body = await response.json().catch(() => ({})) as PayPalRefundBody & PayPalErrorBody;
    if (!response.ok) {
      throw new PayPalProviderError(
        "PAYPAL_REFUND_ERROR",
        providerMessage(body, "PayPal refund failed"),
        response.status,
        response.status === 429 || response.status >= 500
      );
    }
    if (!body.id || (body.status !== "COMPLETED" && body.status !== "PENDING")) {
      throw new PayPalProviderError("PAYPAL_INVALID_RESPONSE", "PayPal refund response is invalid", response.status, true);
    }
    return {
      providerRefundId: body.id,
      status: body.status === "COMPLETED" ? "completed" as const : "pending" as const
    };
  }

  async verifyWebhook(request: {
    store: StoreContext;
    headers: Record<string, string | string[] | undefined>;
    rawBody: string;
  }): Promise<PaymentWebhookResult> {
    const webhookId = this.config.webhookId?.trim();
    if (!webhookId) {
      throw new PayPalProviderError("PAYPAL_CONFIG_MISSING", "PayPal webhook ID is required", undefined, false);
    }
    const authAlgo = headerValue(request.headers, "paypal-auth-algo");
    const certUrl = headerValue(request.headers, "paypal-cert-url");
    const transmissionId = headerValue(request.headers, "paypal-transmission-id");
    const transmissionSig = headerValue(request.headers, "paypal-transmission-sig");
    const transmissionTime = headerValue(request.headers, "paypal-transmission-time");
    if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
      throw new PayPalProviderError("PAYPAL_WEBHOOK_HEADERS_MISSING", "Required PayPal webhook headers are missing", undefined, false);
    }

    let event: PayPalWebhookEvent;
    try {
      event = JSON.parse(request.rawBody) as PayPalWebhookEvent;
    } catch {
      throw new PayPalProviderError("PAYPAL_WEBHOOK_INVALID", "PayPal webhook body is not valid JSON", undefined, false);
    }

    const accessToken = await this.accessToken();
    const response = await this.request(`${this.baseUrl}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: webhookId,
        webhook_event: event
      })
    });
    const verification = await response.json().catch(() => ({})) as PayPalErrorBody & { verification_status?: string };
    if (!response.ok) {
      throw new PayPalProviderError(
        "PAYPAL_WEBHOOK_VERIFY_ERROR",
        providerMessage(verification, "PayPal webhook verification failed"),
        response.status,
        response.status === 429 || response.status >= 500
      );
    }
    if (verification.verification_status !== "SUCCESS") {
      throw new PayPalProviderError("PAYPAL_WEBHOOK_INVALID", "PayPal webhook signature is invalid", response.status, false);
    }

    const eventId = event.id?.trim();
    if (!eventId) {
      throw new PayPalProviderError("PAYPAL_WEBHOOK_INVALID", "PayPal webhook event ID is missing", undefined, false);
    }
    if (["PAYMENT.CAPTURE.REFUNDED", "PAYMENT.REFUND.PENDING", "PAYMENT.REFUND.FAILED"].includes(event.event_type ?? "")) {
      const providerRefundId = event.resource?.id?.trim();
      if (!providerRefundId) {
        throw new PayPalProviderError("PAYPAL_WEBHOOK_INVALID", "PayPal refund ID is missing", undefined, false);
      }
      return {
        eventId,
        eventType: event.event_type as "PAYMENT.CAPTURE.REFUNDED" | "PAYMENT.REFUND.PENDING" | "PAYMENT.REFUND.FAILED",
        providerPaymentId: providerRefundId,
        providerRefundId,
        status: event.event_type === "PAYMENT.CAPTURE.REFUNDED"
          ? "refund_completed"
          : event.event_type === "PAYMENT.REFUND.PENDING" ? "refund_pending" : "refund_failed",
        amount: parsePayPalAmount(event.resource?.amount?.value, event.resource?.amount?.currency_code)
      };
    }
    if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") {
      throw new PayPalProviderError("PAYPAL_WEBHOOK_EVENT_UNSUPPORTED", "PayPal webhook event is not supported", undefined, false);
    }
    const orderId = event.resource?.custom_id?.trim();
    const providerPaymentId = event.resource?.supplementary_data?.related_ids?.order_id?.trim();
    const providerCaptureId = event.resource?.id?.trim();
    if (!eventId || !orderId || !providerPaymentId || !providerCaptureId) {
      throw new PayPalProviderError("PAYPAL_WEBHOOK_INVALID", "PayPal webhook identifiers are missing", undefined, false);
    }

    return {
      eventId,
      eventType: "PAYMENT.CAPTURE.COMPLETED" as const,
      providerPaymentId,
      providerCaptureId,
      orderId,
      status: "paid",
      amount: parsePayPalAmount(event.resource?.amount?.value, event.resource?.amount?.currency_code)
    };
  }

  private async accessToken() {
    const authorization = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64");
    const response = await this.request(`${this.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${authorization}`,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials"
    });
    const body = await response.json().catch(() => ({})) as PayPalErrorBody & { access_token?: string };

    if (!response.ok || !body.access_token) {
      throw new PayPalProviderError(
        "PAYPAL_AUTH_FAILED",
        providerMessage(body, "PayPal authentication failed"),
        response.status,
        response.status === 429 || response.status >= 500
      );
    }

    return body.access_token;
  }

  private async request(url: string, init: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await this.fetchFn(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof PayPalProviderError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new PayPalProviderError("PAYPAL_TIMEOUT", "PayPal request timed out", undefined, true);
      }
      throw new PayPalProviderError("PAYPAL_NETWORK_ERROR", "PayPal request failed", undefined, true);
    } finally {
      clearTimeout(timeout);
    }
  }
}
