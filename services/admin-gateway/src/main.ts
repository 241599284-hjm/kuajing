import "reflect-metadata";
import { Body, Controller, Get, Headers, HttpException, Module, Param, Post, Put, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { NestFactory } from "@nestjs/core";
import { assertStoreContext } from "@commerce/store-context";
import { randomUUID } from "node:crypto";

const serviceName = "admin-gateway";
const catalogServiceUrl = process.env.CATALOG_SERVICE_URL ?? "http://localhost:4103";
const orderServiceUrl = process.env.ORDER_SERVICE_URL ?? "http://localhost:4105";
const inventoryServiceUrl = process.env.INVENTORY_SERVICE_URL ?? "http://localhost:4104";
const workerServiceUrl = process.env.WORKER_SERVICE_URL ?? "http://localhost:4109";
const mediaServiceUrl = process.env.MEDIA_SERVICE_URL ?? "http://localhost:4108";
const maxUploadBytes = Number(process.env.MEDIA_MAX_UPLOAD_BYTES ?? 8 * 1024 * 1024);
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
type UploadedMediaFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

function headerValue(headers: HeaderBag, name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function buildForwardHeaders(headers: HeaderBag, extraHeaders: Record<string, string> = {}): Record<string, string> {
  const nextHeaders: Record<string, string> = { ...extraHeaders };

  for (const name of forwardedHeaderNames) {
    const value = headerValue(headers, name);

    if (value) {
      nextHeaders[name] = value;
    }
  }

  nextHeaders["x-correlation-id"] = nextHeaders["x-correlation-id"] ?? randomUUID();
  return nextHeaders;
}

async function forwardJson<T>(path: string, headers: HeaderBag): Promise<T> {
  const response = await fetch(`${catalogServiceUrl}${path}`, {
    headers: buildForwardHeaders(headers)
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new HttpException(payload, response.status);
  }

  return payload as T;
}

async function forwardJsonWithBody<T>(path: string, headers: HeaderBag, body: unknown): Promise<T> {
  const response = await fetch(`${catalogServiceUrl}${path}`, {
    method: "PUT",
    headers: buildForwardHeaders(headers, { "Content-Type": "application/json" }),
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new HttpException(payload, response.status);
  }

  return payload as T;
}

async function forwardOrderJson<T>(path: string, headers: HeaderBag): Promise<T> {
  const response = await fetch(`${orderServiceUrl}${path}`, {
    headers: buildForwardHeaders(headers)
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new HttpException(payload, response.status);
  }

  return payload as T;
}

async function forwardOrderJsonWithBody<T>(path: string, headers: HeaderBag, body: unknown): Promise<T> {
  const response = await fetch(`${orderServiceUrl}${path}`, {
    method: "POST",
    headers: buildForwardHeaders(headers, { "Content-Type": "application/json" }),
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new HttpException(payload, response.status);
  }

  return payload as T;
}

async function forwardInventoryJson<T>(path: string, headers: HeaderBag): Promise<T> {
  const response = await fetch(`${inventoryServiceUrl}${path}`, {
    headers: buildForwardHeaders(headers)
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new HttpException(payload, response.status);
  }

  return payload as T;
}

async function forwardInventoryJsonWithBody<T>(path: string, headers: HeaderBag, body: unknown): Promise<T> {
  const response = await fetch(`${inventoryServiceUrl}${path}`, {
    method: "POST",
    headers: buildForwardHeaders(headers, { "Content-Type": "application/json" }),
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new HttpException(payload, response.status);
  }

  return payload as T;
}

async function forwardWorkerJson<T>(path: string, headers: HeaderBag): Promise<T> {
  const response = await fetch(`${workerServiceUrl}${path}`, {
    headers: buildForwardHeaders(headers)
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new HttpException(payload, response.status);
  }

  return payload as T;
}

async function forwardWorkerJsonWithBody<T>(path: string, headers: HeaderBag, body: unknown): Promise<T> {
  const response = await fetch(`${workerServiceUrl}${path}`, {
    method: "POST",
    headers: buildForwardHeaders(headers, { "Content-Type": "application/json" }),
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new HttpException(payload, response.status);
  }

  return payload as T;
}

async function forwardMediaUpload<T>(path: string, headers: HeaderBag, file: UploadedMediaFile): Promise<T> {
  const formData = new FormData();
  const bytes = file.buffer.buffer.slice(file.buffer.byteOffset, file.buffer.byteOffset + file.buffer.byteLength) as ArrayBuffer;
  formData.append("file", new Blob([bytes], { type: file.mimetype }), file.originalname);

  const response = await fetch(`${mediaServiceUrl}${path}`, {
    method: "POST",
    headers: buildForwardHeaders(headers),
    body: formData
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new HttpException(payload, response.status);
  }

  return payload as T;
}

@Controller()
class HealthController {
  @Get("/health")
  health() {
    return { service: serviceName, status: "ok", adminBoundary: "isolated" };
  }

  @Get("/store-check")
  storeCheck(@Headers("x-correlation-id") correlationId?: string) {
    return assertStoreContext({
      storeId: process.env.DEFAULT_STORE_ID ?? "00000000-0000-4000-8000-000000000001",
      region: process.env.DEFAULT_STORE_REGION ?? "local",
      timezone: process.env.DEFAULT_STORE_TIMEZONE ?? "Asia/Hong_Kong",
      correlationId: correlationId ?? "local-admin-correlation"
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

  @Get("/catalog/admin-products")
  adminProducts(@Headers() headers: HeaderBag) {
    return forwardJson("/admin/products", headers);
  }

  @Get("/catalog/categories")
  categories(@Headers() headers: HeaderBag) {
    return forwardJson("/categories", headers);
  }

  @Get("/catalog/regions")
  regions(@Headers() headers: HeaderBag) {
    return forwardJson("/regions", headers);
  }

  @Get("/orders")
  orders(@Headers() headers: HeaderBag) {
    return forwardOrderJson("/orders", headers);
  }

  @Get("/orders/:id")
  orderDetail(@Headers() headers: HeaderBag, @Param("id") id: string) {
    return forwardOrderJson(`/orders/${id}`, headers);
  }

  @Post("/payments/mock-confirm")
  confirmMockPayment(@Headers() headers: HeaderBag, @Body() body: unknown) {
    return forwardOrderJsonWithBody("/payments/mock-confirm", headers, body);
  }

  @Post("/payments/mock-cancel")
  cancelMockPayment(@Headers() headers: HeaderBag, @Body() body: unknown) {
    return forwardOrderJsonWithBody("/payments/mock-cancel", headers, body);
  }

  @Get("/inventory/items")
  inventoryItems(@Headers() headers: HeaderBag) {
    return forwardInventoryJson("/inventory/items", headers);
  }

  @Get("/inventory/reservations")
  inventoryReservations(@Headers() headers: HeaderBag) {
    return forwardInventoryJson("/inventory/reservations", headers);
  }

  @Post("/inventory/reservations/:id/release")
  releaseInventoryReservation(@Headers() headers: HeaderBag, @Body() body: unknown, @Param("id") id: string) {
    return forwardInventoryJsonWithBody(`/inventory/reservations/${id}/release`, headers, body);
  }

  @Get("/dead-letter-tasks")
  deadLetterTasks(@Headers() headers: HeaderBag) {
    return forwardWorkerJson("/dead-letter-tasks", headers);
  }

  @Post("/dead-letter-tasks/:id/retry")
  retryDeadLetterTask(@Headers() headers: HeaderBag, @Body() body: unknown, @Param("id") id: string) {
    return forwardWorkerJsonWithBody(`/dead-letter-tasks/${id}/retry`, headers, body);
  }

  @Post("/dead-letter-tasks/:id/discard")
  discardDeadLetterTask(@Headers() headers: HeaderBag, @Body() body: unknown, @Param("id") id: string) {
    return forwardWorkerJsonWithBody(`/dead-letter-tasks/${id}/discard`, headers, body);
  }

  @Post("/media/product-assets")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: maxUploadBytes } }))
  uploadProductAsset(@Headers() headers: HeaderBag, @UploadedFile() file: UploadedMediaFile) {
    return forwardMediaUpload("/media/product-assets", headers, file);
  }

  @Put("/catalog/categories")
  saveCategories(@Headers() headers: HeaderBag, @Body() body: unknown) {
    return forwardJsonWithBody("/categories", headers, body);
  }

  @Put("/catalog/regions")
  saveRegions(@Headers() headers: HeaderBag, @Body() body: unknown) {
    return forwardJsonWithBody("/regions", headers, body);
  }

  @Put("/catalog/products")
  saveProducts(@Headers() headers: HeaderBag, @Body() body: unknown) {
    return forwardJsonWithBody("/products", headers, body);
  }
}

@Module({ controllers: [HealthController] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  await app.listen(Number(process.env.PORT ?? 4001), "0.0.0.0");
}

void bootstrap();
