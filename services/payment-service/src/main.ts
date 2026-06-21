import "reflect-metadata";
import { BadRequestException, Body, ConflictException, Controller, Get, Headers, HttpCode, HttpException, Inject, Module, NotFoundException, Param, Post, Put, Req, ServiceUnavailableException } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ERROR_CODES, normalizeErrorPayload } from "@commerce/error-codes";
import type { IPaymentProvider, ProviderHealth } from "@commerce/provider-contracts";
import { assertStoreContext, type StoreContext } from "@commerce/store-context";
import { randomUUID } from "node:crypto";
import { PayPalProvider, PayPalProviderError } from "./paypal-provider.js";
import {
  normalizePayPalEnvironment,
  PayPalConfigurationError,
  PayPalConfigurationRepository,
  PayPalConfigurationService,
  type PayPalEnvironment
} from "./paypal-configuration.js";
import { normalizePaymentProviderName } from "./provider-selection.js";
import { acceptPayPalWebhook, PayPalWebhookRequestError } from "./paypal-webhook-handler.js";
import { PaymentWebhookInboxRepository, PaymentWebhookPayloadConflictError } from "./payment-webhook-inbox.js";
import { PaymentWebhookWorker } from "./payment-webhook-worker.js";
import { createTrackedPayment, PaymentTransactionPersistenceError, PaymentTransactionRepository } from "./payment-transaction.js";
import { PaymentRefundConflictError, PaymentRefundRepository, PaymentRefundStateError, processPaymentRefund } from "./payment-refund.js";

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

type PaymentRefundRequest = { orderId?: string; amountMinor?: number; currency?: string; reason?: string };

const selfHostedStore = {
  storeId: process.env.DEFAULT_STORE_ID ?? "00000000-0000-4000-8000-000000000001",
  region: process.env.DEFAULT_STORE_REGION ?? "local",
  timezone: process.env.DEFAULT_STORE_TIMEZONE ?? "Asia/Hong_Kong"
};
const orderServiceUrl = process.env.ORDER_SERVICE_URL ?? "http://localhost:4105";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validationFailed(message: string, details?: unknown): BadRequestException {
  return new BadRequestException({
    code: ERROR_CODES.VALIDATION_FAILED,
    message,
    ...(details === undefined ? {} : { details })
  });
}

function dependencyUnavailable(message: string, details?: unknown): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
    message,
    ...(details === undefined ? {} : { details })
  });
}

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
    throw validationFailed("orderId and idempotencyKey are required");
  }

  if (!Number.isInteger(amountMinor) || amountMinor < 0) {
    throw validationFailed("amountMinor must be a non-negative integer");
  }

  if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    throw validationFailed("valid customerEmail is required");
  }

  return { orderId, idempotencyKey, amountMinor, currency, customerEmail, returnUrl };
}

function normalizeMockWebhook(body: MockWebhookRequest) {
  const orderId = body.orderId?.trim();
  const status = body.status ?? "paid";

  if (!orderId || !uuidPattern.test(orderId)) {
    throw validationFailed("orderId must be a UUID");
  }

  if (status !== "paid" && status !== "cancelled") {
    throw validationFailed("status must be paid or cancelled");
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

  async refundPayment(request: Parameters<IPaymentProvider["refundPayment"]>[0]) {
    return {
      providerRefundId: `mock_refund_${request.paymentId}_${request.idempotencyKey}`,
      status: "completed" as const
    };
  }

  async verifyWebhook(request: { store: StoreContext; rawBody: string }) {
    const parsed = JSON.parse(request.rawBody || "{}") as { orderId?: string; amountMinor?: number; currency?: string };
    return {
      eventId: "mock_evt_local",
      eventType: "PAYMENT.CAPTURE.COMPLETED" as const,
      providerPaymentId: "mock_pi_local",
      providerCaptureId: "mock_capture_local",
      orderId: parsed.orderId ?? "mock_order",
      status: "paid" as const,
      amount: { amountMinor: parsed.amountMinor ?? 0, currency: parsed.currency ?? "USD" }
    };
  }
}

type PaymentIntentProvider = Pick<IPaymentProvider, "name" | "healthCheck" | "supports" | "createPayment" | "refundPayment">;

const mockProvider = new MockPaymentProvider();
const configuredProviderName = normalizePaymentProviderName(process.env.PAYMENT_PROVIDER);

function activePayPalEnvironment(): PayPalEnvironment {
  return normalizePayPalEnvironment(process.env.PAYPAL_ENVIRONMENT ?? "sandbox");
}

async function resolveProvider(
  configurations: PayPalConfigurationService,
  storeId: string
): Promise<PaymentIntentProvider> {
  if (configuredProviderName !== "paypal") return mockProvider;
  return configurations.createProvider(storeId, activePayPalEnvironment());
}

async function createPaymentIntent(
  selectedProvider: PaymentIntentProvider,
  transactions: PaymentTransactionRepository,
  correlationId: string | undefined,
  body: MockPaymentIntentRequest
) {
  const input = normalizePaymentIntent(body);
  const store = createStoreContext(correlationId);

  try {
    return await createTrackedPayment(selectedProvider, transactions, {
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
  } catch (error) {
    if (error instanceof PayPalProviderError) {
      throw dependencyUnavailable("Payment provider is unavailable.", {
        provider: selectedProvider.name,
        providerCode: error.code,
        providerStatus: error.status,
        retryable: error.retryable
      });
    }
    if (error instanceof PaymentTransactionPersistenceError) {
      console.error(JSON.stringify({
        event: "payment_transaction_persistence_failed",
        provider: selectedProvider.name,
        correlationId: store.correlationId,
        message: error.message
      }));
      throw dependencyUnavailable("Payment transaction storage is unavailable.", {
        provider: selectedProvider.name,
        retryable: true
      });
    }
    throw error;
  }
}

@Controller()
class PaymentController {
  constructor(
    @Inject(PaymentWebhookInboxRepository)
    private readonly webhookInbox: PaymentWebhookInboxRepository,
    @Inject(PaymentTransactionRepository)
    private readonly transactions: PaymentTransactionRepository,
    @Inject(PaymentRefundRepository)
    private readonly refunds: PaymentRefundRepository,
    @Inject(PayPalConfigurationService)
    private readonly paypalConfigurations: PayPalConfigurationService
  ) {}
  @Get("/health")
  async health() {
    const store = createStoreContext(undefined);
    try {
      const provider = await resolveProvider(this.paypalConfigurations, store.storeId);
      return { service: "payment-service", status: "ok", provider: provider.name, providerHealth: await provider.healthCheck(store) };
    } catch (error) {
      if (error instanceof PayPalConfigurationError) {
        throw dependencyUnavailable("Payment provider configuration is unavailable.", {
          provider: configuredProviderName,
          providerCode: error.code,
          retryable: false
        });
      }
      if (error instanceof PayPalProviderError) {
        throw dependencyUnavailable("Payment provider health check failed.", {
          provider: configuredProviderName,
          providerCode: error.code,
          providerStatus: error.status,
          retryable: error.retryable
        });
      }
      throw error;
    }
  }

  @Post("/payments/intents")
  async createIntent(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Body() body: MockPaymentIntentRequest
  ) {
    const store = createStoreContext(correlationId);
    let provider: PaymentIntentProvider;
    try {
      provider = await resolveProvider(this.paypalConfigurations, store.storeId);
    } catch (error) {
      throw dependencyUnavailable("Payment provider configuration is unavailable.", {
        provider: configuredProviderName,
        providerCode: error instanceof PayPalConfigurationError || error instanceof PayPalProviderError
          ? error.code
          : "PAYPAL_CONFIG_STORAGE_UNAVAILABLE",
        retryable: false
      });
    }
    return createPaymentIntent(provider, this.transactions, store.correlationId, body);
  }

  @Post("/payments/mock-intents")
  async createMockIntent(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Body() body: MockPaymentIntentRequest
  ) {
    return createPaymentIntent(mockProvider, this.transactions, correlationId, body);
  }

  @Post("/webhooks/mock")
  async mockWebhook(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Body() body: MockWebhookRequest
  ) {
    const input = normalizeMockWebhook(body);
    const store = createStoreContext(correlationId);
    const event = await mockProvider.verifyWebhook({
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
        throw new HttpException(normalizeErrorPayload(payload, response.status, store.correlationId), response.status);
      }

      return {
        eventId: event.eventId,
        provider: mockProvider.name,
        orderTransition: payload
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw dependencyUnavailable("Order service is unavailable.", {
        cause: error instanceof Error ? error.message : "unknown error"
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  @Post("/payments/refunds")
  async refund(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Headers("idempotency-key") idempotencyKeyHeader: string | undefined,
    @Headers("x-idempotency-key") alternateIdempotencyKeyHeader: string | undefined,
    @Headers("x-admin-actor") actorHeader: string | undefined,
    @Body() body: PaymentRefundRequest
  ) {
    const orderId = body.orderId?.trim() ?? "";
    const amountMinor = Number(body.amountMinor);
    const currency = body.currency?.trim().toUpperCase() ?? "";
    const reason = body.reason?.trim() ?? "";
    const idempotencyKey = (idempotencyKeyHeader ?? alternateIdempotencyKeyHeader)?.trim() ?? "";
    const actorId = actorHeader?.trim() ?? "";
    if (!uuidPattern.test(orderId) || !Number.isInteger(amountMinor) || amountMinor <= 0
      || !/^[A-Z]{3}$/.test(currency) || idempotencyKey.length < 8 || idempotencyKey.length > 200
      || actorId.length < 1 || actorId.length > 100 || reason.length < 3 || reason.length > 500) {
      throw validationFailed("Refund requires a valid order, positive amount, currency, idempotency key, actor, and reason.");
    }
    const store = createStoreContext(correlationId);
    try {
      const provider = await resolveProvider(this.paypalConfigurations, store.storeId);
      return await processPaymentRefund({ store, orderId, amountMinor, currency, idempotencyKey, actorId, reason }, {
        repository: this.refunds,
        provider
      });
    } catch (error) {
      if (error instanceof PayPalConfigurationError) {
        throw dependencyUnavailable("Payment provider configuration is unavailable.", {
          provider: configuredProviderName,
          providerCode: error.code,
          retryable: false
        });
      }
      if (error instanceof PaymentRefundConflictError) {
        throw new ConflictException({ code: ERROR_CODES.CONFLICT, message: error.message, correlationId: store.correlationId });
      }
      if (error instanceof PaymentRefundStateError) throw validationFailed(error.message);
      if (error instanceof PayPalProviderError) {
        if (!error.retryable) throw validationFailed("Payment provider rejected the refund.", { providerCode: error.code });
        throw dependencyUnavailable("Payment refund provider is unavailable.", { providerCode: error.code, retryable: true });
      }
      throw error;
    }
  }

  @Get("/payments/orders/:orderId/refunds")
  async refundSummary(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Param("orderId") orderId: string
  ) {
    if (!uuidPattern.test(orderId)) throw validationFailed("orderId must be a UUID");
    const store = createStoreContext(correlationId);
    const summary = await this.refunds.getOrderSummary(store.storeId, orderId);
    if (!summary) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: "Order does not have a captured payment.",
        correlationId: store.correlationId
      });
    }
    return summary;
  }

  @Get("/payments/refunds")
  recentRefunds(@Headers("x-correlation-id") correlationId: string | undefined) {
    const store = createStoreContext(correlationId);
    return this.refunds.listRecent(store.storeId);
  }

  @Get("/payments/refunds/:refundId")
  async refundDetail(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Param("refundId") refundId: string
  ) {
    const store = createStoreContext(correlationId);
    const refund = await this.refunds.getById(store.storeId, refundId);
    if (!refund) throw new NotFoundException({ code: ERROR_CODES.NOT_FOUND, message: "Refund was not found." });
    return refund;
  }

  @Get("/payments/webhooks")
  recentWebhooks(@Headers("x-correlation-id") correlationId: string | undefined) {
    const store = createStoreContext(correlationId);
    return this.webhookInbox.listRecent(store.storeId);
  }

  @Get("/payments/webhooks/:eventId")
  async webhookDetail(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Param("eventId") eventId: string
  ) {
    const store = createStoreContext(correlationId);
    const event = await this.webhookInbox.getByEventId(store.storeId, eventId);
    if (!event) throw new NotFoundException({ code: ERROR_CODES.NOT_FOUND, message: "Webhook event was not found." });
    return event;
  }

  @Post("/webhooks/paypal")
  @HttpCode(202)
  async paypalWebhook(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Req() request: { rawBody?: Buffer; headers: Record<string, string | string[] | undefined> }
  ) {
    if (configuredProviderName !== "paypal") {
      throw dependencyUnavailable("PayPal provider is not enabled.", { provider: configuredProviderName });
    }
    const store = createStoreContext(correlationId);
    try {
      const paypalProvider = await this.paypalConfigurations.createProvider(store.storeId, activePayPalEnvironment());
      return await acceptPayPalWebhook({
        provider: paypalProvider,
        inbox: this.webhookInbox,
        store,
        headers: request.headers,
        rawBody: request.rawBody
      });
    } catch (error) {
      if (error instanceof PayPalConfigurationError) {
        throw dependencyUnavailable("PayPal webhook configuration is unavailable.", {
          providerCode: error.code,
          retryable: false
        });
      }
      if (error instanceof PayPalWebhookRequestError) throw validationFailed(error.message, { providerCode: error.code });
      if (error instanceof PaymentWebhookPayloadConflictError) {
        throw new ConflictException({ code: ERROR_CODES.IDEMPOTENCY_CONFLICT, message: error.message, correlationId: store.correlationId });
      }
      if (error instanceof PayPalProviderError) {
        const invalid = error.code === "PAYPAL_WEBHOOK_HEADERS_MISSING"
          || error.code === "PAYPAL_WEBHOOK_INVALID"
          || error.code === "PAYPAL_WEBHOOK_EVENT_UNSUPPORTED";
        if (invalid) throw validationFailed("PayPal webhook was rejected.", { providerCode: error.code });
        throw dependencyUnavailable("PayPal webhook verification is unavailable.", {
          providerCode: error.code,
          providerStatus: error.status,
          retryable: error.retryable
        });
      }
      throw error;
    }
  }

  @Get("/admin/paypal-configurations/:environment")
  paypalConfiguration(
    @Headers("x-admin-actor") actorHeader: string | undefined,
    @Param("environment") environmentValue: string
  ) {
    const actorId = actorHeader?.trim();
    if (!actorId) throw validationFailed("Trusted admin actor is required.");
    try {
      const environment = normalizePayPalEnvironment(environmentValue);
      return this.paypalConfigurations.getView(selfHostedStore.storeId, environment)
        .catch(() => {
          throw dependencyUnavailable("Payment configuration storage is unavailable.");
        });
    } catch (error) {
      if (error instanceof PayPalConfigurationError) throw validationFailed(error.message, { providerCode: error.code });
      throw error;
    }
  }

  @Put("/admin/paypal-configurations/:environment")
  async savePayPalConfiguration(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Headers("x-admin-actor") actorHeader: string | undefined,
    @Headers("x-admin-ip") actorIpHeader: string | undefined,
    @Param("environment") environmentValue: string,
    @Body() body: unknown
  ) {
    const actorId = actorHeader?.trim();
    if (!actorId) throw validationFailed("Trusted admin actor is required.");
    try {
      return await this.paypalConfigurations.save({
        storeId: selfHostedStore.storeId,
        environment: normalizePayPalEnvironment(environmentValue),
        body,
        actorId,
        actorIp: actorIpHeader?.trim() || "unknown",
        correlationId: correlationId ?? randomUUID()
      });
    } catch (error) {
      if (error instanceof PayPalConfigurationError) throw validationFailed(error.message, { providerCode: error.code });
      throw dependencyUnavailable("Payment configuration storage is unavailable.");
    }
  }

  @Post("/admin/paypal-configurations/:environment/test")
  async testPayPalConfiguration(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Headers("x-admin-actor") actorHeader: string | undefined,
    @Headers("x-admin-ip") actorIpHeader: string | undefined,
    @Param("environment") environmentValue: string,
    @Body() body: { includeWebhook?: unknown }
  ) {
    const actorId = actorHeader?.trim();
    if (!actorId) throw validationFailed("Trusted admin actor is required.");
    const store = createStoreContext(correlationId);
    try {
      return await this.paypalConfigurations.test({
        store,
        environment: normalizePayPalEnvironment(environmentValue),
        actorId,
        actorIp: actorIpHeader?.trim() || "unknown",
        includeWebhook: body.includeWebhook === true
      });
    } catch (error) {
      if (error instanceof PayPalConfigurationError) throw validationFailed(error.message, { providerCode: error.code });
      if (error instanceof PayPalProviderError) {
        throw dependencyUnavailable("PayPal connectivity test failed.", {
          providerCode: error.code,
          providerStatus: error.status,
          retryable: error.retryable
        });
      }
      throw dependencyUnavailable("Payment configuration test is unavailable.");
    }
  }
}

@Module({
  controllers: [PaymentController],
  providers: [
    PaymentWebhookInboxRepository,
    PaymentTransactionRepository,
    PaymentRefundRepository,
    PayPalConfigurationRepository,
    PayPalConfigurationService,
    PaymentWebhookWorker
  ]
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors({ origin: true });
  await app.listen(Number(process.env.PORT ?? 4106), "0.0.0.0");
}

void bootstrap();
