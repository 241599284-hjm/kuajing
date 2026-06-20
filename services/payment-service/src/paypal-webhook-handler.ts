import type { PaymentWebhookResult } from "@commerce/provider-contracts";
import type { StoreContext } from "@commerce/store-context";
import type { PaymentWebhookClaimInput, PaymentWebhookClaimResult } from "./payment-webhook-inbox.js";

type WebhookProvider = {
  verifyWebhook(input: {
    store: StoreContext;
    headers: Record<string, string | string[] | undefined>;
    rawBody: string;
  }): Promise<PaymentWebhookResult>;
};

type WebhookInbox = {
  claim(input: PaymentWebhookClaimInput): Promise<PaymentWebhookClaimResult>;
};

export class PayPalWebhookRequestError extends Error {
  readonly code = "PAYPAL_WEBHOOK_RAW_BODY_MISSING";
}

export async function acceptPayPalWebhook(input: {
  provider: WebhookProvider;
  inbox: WebhookInbox;
  store: StoreContext;
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer | undefined;
}) {
  if (!input.rawBody?.length) throw new PayPalWebhookRequestError("PayPal webhook raw body is required");
  const event = await input.provider.verifyWebhook({
    store: input.store,
    headers: input.headers,
    rawBody: input.rawBody.toString("utf8")
  });
  const claim = await input.inbox.claim({
    storeId: input.store.storeId,
    provider: "paypal",
    eventId: event.eventId,
    providerPaymentId: event.providerPaymentId,
    orderId: "orderId" in event ? event.orderId : undefined,
    eventType: event.eventType,
    payload: event,
    correlationId: input.store.correlationId
  });
  return { accepted: true, eventId: event.eventId, decision: claim.decision };
}
