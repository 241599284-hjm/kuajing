import "reflect-metadata";
import { Body, Controller, Delete, Get, Headers, HttpException, Module, Param, Patch, Post, Put, Query, Req, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { NestFactory } from "@nestjs/core";
import { assertStoreContext } from "@commerce/store-context";
import { ERROR_CODES, normalizeErrorPayload } from "@commerce/error-codes";
import { randomUUID } from "node:crypto";
import {
  authorizePaymentConfigurationRequest,
  authorizeRefundRequest,
  RefundAuthorizationError
} from "./refund-authorization.js";
import {
  pendingProductMediaAssets,
  pendingProductMediaObjects,
  removedProductMediaObjects,
  shouldCompensateCatalogFailure,
  shouldReconcileCatalogFailure
} from "./media-compensation.js";

const serviceName = "admin-gateway";
const storeServiceUrl = process.env.STORE_SERVICE_URL ?? "http://localhost:4101";
const catalogServiceUrl = process.env.CATALOG_SERVICE_URL ?? "http://localhost:4103";
const orderServiceUrl = process.env.ORDER_SERVICE_URL ?? "http://localhost:4105";
const paymentServiceUrl = process.env.PAYMENT_SERVICE_URL ?? "http://localhost:4106";
const authServiceUrl = process.env.AUTH_SERVICE_URL ?? "http://localhost:4102";
const inventoryServiceUrl = process.env.INVENTORY_SERVICE_URL ?? "http://localhost:4104";
const workerServiceUrl = process.env.WORKER_SERVICE_URL ?? "http://localhost:4109";
const mediaServiceUrl = process.env.MEDIA_SERVICE_URL ?? "http://localhost:4108";
const logisticsServiceUrl = process.env.LOGISTICS_SERVICE_URL ?? "http://localhost:4110";
const notificationServiceUrl = process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:4111";
const reviewServiceUrl = process.env.REVIEW_SERVICE_URL ?? "http://localhost:4112";
const opsServiceUrl = process.env.OPS_SERVICE_URL ?? "http://localhost:4113";
const productImportServiceUrl = process.env.PRODUCT_IMPORT_SERVICE_URL ?? "http://localhost:4114";
const maxUploadBytes = Number(process.env.MEDIA_MAX_UPLOAD_BYTES ?? 8 * 1024 * 1024);
const forwardedHeaderNames = [
  "x-correlation-id",
  "accept-language",
  "x-client-type",
  "authorization",
  "cookie",
  "idempotency-key",
  "x-idempotency-key",
  "x-admin-actor",
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

function adminRequestIp(request: { ip?: string; socket?: { remoteAddress?: string } }) {
  return request.ip?.trim() || request.socket?.remoteAddress?.trim() || "unknown";
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

async function forwardJsonWithBody<T>(path: string, headers: HeaderBag, body: unknown): Promise<T> {
  return requestJson(`${catalogServiceUrl}${path}`, {
    method: "PUT",
    headers: buildForwardHeaders(headers, { "Content-Type": "application/json" }),
    body: JSON.stringify(body)
  }, headers);
}

async function forwardStoreJson<T>(path: string, headers: HeaderBag): Promise<T> {
  return requestJson(`${storeServiceUrl}${path}`, { headers: buildForwardHeaders(headers) }, headers);
}

async function forwardStoreJsonWithBody<T>(path: string, headers: HeaderBag, body: unknown, method = "PUT"): Promise<T> {
  return requestJson(`${storeServiceUrl}${path}`, {
    method,
    headers: buildForwardHeaders(headers, { "Content-Type": "application/json" }),
    body: JSON.stringify(body)
  }, headers);
}

async function forwardOrderJson<T>(path: string, headers: HeaderBag): Promise<T> {
  return requestJson(`${orderServiceUrl}${path}`, {
    headers: buildForwardHeaders(headers)
  }, headers);
}

async function forwardOrderJsonWithBody<T>(path: string, headers: HeaderBag, body: unknown): Promise<T> {
  return requestJson(`${orderServiceUrl}${path}`, {
    method: "POST",
    headers: buildForwardHeaders(headers, { "Content-Type": "application/json" }),
    body: JSON.stringify(body)
  }, headers);
}

async function forwardPaymentJsonWithBody<T>(
  path: string,
  headers: HeaderBag,
  body: unknown,
  method = "POST"
): Promise<T> {
  return requestJson(`${paymentServiceUrl}${path}`, {
    method,
    headers: buildForwardHeaders(headers, { "Content-Type": "application/json" }),
    body: JSON.stringify(body)
  }, headers);
}

async function forwardPaymentJson<T>(path: string, headers: HeaderBag): Promise<T> {
  return requestJson(`${paymentServiceUrl}${path}`, {
    headers: buildForwardHeaders(headers)
  }, headers);
}

async function forwardAuthJson<T>(path: string, headers: HeaderBag): Promise<T> {
  return requestJson(`${authServiceUrl}${path}`, { headers: buildForwardHeaders(headers) }, headers);
}

async function forwardInventoryJson<T>(path: string, headers: HeaderBag): Promise<T> {
  return requestJson(`${inventoryServiceUrl}${path}`, {
    headers: buildForwardHeaders(headers)
  }, headers);
}

async function forwardInventoryJsonWithBody<T>(path: string, headers: HeaderBag, body: unknown): Promise<T> {
  return requestJson(`${inventoryServiceUrl}${path}`, {
    method: "POST",
    headers: buildForwardHeaders(headers, { "Content-Type": "application/json" }),
    body: JSON.stringify(body)
  }, headers);
}

async function forwardWorkerJson<T>(path: string, headers: HeaderBag): Promise<T> {
  return requestJson(`${workerServiceUrl}${path}`, {
    headers: buildForwardHeaders(headers)
  }, headers);
}

async function forwardWorkerJsonWithBody<T>(path: string, headers: HeaderBag, body: unknown): Promise<T> {
  return requestJson(`${workerServiceUrl}${path}`, {
    method: "POST",
    headers: buildForwardHeaders(headers, { "Content-Type": "application/json" }),
    body: JSON.stringify(body)
  }, headers);
}

async function forwardNotificationJson<T>(path: string, headers: HeaderBag): Promise<T> {
  return requestJson(`${notificationServiceUrl}${path}`, {
    headers: buildForwardHeaders(headers)
  }, headers);
}

async function forwardNotificationPutJson<T>(path: string, headers: HeaderBag, body: unknown): Promise<T> {
  return requestJson(`${notificationServiceUrl}${path}`, {
    method: "PUT",
    headers: buildForwardHeaders(headers, { "Content-Type": "application/json" }),
    body: JSON.stringify(body)
  }, headers);
}

async function forwardLogisticsJson<T>(path: string, headers: HeaderBag): Promise<T> {
  return requestJson(`${logisticsServiceUrl}${path}`, {
    headers: buildForwardHeaders(headers)
  }, headers);
}

async function forwardLogisticsJsonWithBody<T>(path: string, headers: HeaderBag, body: unknown, method = "POST"): Promise<T> {
  return requestJson(`${logisticsServiceUrl}${path}`, {
    method,
    headers: buildForwardHeaders(headers, { "Content-Type": "application/json" }),
    body: JSON.stringify(body)
  }, headers);
}

async function forwardReviewJson<T>(path: string, headers: HeaderBag): Promise<T> {
  return requestJson(`${reviewServiceUrl}${path}`, {
    headers: buildForwardHeaders(headers)
  }, headers);
}

async function forwardReviewJsonWithBody<T>(path: string, headers: HeaderBag, body: unknown, method = "PUT"): Promise<T> {
  return requestJson(`${reviewServiceUrl}${path}`, {
    method,
    headers: buildForwardHeaders(headers, { "Content-Type": "application/json" }),
    body: JSON.stringify(body)
  }, headers);
}

async function forwardOpsJson<T>(path: string, headers: HeaderBag): Promise<T> {
  return requestJson(`${opsServiceUrl}${path}`, {
    headers: buildForwardHeaders(headers)
  }, headers);
}

async function forwardOpsJsonWithBody<T>(path: string, headers: HeaderBag, body: unknown, method = "POST"): Promise<T> {
  return requestJson(`${opsServiceUrl}${path}`, {
    method,
    headers: buildForwardHeaders(headers, { "Content-Type": "application/json" }),
    body: JSON.stringify(body)
  }, headers);
}

async function forwardProductImportJson<T>(path: string, headers: HeaderBag): Promise<T> {
  return requestJson(`${productImportServiceUrl}${path}`, {
    headers: buildForwardHeaders(headers)
  }, headers);
}

async function forwardProductImportJsonWithBody<T>(path: string, headers: HeaderBag, body: unknown, method = "POST"): Promise<T> {
  return requestJson(`${productImportServiceUrl}${path}`, {
    method,
    headers: buildForwardHeaders(headers, { "Content-Type": "application/json" }),
    body: JSON.stringify(body)
  }, headers);
}

async function forwardMediaUpload<T>(path: string, headers: HeaderBag, file: UploadedMediaFile): Promise<T> {
  const formData = new FormData();
  const bytes = file.buffer.buffer.slice(file.buffer.byteOffset, file.buffer.byteOffset + file.buffer.byteLength) as ArrayBuffer;
  formData.append("file", new Blob([bytes], { type: file.mimetype }), file.originalname);

  return requestJson(`${mediaServiceUrl}${path}`, {
    method: "POST",
    headers: buildForwardHeaders(headers),
    body: formData
  }, headers);
}

async function forwardMediaJson<T>(path: string, headers: HeaderBag): Promise<T> {
  return requestJson(`${mediaServiceUrl}${path}`, {
    headers: buildForwardHeaders(headers)
  }, headers);
}

async function forwardMediaJsonWithBody<T>(path: string, headers: HeaderBag, body: unknown, method = "POST"): Promise<T> {
  return requestJson(`${mediaServiceUrl}${path}`, {
    method,
    headers: buildForwardHeaders(headers, { "Content-Type": "application/json" }),
    body: JSON.stringify(body)
  }, headers);
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

  @Get("/storefront/homepage")
  homepageLayout(@Headers() headers: HeaderBag) {
    return forwardStoreJson("/homepage-layout", headers);
  }

  @Get("/storefront/homepage/ready")
  homepageReady(@Headers() headers: HeaderBag) {
    return forwardStoreJson("/ready", headers);
  }

  @Put("/storefront/homepage")
  saveHomepageLayout(@Headers() headers: HeaderBag, @Body() body: unknown) {
    return forwardStoreJsonWithBody("/homepage-layout", headers, body);
  }

  @Get("/storefront/newsletter-subscriptions")
  newsletterSubscriptions(
    @Headers() headers: HeaderBag,
    @Query("page") page?: string,
    @Query("size") size?: string,
    @Query("status") status?: string,
    @Query("search") search?: string
  ) {
    const query = new URLSearchParams();
    if (page) query.set("page", page);
    if (size) query.set("size", size);
    if (status) query.set("status", status);
    if (search) query.set("search", search);
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return forwardStoreJson(`/newsletter-subscriptions${suffix}`, headers);
  }

  @Patch("/storefront/newsletter-subscriptions/:email")
  updateNewsletterSubscription(
    @Headers() headers: HeaderBag,
    @Param("email") email: string,
    @Body() body: unknown
  ) {
    return forwardStoreJsonWithBody(
      `/newsletter-subscriptions/${encodeURIComponent(email)}`,
      headers,
      body,
      "PATCH"
    );
  }

  @Get("/catalog/audit-events")
  catalogAuditEvents(@Headers() headers: HeaderBag) {
    return forwardJson("/audit-events", headers);
  }

  @Get("/orders")
  orders(@Headers() headers: HeaderBag, @Query() queryValues: Record<string, string | undefined>) {
    const query = new URLSearchParams();
    for (const key of [
      "page",
      "size",
      "search",
      "status",
      "paymentStatus",
      "dateFrom",
      "dateTo",
      "amountMinMinor",
      "amountMaxMinor"
    ]) {
      const value = queryValues[key];
      if (value) query.set(key, value);
    }
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return forwardOrderJson(`/orders${suffix}`, headers);
  }

  @Get("/orders/:id")
  orderDetail(@Headers() headers: HeaderBag, @Param("id") id: string) {
    return forwardOrderJson(`/orders/${id}`, headers);
  }

  @Post("/orders/:id/manual-compensation")
  manualOrderCompensation(@Headers() headers: HeaderBag, @Body() body: unknown, @Param("id") id: string) {
    return forwardOrderJsonWithBody(`/orders/${id}/manual-compensation`, headers, body);
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

  @Get("/inventory/audit-events")
  inventoryAuditEvents(@Headers() headers: HeaderBag) {
    return forwardInventoryJson("/inventory/audit-events", headers);
  }

  @Post("/inventory/items/:id/adjust")
  adjustInventoryItem(@Headers() headers: HeaderBag, @Body() body: unknown, @Param("id") id: string) {
    return forwardInventoryJsonWithBody(`/inventory/items/${id}/adjust`, headers, body);
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

  @Post("/payments/refunds")
  async refundPayment(@Headers() headers: HeaderBag, @Body() body: unknown) {
    try {
      const admin = await authorizeRefundRequest(headers);
      return forwardPaymentJsonWithBody("/payments/refunds", { ...headers, "x-admin-actor": admin.actorId }, body);
    } catch (error) {
      if (error instanceof RefundAuthorizationError) {
        throw new HttpException({ code: error.code, message: error.message }, error.status);
      }
      throw error;
    }
  }

  @Get("/payments/provider-health")
  paymentProviderHealth(@Headers() headers: HeaderBag) {
    return forwardPaymentJson("/health", headers);
  }

  @Get("/payments/paypal-configurations/:environment")
  async paypalConfiguration(@Headers() headers: HeaderBag, @Param("environment") environmentValue: string) {
    const environment = this.paypalEnvironment(environmentValue);
    try {
      const admin = await authorizePaymentConfigurationRequest(headers, environment, "read");
      return forwardPaymentJson(
        `/admin/paypal-configurations/${environment}`,
        { ...headers, "x-admin-actor": admin.actorId }
      );
    } catch (error) {
      this.throwAuthorizationError(error);
    }
  }

  @Put("/payments/paypal-configurations/:environment")
  async savePaypalConfiguration(
    @Headers() headers: HeaderBag,
    @Req() request: { ip?: string; socket?: { remoteAddress?: string } },
    @Param("environment") environmentValue: string,
    @Body() body: unknown
  ) {
    const environment = this.paypalEnvironment(environmentValue);
    try {
      const admin = await authorizePaymentConfigurationRequest(headers, environment, "write");
      return forwardPaymentJsonWithBody(
        `/admin/paypal-configurations/${environment}`,
        { ...headers, "x-admin-actor": admin.actorId, "x-admin-ip": adminRequestIp(request) },
        body,
        "PUT"
      );
    } catch (error) {
      this.throwAuthorizationError(error);
    }
  }

  @Post("/payments/paypal-configurations/:environment/test")
  async testPaypalConfiguration(
    @Headers() headers: HeaderBag,
    @Req() request: { ip?: string; socket?: { remoteAddress?: string } },
    @Param("environment") environmentValue: string,
    @Body() body: unknown
  ) {
    const environment = this.paypalEnvironment(environmentValue);
    try {
      const admin = await authorizePaymentConfigurationRequest(headers, environment, "read");
      return forwardPaymentJsonWithBody(
        `/admin/paypal-configurations/${environment}/test`,
        { ...headers, "x-admin-actor": admin.actorId, "x-admin-ip": adminRequestIp(request) },
        body
      );
    } catch (error) {
      this.throwAuthorizationError(error);
    }
  }

  @Get("/payments/refunds")
  recentPaymentRefunds(@Headers() headers: HeaderBag) {
    return forwardPaymentJson("/payments/refunds", headers);
  }

  @Get("/payments/webhooks")
  recentPaymentWebhooks(@Headers() headers: HeaderBag) {
    return forwardPaymentJson("/payments/webhooks", headers);
  }

  @Get("/customers")
  customers(@Headers() headers: HeaderBag) {
    return forwardAuthJson("/admin/customers", headers);
  }

  @Get("/payments/orders/:id/refunds")
  paymentRefunds(@Headers() headers: HeaderBag, @Param("id") id: string) {
    return forwardPaymentJson(`/payments/orders/${id}/refunds`, headers);
  }

  private paypalEnvironment(value: string): "sandbox" | "live" {
    if (value !== "sandbox" && value !== "live") {
      throw new HttpException({ code: ERROR_CODES.VALIDATION_FAILED, message: "PayPal environment must be sandbox or live." }, 400);
    }
    return value;
  }

  private throwAuthorizationError(error: unknown): never {
    if (error instanceof RefundAuthorizationError) {
      throw new HttpException({ code: error.code, message: error.message }, error.status);
    }
    throw error;
  }

  @Delete("/media/product-assets")
  deleteProductAsset(@Headers() headers: HeaderBag, @Body() body: unknown) {
    return forwardMediaJsonWithBody("/media/product-assets", headers, body, "DELETE");
  }

  @Get("/media/audit-events")
  mediaAuditEvents(@Headers() headers: HeaderBag) {
    return forwardMediaJson("/media/audit-events", headers);
  }

  @Get("/media/reconciliation-tasks")
  mediaReconciliationTasks(@Headers() headers: HeaderBag) {
    return forwardMediaJson("/media/reconciliation-tasks", headers);
  }

  @Post("/media/reconciliation-tasks/:id/retry")
  retryMediaReconciliation(@Headers() headers: HeaderBag, @Param("id") id: string, @Body() body: unknown) {
    return forwardMediaJsonWithBody(`/media/reconciliation-tasks/${encodeURIComponent(id)}/retry`, headers, body);
  }

  @Post("/media/reconciliation-tasks/:id/discard")
  discardMediaReconciliation(@Headers() headers: HeaderBag, @Param("id") id: string, @Body() body: unknown) {
    return forwardMediaJsonWithBody(`/media/reconciliation-tasks/${encodeURIComponent(id)}/discard`, headers, body);
  }

  @Get("/notification/email-accounts")
  notificationEmailAccounts(@Headers() headers: HeaderBag) {
    return forwardNotificationJson("/admin/notification/email-accounts", headers);
  }

  @Put("/notification/email-accounts")
  saveNotificationEmailAccounts(@Headers() headers: HeaderBag, @Body() body: unknown) {
    return forwardNotificationPutJson("/admin/notification/email-accounts", headers, body);
  }

  @Get("/notification/email-logs")
  notificationEmailLogs(@Headers() headers: HeaderBag) {
    return forwardNotificationJson("/admin/notification/email-logs", headers);
  }

  @Get("/notification/templates")
  notificationTemplates(@Headers() headers: HeaderBag) {
    return forwardNotificationJson("/admin/notification/templates", headers);
  }

  @Put("/notification/templates/:key")
  saveNotificationTemplate(@Headers() headers: HeaderBag, @Param("key") key: string, @Body() body: unknown) {
    return forwardNotificationPutJson(`/admin/notification/templates/${encodeURIComponent(key)}`, headers, body);
  }

  @Get("/logistics/api-accounts")
  logisticsApiAccounts(@Headers() headers: HeaderBag) {
    return forwardLogisticsJson("/admin/logistics/api-accounts", headers);
  }

  @Put("/logistics/api-accounts")
  updateLogisticsApiAccounts(@Headers() headers: HeaderBag, @Body() body: unknown) {
    return forwardLogisticsJsonWithBody("/admin/logistics/api-accounts", headers, body, "PUT");
  }

  @Get("/logistics/api-call-logs")
  logisticsApiCallLogs(@Headers() headers: HeaderBag) {
    return forwardLogisticsJson("/admin/logistics/api-call-logs", headers);
  }

  @Get("/logistics/tracking/:trackingNumber")
  logisticsTracking(@Headers() headers: HeaderBag, @Param("trackingNumber") trackingNumber: string) {
    return forwardLogisticsJson(`/tracking/${encodeURIComponent(trackingNumber)}`, headers);
  }

  @Post("/logistics/tracking/refresh")
  refreshLogisticsTracking(@Headers() headers: HeaderBag, @Body() body: unknown) {
    return forwardLogisticsJsonWithBody("/tracking/refresh", headers, body);
  }

  @Post("/logistics/send-update-email")
  sendLogisticsUpdateEmail(@Headers() headers: HeaderBag, @Body() body: unknown) {
    return forwardLogisticsJsonWithBody("/admin/logistics/send-update-email", headers, body);
  }

  @Get("/reviews")
  reviews(@Headers() headers: HeaderBag) {
    return forwardReviewJson("/admin/reviews", headers);
  }

  @Put("/reviews/:id")
  updateReview(@Headers() headers: HeaderBag, @Param("id") id: string, @Body() body: unknown) {
    return forwardReviewJsonWithBody(`/admin/reviews/${encodeURIComponent(id)}`, headers, body);
  }

  @Get("/ops/settings")
  opsSettings(@Headers() headers: HeaderBag) {
    return forwardOpsJson("/settings", headers);
  }

  @Put("/ops/settings")
  saveOpsSettings(@Headers() headers: HeaderBag, @Body() body: unknown) {
    return forwardOpsJsonWithBody("/settings", headers, body, "PUT");
  }

  @Post("/ops/actions/:action")
  runOpsAction(@Headers() headers: HeaderBag, @Param("action") action: string, @Body() body: unknown) {
    return forwardOpsJsonWithBody(`/actions/${encodeURIComponent(action)}`, headers, body);
  }

  @Get("/ops/audit-events")
  opsAuditEvents(@Headers() headers: HeaderBag) {
    return forwardOpsJson("/audit-events", headers);
  }

  @Get("/product-import/config")
  productImportConfig(@Headers() headers: HeaderBag) {
    return forwardProductImportJson("/config", headers);
  }

  @Put("/product-import/config")
  saveProductImportConfig(@Headers() headers: HeaderBag, @Body() body: unknown) {
    return forwardProductImportJsonWithBody("/config", headers, body, "PUT");
  }

  @Get("/product-import/imports")
  productImportTasks(
    @Headers() headers: HeaderBag,
    @Query("page") page: string | undefined,
    @Query("size") size: string | undefined,
    @Query("status") status: string | undefined,
    @Query("search") search: string | undefined
  ) {
    const params = new URLSearchParams();
    if (page) params.set("page", page);
    if (size) params.set("size", size);
    if (status) params.set("status", status);
    if (search) params.set("search", search);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return forwardProductImportJson(`/imports${suffix}`, headers);
  }

  @Post("/product-import/imports")
  createProductImportTasks(@Headers() headers: HeaderBag, @Body() body: unknown) {
    return forwardProductImportJsonWithBody("/imports", headers, body);
  }

  @Put("/product-import/imports/:id/draft")
  updateProductImportDraft(@Headers() headers: HeaderBag, @Param("id") id: string, @Body() body: unknown) {
    return forwardProductImportJsonWithBody(`/imports/${encodeURIComponent(id)}/draft`, headers, body, "PUT");
  }

  @Post("/product-import/imports/:id/generate")
  generateProductImportDraft(@Headers() headers: HeaderBag, @Param("id") id: string) {
    return forwardProductImportJsonWithBody(`/imports/${encodeURIComponent(id)}/generate`, headers, {});
  }

  @Post("/product-import/imports/:id/publish")
  publishProductImportDraft(@Headers() headers: HeaderBag, @Param("id") id: string) {
    return forwardProductImportJsonWithBody(`/imports/${encodeURIComponent(id)}/publish`, headers, {});
  }

  @Get("/product-import/audit-events")
  productImportAuditEvents(@Headers() headers: HeaderBag) {
    return forwardProductImportJson("/audit-events", headers);
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
  async saveProducts(@Headers() headers: HeaderBag, @Body() body: unknown) {
    let result: unknown;

    try {
      result = await forwardJsonWithBody("/products", headers, body);
    } catch (error) {
      if (shouldCompensateCatalogFailure(error)) {
        await Promise.allSettled(
          pendingProductMediaObjects(body).map((asset) =>
            forwardMediaJsonWithBody("/media/product-assets", headers, {
              assetId: asset.assetId,
              objectKey: asset.objectKey,
              reason: "Catalog binding rejected; uploaded object compensated"
            }, "DELETE")
          )
        );
      } else if (shouldReconcileCatalogFailure(error)) {
        await Promise.all(
          pendingProductMediaAssets(body).map((asset) =>
            forwardMediaJsonWithBody("/media/reconciliation-tasks", headers, {
              assetId: asset.assetId,
              objectKeys: asset.objectKeys,
              reason: "Catalog write outcome uncertain"
            })
          )
        );
      }
      throw error;
    }

    await Promise.all(
      removedProductMediaObjects(body).map((asset) =>
        forwardMediaJsonWithBody("/media/product-assets", headers, {
          assetId: asset.assetId,
          objectKey: asset.objectKey,
          reason: "Catalog binding removed; media object deleted"
        }, "DELETE")
      )
    );
    return result;
  }
}

@Module({ controllers: [HealthController] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true, credentials: true });
  await app.listen(Number(process.env.PORT ?? 4001), "0.0.0.0");
}

void bootstrap();
