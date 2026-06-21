import "reflect-metadata";
import { Body, Controller, Get, Headers, HttpException, Module, Param, Post, Query, Res, StreamableFile } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { assertStoreContext } from "@commerce/store-context";
import { ERROR_CODES, normalizeErrorPayload } from "@commerce/error-codes";
import { randomUUID } from "node:crypto";

const serviceName = "api-gateway";
const storeServiceUrl = process.env.STORE_SERVICE_URL ?? "http://localhost:4101";
const catalogServiceUrl = process.env.CATALOG_SERVICE_URL ?? "http://localhost:4103";
const orderServiceUrl = process.env.ORDER_SERVICE_URL ?? "http://localhost:4105";
const logisticsServiceUrl = process.env.LOGISTICS_SERVICE_URL ?? "http://localhost:4110";
const notificationServiceUrl = process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:4111";
const reviewServiceUrl = process.env.REVIEW_SERVICE_URL ?? "http://localhost:4112";
const mediaServiceUrl = process.env.MEDIA_SERVICE_URL ?? "http://localhost:4108";
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
type HeaderResponse = { setHeader(name: string, value: string): void };

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

function throwForwardedError(payload: unknown, status: number, correlationId: string): never {
  throw new HttpException(normalizeErrorPayload(payload, status, correlationId), status);
}

async function requestJson<T>(url: string, init: RequestInit, headers: HeaderBag): Promise<T> {
  const requestHeaders = init.headers as Record<string, string> | undefined;
  const correlationId = requestHeaders?.["x-correlation-id"]
    ?? headerValue(headers, "x-correlation-id")
    ?? randomUUID();

  try {
    const response = await fetch(url, init);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throwForwardedError(payload, response.status, correlationId);
    }

    return payload as T;
  } catch (error) {
    if (error instanceof HttpException) {
      throw error;
    }

    throw new HttpException({
      code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
      message: "A required downstream service is unavailable.",
      correlationId
    }, 503);
  }
}

async function forwardJson<T>(path: string, headers: HeaderBag): Promise<T> {
  return requestJson(`${catalogServiceUrl}${path}`, {
    headers: buildForwardHeaders(headers)
  }, headers);
}

async function forwardOrderJson<T>(path: string, headers: HeaderBag, body?: unknown): Promise<T> {
  return requestJson(`${orderServiceUrl}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...buildForwardHeaders(headers),
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  }, headers);
}

async function forwardServiceJson<T>(baseUrl: string, path: string, headers: HeaderBag, body?: unknown): Promise<T> {
  return requestJson(`${baseUrl}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...buildForwardHeaders(headers),
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  }, headers);
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

  @Get("/catalog/products/:slug")
  product(@Headers() headers: HeaderBag, @Param("slug") slug: string) {
    return forwardJson(`/storefront/products/${encodeURIComponent(slug)}`, headers);
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

  @Get("/storefront/homepage")
  homepageLayout(@Headers() headers: HeaderBag) {
    return forwardServiceJson(storeServiceUrl, "/homepage-layout", headers);
  }

  @Post("/storefront/newsletter-subscriptions")
  newsletterSubscription(@Headers() headers: HeaderBag, @Body() body: unknown) {
    return forwardServiceJson(storeServiceUrl, "/newsletter-subscriptions", headers, body);
  }

  @Get("/media/public/:storeId/:scope/:kind/:yyyyMm/:fileName")
  async publicMedia(
    @Headers() headers: HeaderBag,
    @Param("storeId") storeId: string,
    @Param("scope") scope: string,
    @Param("kind") kind: string,
    @Param("yyyyMm") yyyyMm: string,
    @Param("fileName") fileName: string,
    @Res({ passthrough: true }) response: HeaderResponse
  ) {
    const correlationId = headerValue(headers, "x-correlation-id") ?? randomUUID();
    const segments = [storeId, scope, kind, yyyyMm, fileName].map(encodeURIComponent).join("/");
    let upstream: Response;
    try {
      upstream = await fetch(`${mediaServiceUrl}/media/public/${segments}`, {
        headers: { "x-correlation-id": correlationId }
      });
    } catch {
      throw new HttpException({ code: ERROR_CODES.DEPENDENCY_UNAVAILABLE, message: "Media storage is unavailable.", correlationId }, 503);
    }
    if (!upstream.ok) {
      throwForwardedError(await upstream.json().catch(() => ({})), upstream.status, correlationId);
    }
    response.setHeader("Cache-Control", upstream.headers.get("cache-control") ?? "public, max-age=31536000, immutable");
    response.setHeader("Content-Type", upstream.headers.get("content-type") ?? "application/octet-stream");
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) response.setHeader("Content-Length", contentLength);
    return new StreamableFile(Buffer.from(await upstream.arrayBuffer()));
  }

  @Get("/orders/customer-history")
  customerOrders(@Headers() headers: HeaderBag, @Query("email") email: string) {
    return forwardOrderJson(`/orders/customer-history?email=${encodeURIComponent(email ?? "")}`, headers);
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
