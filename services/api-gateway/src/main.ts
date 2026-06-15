import "reflect-metadata";
import { Body, Controller, Get, Headers, HttpException, Module, Param, Post } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { assertStoreContext } from "@commerce/store-context";
import { normalizeErrorPayload } from "@commerce/error-codes";
import { randomUUID } from "node:crypto";

const serviceName = "api-gateway";
const catalogServiceUrl = process.env.CATALOG_SERVICE_URL ?? "http://localhost:4103";
const orderServiceUrl = process.env.ORDER_SERVICE_URL ?? "http://localhost:4105";
const logisticsServiceUrl = process.env.LOGISTICS_SERVICE_URL ?? "http://localhost:4110";
const notificationServiceUrl = process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:4111";
const reviewServiceUrl = process.env.REVIEW_SERVICE_URL ?? "http://localhost:4112";
const forwardedHeaderNames = [
  "x-correlation-id",
  "accept-language",
  "x-client-type",
  "authorization",
  "idempotency-key",
  "x-idempotency-key",
  "user-agent"
] as const;

type HeaderBag = Record<string, string | string[] | undefined>;

function headerValue(headers: HeaderBag, name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function buildForwardHeaders(headers: HeaderBag): Record<string, string> {
  const nextHeaders: Record<string, string> = {};

  for (const name of forwardedHeaderNames) {
    const value = headerValue(headers, name);

    if (value) {
      nextHeaders[name] = value;
    }
  }

  nextHeaders["x-correlation-id"] = nextHeaders["x-correlation-id"] ?? randomUUID();
  return nextHeaders;
}

function throwForwardedError(payload: unknown, status: number, headers: HeaderBag): never {
  throw new HttpException(normalizeErrorPayload(payload, status, headerValue(headers, "x-correlation-id")), status);
}

async function forwardJson<T>(path: string, headers: HeaderBag): Promise<T> {
  const response = await fetch(`${catalogServiceUrl}${path}`, {
    headers: buildForwardHeaders(headers)
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throwForwardedError(payload, response.status, headers);
  }

  return payload as T;
}

async function forwardOrderJson<T>(path: string, headers: HeaderBag, body?: unknown): Promise<T> {
  const response = await fetch(`${orderServiceUrl}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...buildForwardHeaders(headers),
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throwForwardedError(payload, response.status, headers);
  }

  return payload as T;
}

async function forwardServiceJson<T>(baseUrl: string, path: string, headers: HeaderBag, body?: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...buildForwardHeaders(headers),
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throwForwardedError(payload, response.status, headers);
  }

  return payload as T;
}

@Controller()
class HealthController {
  @Get("/health")
  health() {
    return { service: serviceName, status: "ok" };
  }

  @Get("/store-check")
  storeCheck(@Headers("x-correlation-id") correlationId?: string) {
    return assertStoreContext({
      storeId: process.env.DEFAULT_STORE_ID ?? "00000000-0000-4000-8000-000000000001",
      region: process.env.DEFAULT_STORE_REGION ?? "local",
      timezone: process.env.DEFAULT_STORE_TIMEZONE ?? "Asia/Hong_Kong",
      correlationId: correlationId ?? "local-correlation"
    });
  }

  @Get("/catalog/storefront")
  storefrontCatalog(@Headers() headers: HeaderBag) {
    return forwardJson("/storefront", headers);
  }

  @Get("/catalog/ready")
  catalogReady(@Headers() headers: HeaderBag) {
    return forwardJson("/ready", headers);
  }

  @Get("/catalog/products")
  products(@Headers() headers: HeaderBag) {
    return forwardJson("/products", headers);
  }

  @Get("/catalog/categories")
  categories(@Headers() headers: HeaderBag) {
    return forwardJson("/categories", headers);
  }

  @Get("/catalog/regions")
  regions(@Headers() headers: HeaderBag) {
    return forwardJson("/regions", headers);
  }

  @Post("/checkout/mock-order")
  createMockOrder(@Headers() headers: HeaderBag, @Body() body: unknown) {
    return forwardOrderJson("/checkout/mock-order", headers, body);
  }

  @Post("/payments/mock-confirm")
  confirmMockPayment(@Headers() headers: HeaderBag, @Body() body: unknown) {
    return forwardOrderJson("/payments/mock-confirm", headers, body);
  }

  @Post("/payments/mock-cancel")
  cancelMockPayment(@Headers() headers: HeaderBag, @Body() body: unknown) {
    return forwardOrderJson("/payments/mock-cancel", headers, body);
  }

  @Post("/notifications/transactional-email")
  sendTransactionalEmail(@Headers() headers: HeaderBag, @Body() body: unknown) {
    return forwardServiceJson(notificationServiceUrl, "/emails/transactional", headers, body);
  }

  @Get("/logistics/tracking/:trackingNumber")
  tracking(@Headers() headers: HeaderBag, @Param("trackingNumber") trackingNumber: string) {
    return forwardServiceJson(logisticsServiceUrl, `/tracking/${encodeURIComponent(trackingNumber)}`, headers);
  }

  @Post("/logistics/tracking/refresh")
  refreshTracking(@Headers() headers: HeaderBag, @Body() body: unknown) {
    return forwardServiceJson(logisticsServiceUrl, "/tracking/refresh", headers, body);
  }

  @Get("/products/:slug/reviews")
  productReviews(@Headers() headers: HeaderBag, @Param("slug") slug: string) {
    return forwardServiceJson(reviewServiceUrl, `/products/${encodeURIComponent(slug)}/reviews`, headers);
  }

  @Post("/products/:slug/reviews")
  createProductReview(@Headers() headers: HeaderBag, @Param("slug") slug: string, @Body() body: unknown) {
    return forwardServiceJson(reviewServiceUrl, `/products/${encodeURIComponent(slug)}/reviews`, headers, body);
  }
}

@Module({ controllers: [HealthController] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  await app.listen(Number(process.env.PORT ?? 4000), "0.0.0.0");
}

void bootstrap();
