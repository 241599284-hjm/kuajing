import type { Money } from "@commerce/money";
import type { StoreContext } from "@commerce/store-context";

export type ProviderHealth = {
  status: "healthy" | "degraded" | "unavailable";
  checkedAt: string;
  message?: string;
};

export type ProviderCapability = {
  countries: string[];
  currencies: string[];
  methods: string[];
};

export type PaymentIntentRequest = {
  store: StoreContext;
  orderId: string;
  idempotencyKey: string;
  amount: Money;
  customerEmail: string;
  returnUrl: string;
};

export type PaymentIntentResult = {
  provider: string;
  providerPaymentId: string;
  redirectUrl?: string;
  clientSecret?: string;
  status: "created" | "requires_action" | "failed";
};

export type PaymentCaptureWebhookResult = {
  eventId: string;
  eventType: "PAYMENT.CAPTURE.COMPLETED";
  providerPaymentId: string;
  providerCaptureId: string;
  orderId: string;
  status: "paid";
  amount: Money;
};

export type PaymentRefundWebhookResult = {
  eventId: string;
  eventType: "PAYMENT.CAPTURE.REFUNDED" | "PAYMENT.REFUND.PENDING" | "PAYMENT.REFUND.FAILED";
  providerPaymentId: string;
  providerRefundId: string;
  status: "refund_completed" | "refund_pending" | "refund_failed";
  amount: Money;
};

export type PaymentWebhookResult = PaymentCaptureWebhookResult | PaymentRefundWebhookResult;

export interface IPaymentProvider {
  name: string;
  healthCheck(store: StoreContext): Promise<ProviderHealth>;
  supports(store: StoreContext): Promise<ProviderCapability>;
  createPayment(request: PaymentIntentRequest): Promise<PaymentIntentResult>;
  refundPayment(request: {
    store: StoreContext;
    paymentId: string;
    amount: Money;
    idempotencyKey: string;
  }): Promise<{ providerRefundId: string; status: "completed" | "pending" | "failed" }>;
  verifyWebhook(request: {
    store: StoreContext;
    headers: Record<string, string | string[] | undefined>;
    rawBody: string;
  }): Promise<PaymentWebhookResult>;
}

export interface ILogisticsProvider {
  name: string;
  healthCheck(store: StoreContext): Promise<ProviderHealth>;
  createShipment(request: {
    store: StoreContext;
    fulfillmentOrderId: string;
    idempotencyKey: string;
  }): Promise<{ providerShipmentId: string; trackingNumber?: string; status: string }>;
  track(request: {
    store: StoreContext;
    trackingNumber: string;
  }): Promise<{ status: string; events: Array<{ at: string; description: string }> }>;
}

export interface ITaxProvider {
  name: string;
  healthCheck(store: StoreContext): Promise<ProviderHealth>;
  calculateDestinationTax(request: {
    store: StoreContext;
    destinationCountry: string;
    lineItems: Array<{ skuId: string; hsCode: string; material: string; amount: Money }>;
  }): Promise<{ tax: Money; duties: Money; ruleVersion: string }>;
}

export interface IFxRateProvider {
  name: string;
  healthCheck(store: StoreContext): Promise<ProviderHealth>;
  quote(request: {
    store: StoreContext;
    baseCurrency: string;
    quoteCurrency: string;
    at: string;
  }): Promise<{ rate: string; version: string; expiresAt: string }>;
}

export interface IRiskProvider {
  name: string;
  healthCheck(store: StoreContext): Promise<ProviderHealth>;
  evaluateOrder(request: {
    store: StoreContext;
    orderId?: string;
    email: string;
    ipAddress?: string;
    destinationCountry?: string;
  }): Promise<{ riskLevel: "low" | "medium" | "high"; reasonCodes: string[] }>;
}

