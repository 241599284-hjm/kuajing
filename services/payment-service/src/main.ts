import "reflect-metadata";
import { BadRequestException, Body, Controller, Get, Headers, Module, Post, ServiceUnavailableException } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { IPaymentProvider, ProviderHealth } from "@commerce/provider-contracts";
import { assertStoreContext, type StoreContext } from "@commerce/store-context";
import { randomUUID } from "node:crypto";

type MockPaymentIntentRequest = {
  orderId?: string;
  idempotencyKey?: string;
  amountMinor?: number;
  currency?: string;
  customerEmail?: string;
  returnUrl?: string;
};

type MockWebhookRequest = {
  orderId?: string;
  status?: "paid" | "cancelled";
};

const selfHostedStore = {
  storeId: process.env.DEFAULT_STORE_ID ?? "00000000-0000-4000-8000-000000000001",
  region: process.env.DEFAULT_STORE_REGION ?? "local",
  timezone: process.env.DEFAULT_STORE_TIMEZONE ?? "Asia/Hong_Kong"
};
const orderServiceUrl = process.env.ORDER_SERVICE_URL ?? "http://localhost:4105";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createStoreContext(correlationId: string | undefined): StoreContext {
  return assertStoreContext({
    storeId: selfHostedStore.storeId,
    region: selfHostedStore.region,
    timezone: selfHostedStore.timezone,
    correlationId: correlationId ?? randomUUID()
  });
}

function normalizePaymentIntent(body: MockPaymentIntentRequest) {
  const orderId = body.orderId?.trim();
  const idempotencyKey = body.idempotencyKey?.trim();
  const amountMinor = Number(body.amountMinor);
  const currency = body.currency?.trim().toUpperCase() || "USD";
  const customerEmail = body.customerEmail?.trim().toLowerCase();
  const returnUrl = body.returnUrl?.trim() || `${process.env.STOREFRONT_PUBLIC_URL ?? "http://localhost:3000"}/payment-result?mock=success`;

  if (!orderId || !idempotencyKey) {
    throw new BadRequestException("orderId and idempotencyKey are required");
  }

  if (!Number.isInteger(amountMinor) || amountMinor < 0) {
    throw new BadRequestException("amountMinor must be a non-negative integer");
  }

  if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    throw new BadRequestException("valid customerEmail is required");
  }

  return { orderId, idempotencyKey, amountMinor, currency, customerEmail, returnUrl };
}

function normalizeMockWebhook(body: MockWebhookRequest) {
  const orderId = body.orderId?.trim();
  const status = body.status ?? "paid";

  if (!orderId || !uuidPattern.test(orderId)) {
    throw new BadRequestException("orderId must be a UUID");
  }

  if (status !== "paid" && status !== "cancelled") {
    throw new BadRequestException("status must be paid or cancelled");
  }

  return { orderId, status };
}

class MockPaymentProvider implements IPaymentProvider {
  name = "mock-payment";

  async healthCheck(): Promise<ProviderHealth> {
    return { status: "healthy", checkedAt: new Date().toISOString() };
  }

  async supports() {
    return { countries: ["US", "DE", "GB"], currencies: ["USD", "EUR", "GBP"], methods: ["card", "paypal"] };
  }

  async createPayment(request: Parameters<IPaymentProvider["createPayment"]>[0]) {
    return {
      provider: this.name,
      providerPaymentId: `mock_pi_${request.orderId}`,
      status: "created" as const,
      redirectUrl: request.returnUrl
    };
  }

  async refundPayment() {
    return { providerRefundId: "mock_refund_local", status: "created" as const };
  }

  async verifyWebhook(request: { store: StoreContext; rawBody: string }) {
    const parsed = JSON.parse(request.rawBody || "{}") as { orderId?: string; status?: "paid" | "cancelled" };
    return {
      eventId: "mock_evt_local",
      providerPaymentId: "mock_pi_local",
      orderId: parsed.orderId ?? "mock_order",
      status: parsed.status ?? "paid" as const
    };
  }
}

const provider = new MockPaymentProvider();

@Controller()
class PaymentController {
  @Get("/health")
  async health() {
    return { service: "payment-service", status: "ok", provider: provider.name, providerHealth: await provider.healthCheck() };
  }

  @Post("/payments/mock-intents")
  async createMockIntent(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Body() body: MockPaymentIntentRequest
  ) {
    const input = normalizePaymentIntent(body);
    const store = createStoreContext(correlationId);
    return provider.createPayment({
      store,
      orderId: input.orderId,
      idempotencyKey: input.idempotencyKey,
      amount: {
        amountMinor: input.amountMinor,
        currency: input.currency
      },
      customerEmail: input.customerEmail,
      returnUrl: input.returnUrl
    });
  }

  @Post("/webhooks/mock")
  async mockWebhook(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Body() body: MockWebhookRequest
  ) {
    const input = normalizeMockWebhook(body);
    const store = createStoreContext(correlationId);
    const event = await provider.verifyWebhook({
      store,
      rawBody: JSON.stringify(input)
    });
    const path = event.status === "paid" ? "/payments/mock-confirm" : "/payments/mock-cancel";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 900);

    try {
      const response = await fetch(`${orderServiceUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-correlation-id": store.correlationId
        },
        body: JSON.stringify({ orderId: input.orderId }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new ServiceUnavailableException(payload);
      }

      return {
        eventId: event.eventId,
        provider: provider.name,
        orderTransition: payload
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

@Module({ controllers: [PaymentController] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  await app.listen(Number(process.env.PORT ?? 4106), "0.0.0.0");
}

void bootstrap();
