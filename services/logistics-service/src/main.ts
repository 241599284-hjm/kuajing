import "reflect-metadata";
import { BadRequestException, Body, Controller, Get, Headers, Injectable, Module, Param, Post, Put, ServiceUnavailableException } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ERROR_CODES } from "@commerce/error-codes";
import { assertStoreContext } from "@commerce/store-context";
import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;

type HeaderBag = Record<string, string | string[] | undefined>;
type StorageMode = "postgres" | "memory";
type TrackingStatus = "pre_transit" | "in_transit" | "customs" | "out_for_delivery" | "delivered" | "exception" | "not_found";

type LogisticsAccount = {
  id: string;
  provider: string;
  accountName: string;
  apiEndpoint: string | null;
  apiKeySecret?: string | null;
  apiKeyMasked: string | null;
  monthlyLimit: number;
  usedCount: number;
  status: "active" | "quota_exhausted" | "disabled";
  sortOrder: number;
  resetAt: string | null;
};

type TrackingEvent = {
  occurredAt: string;
  status: TrackingStatus;
  location: string;
  descriptionEn: string;
  descriptionZh: string;
};

type TrackingRecord = {
  trackingNumber: string;
  carrier: string;
  status: TrackingStatus;
  statusLabel: {
    en: string;
    zh: string;
  };
  events: TrackingEvent[];
  provider: string;
  providerMode: "mock" | "external";
  cachedAt: string;
  expiresAt: string | null;
  terminal: boolean;
  storageMode: StorageMode;
};

type CallLog = {
  id: string;
  trackingNumber: string;
  provider: string;
  accountName: string;
  status: string;
  errorSummary: string | null;
  consumedQuota: boolean;
  correlationId: string;
  createdAt: string;
};

type AccountInput = {
  id?: string;
  provider?: string;
  accountName?: string;
  apiEndpoint?: string | null;
  apiKey?: string | null;
  monthlyLimit?: number;
  usedCount?: number;
  status?: LogisticsAccount["status"];
  sortOrder?: number;
};

const databaseUrl = process.env.LOGISTICS_DATABASE_URL;
const notificationServiceUrl = process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:4111";
const cacheMinutes = Number(process.env.LOGISTICS_TRANSIT_CACHE_MINUTES ?? 45);
const defaultCorrelationId = "local-logistics-correlation";
const inMemoryAccounts = new Map<string, LogisticsAccount>();
const inMemoryCache = new Map<string, TrackingRecord>();
const inMemoryLogs: CallLog[] = [];
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;

function validationFailed(message: string, details?: unknown): BadRequestException {
  return new BadRequestException({
    code: ERROR_CODES.VALIDATION_FAILED,
    message,
    ...(details === undefined ? {} : { details })
  });
}

function providerUnavailable(message: string, details?: unknown): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: ERROR_CODES.PROVIDER_UNAVAILABLE,
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

function headerValue(headers: HeaderBag, name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function createContext(headers: HeaderBag) {
  return assertStoreContext({
    storeId: process.env.DEFAULT_STORE_ID ?? "00000000-0000-4000-8000-000000000001",
    region: process.env.DEFAULT_STORE_REGION ?? "local",
    timezone: process.env.DEFAULT_STORE_TIMEZONE ?? "Asia/Hong_Kong",
    correlationId: headerValue(headers, "x-correlation-id") ?? defaultCorrelationId
  });
}

function normalizeTrackingNumber(value: string) {
  const normalized = value.trim().replace(/\s+/g, "").toUpperCase();

  if (!/^[A-Z0-9-]{6,48}$/.test(normalized)) {
    throw validationFailed("tracking number is invalid", { field: "trackingNumber", minLength: 6, maxLength: 48 });
  }

  return normalized;
}

function statusLabel(status: TrackingStatus) {
  const labels: Record<TrackingStatus, { en: string; zh: string }> = {
    pre_transit: { en: "Label created", zh: "已创建面单" },
    in_transit: { en: "In transit", zh: "运输中" },
    customs: { en: "Customs clearance", zh: "清关中" },
    out_for_delivery: { en: "Out for delivery", zh: "派送中" },
    delivered: { en: "Delivered", zh: "已签收" },
    exception: { en: "Exception", zh: "异常" },
    not_found: { en: "No tracking information", zh: "暂无物流信息" }
  };

  return labels[status];
}

function isTerminal(status: TrackingStatus) {
  return status === "delivered" || status === "exception" || status === "not_found";
}

function nextExpiry(status: TrackingStatus) {
  if (isTerminal(status)) return null;
  return new Date(Date.now() + cacheMinutes * 60 * 1000).toISOString();
}

function maskSecret(secret: string | null | undefined) {
  if (!secret) return null;
  if (secret.length <= 8) return "****";
  return `${secret.slice(0, 4)}****${secret.slice(-4)}`;
}

function accountFromInput(input: AccountInput, index: number): LogisticsAccount {
  const provider = (input.provider ?? "mock").trim().toLowerCase();
  const accountName = (input.accountName ?? `${provider}-account`).trim();
  const status = input.status ?? "active";

  if (!accountName) {
    throw validationFailed("accountName is required", { field: "accountName" });
  }

  if (!["active", "quota_exhausted", "disabled"].includes(status)) {
    throw validationFailed("account status is invalid", { field: "status", allowed: ["active", "quota_exhausted", "disabled"] });
  }

  return {
    id: input.id ?? randomUUID(),
    provider,
    accountName,
    apiEndpoint: input.apiEndpoint ?? null,
    apiKeySecret: input.apiKey ?? null,
    apiKeyMasked: maskSecret(input.apiKey ?? null),
    monthlyLimit: Math.max(0, Math.floor(input.monthlyLimit ?? 40)),
    usedCount: Math.max(0, Math.floor(input.usedCount ?? 0)),
    status,
    sortOrder: Math.floor(input.sortOrder ?? index),
    resetAt: null
  };
}

function defaultMockAccount(): LogisticsAccount {
  return {
    id: "00000000-0000-4000-8000-000000000901",
    provider: "mock",
    accountName: "Local Mock Logistics",
    apiEndpoint: null,
    apiKeyMasked: null,
    monthlyLimit: 999999,
    usedCount: 0,
    status: "active",
    sortOrder: 0,
    resetAt: null
  };
}

function mockTracking(trackingNumber: string, account: LogisticsAccount): TrackingRecord {
  const now = Date.now();
  const delivered = /[02468]$/.test(trackingNumber);
  const status: TrackingStatus = delivered ? "delivered" : "in_transit";
  const label = statusLabel(status);
  const events: TrackingEvent[] = [
    {
      occurredAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
      status: "pre_transit",
      location: "Shenzhen, CN",
      descriptionEn: "Shipping label created by merchant.",
      descriptionZh: "商家已创建发货面单。"
    },
    {
      occurredAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
      status: "in_transit",
      location: "Hong Kong, CN",
      descriptionEn: "Parcel departed export facility.",
      descriptionZh: "包裹已离开发出口岸。"
    },
    {
      occurredAt: new Date(now - 12 * 60 * 60 * 1000).toISOString(),
      status,
      location: delivered ? "Los Angeles, US" : "International hub",
      descriptionEn: delivered ? "Parcel delivered to recipient." : "Parcel is moving through the international network.",
      descriptionZh: delivered ? "包裹已签收。" : "包裹正在国际运输网络中转。"
    }
  ];

  return {
    trackingNumber,
    carrier: "Mock Express",
    status,
    statusLabel: label,
    events,
    provider: account.provider,
    providerMode: "mock",
    cachedAt: new Date(now).toISOString(),
    expiresAt: nextExpiry(status),
    terminal: isTerminal(status),
    storageMode: "memory"
  };
}

@Injectable()
class LogisticsRepository {
  async storageMode(): Promise<StorageMode> {
    if (!pool) return "memory";

    try {
      await pool.query("SELECT 1");
      return "postgres";
    } catch {
      return "memory";
    }
  }

  async listAccounts(): Promise<{ accounts: LogisticsAccount[]; storageMode: StorageMode }> {
    if (!pool) {
      return { accounts: [...inMemoryAccounts.values()].sort((a, b) => a.sortOrder - b.sortOrder), storageMode: "memory" };
    }

    try {
      const result = await pool.query<{
        id: string;
        provider: string;
        account_name: string;
        api_endpoint: string | null;
        api_key_secret: string | null;
        monthly_limit: number;
        used_count: number;
        status: LogisticsAccount["status"];
        sort_order: number;
        reset_at: Date | null;
      }>(
        `
          SELECT id, provider, account_name, api_endpoint, api_key_secret, monthly_limit, used_count, status, sort_order, reset_at
          FROM logistics_api_accounts
          ORDER BY sort_order ASC, created_at ASC
        `
      );

      return {
        accounts: result.rows.map((row) => ({
          id: row.id,
          provider: row.provider,
          accountName: row.account_name,
          apiEndpoint: row.api_endpoint,
          apiKeyMasked: maskSecret(row.api_key_secret),
          monthlyLimit: row.monthly_limit,
          usedCount: row.used_count,
          status: row.status,
          sortOrder: row.sort_order,
          resetAt: row.reset_at?.toISOString() ?? null
        })),
        storageMode: "postgres"
      };
    } catch {
      return { accounts: [...inMemoryAccounts.values()].sort((a, b) => a.sortOrder - b.sortOrder), storageMode: "memory" };
    }
  }

  async replaceAccounts(inputs: AccountInput[]) {
    const accounts = inputs.map((input, index) => accountFromInput(input, index));

    if (!pool) {
      inMemoryAccounts.clear();
      for (const account of accounts) inMemoryAccounts.set(account.id, account);
      return { accounts, storageMode: "memory" as StorageMode };
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM logistics_api_accounts");

      for (const account of accounts) {
        await client.query(
          `
            INSERT INTO logistics_api_accounts (
              id, provider, account_name, api_endpoint, api_key_secret, monthly_limit, used_count, status, sort_order, reset_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `,
          [
            account.id,
            account.provider,
            account.accountName,
            account.apiEndpoint,
            account.apiKeySecret ?? null,
            account.monthlyLimit,
            account.usedCount,
            account.status,
            account.sortOrder,
            account.resetAt
          ]
        );
      }

      await client.query("COMMIT");
      return { accounts: accounts.map(({ apiKeySecret: _secret, ...account }) => account), storageMode: "postgres" as StorageMode };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getCached(trackingNumber: string): Promise<TrackingRecord | null> {
    const memory = inMemoryCache.get(trackingNumber);

    if (memory && (memory.terminal || !memory.expiresAt || new Date(memory.expiresAt).getTime() > Date.now())) {
      return memory;
    }

    if (!pool) return null;

    try {
      const result = await pool.query<{
        tracking_number: string;
        carrier: string;
        status: TrackingStatus;
        status_label_en: string;
        status_label_zh: string;
        events_json: TrackingEvent[];
        provider: string;
        provider_mode: "mock" | "external";
        cached_at: Date;
        expires_at: Date | null;
        terminal: boolean;
      }>(
        `
          SELECT tracking_number, carrier, status, status_label_en, status_label_zh, events_json, provider, provider_mode, cached_at, expires_at, terminal
          FROM logistics_tracking_cache
          WHERE tracking_number = $1
        `,
        [trackingNumber]
      );
      const row = result.rows[0];

      if (!row) return null;

      const record: TrackingRecord = {
        trackingNumber: row.tracking_number,
        carrier: row.carrier,
        status: row.status,
        statusLabel: { en: row.status_label_en, zh: row.status_label_zh },
        events: row.events_json,
        provider: row.provider,
        providerMode: row.provider_mode,
        cachedAt: row.cached_at.toISOString(),
        expiresAt: row.expires_at?.toISOString() ?? null,
        terminal: row.terminal,
        storageMode: "postgres"
      };

      if (record.terminal || !record.expiresAt || new Date(record.expiresAt).getTime() > Date.now()) {
        return record;
      }

      return null;
    } catch {
      return null;
    }
  }

  async saveCache(record: TrackingRecord) {
    inMemoryCache.set(record.trackingNumber, record);

    if (!pool) return;

    try {
      await pool.query(
        `
          INSERT INTO logistics_tracking_cache (
            tracking_number, carrier, status, status_label_en, status_label_zh, events_json,
            provider, provider_mode, cached_at, expires_at, terminal
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11)
          ON CONFLICT (tracking_number)
          DO UPDATE SET
            carrier = EXCLUDED.carrier,
            status = EXCLUDED.status,
            status_label_en = EXCLUDED.status_label_en,
            status_label_zh = EXCLUDED.status_label_zh,
            events_json = EXCLUDED.events_json,
            provider = EXCLUDED.provider,
            provider_mode = EXCLUDED.provider_mode,
            cached_at = EXCLUDED.cached_at,
            expires_at = EXCLUDED.expires_at,
            terminal = EXCLUDED.terminal
        `,
        [
          record.trackingNumber,
          record.carrier,
          record.status,
          record.statusLabel.en,
          record.statusLabel.zh,
          JSON.stringify(record.events),
          record.provider,
          record.providerMode,
          record.cachedAt,
          record.expiresAt,
          record.terminal
        ]
      );
    } catch {
      // Cache persistence must not break the customer-facing query response.
    }
  }

  async addLog(log: Omit<CallLog, "id" | "createdAt">) {
    const next: CallLog = { ...log, id: randomUUID(), createdAt: new Date().toISOString() };
    inMemoryLogs.unshift(next);

    if (!pool) return next;

    try {
      await pool.query(
        `
          INSERT INTO logistics_api_call_logs (
            id, tracking_number, provider, account_name, status, error_summary, consumed_quota, correlation_id, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          next.id,
          next.trackingNumber,
          next.provider,
          next.accountName,
          next.status,
          next.errorSummary,
          next.consumedQuota,
          next.correlationId,
          next.createdAt
        ]
      );
    } catch {
      // Keep in-memory log as fallback.
    }

    return next;
  }

  async listLogs(): Promise<{ logs: CallLog[]; storageMode: StorageMode }> {
    if (!pool) return { logs: inMemoryLogs.slice(0, 100), storageMode: "memory" };

    try {
      const result = await pool.query<{
        id: string;
        tracking_number: string;
        provider: string;
        account_name: string;
        status: string;
        error_summary: string | null;
        consumed_quota: boolean;
        correlation_id: string;
        created_at: Date;
      }>(
        `
          SELECT id, tracking_number, provider, account_name, status, error_summary, consumed_quota, correlation_id, created_at
          FROM logistics_api_call_logs
          ORDER BY created_at DESC
          LIMIT 100
        `
      );

      return {
        logs: result.rows.map((row) => ({
          id: row.id,
          trackingNumber: row.tracking_number,
          provider: row.provider,
          accountName: row.account_name,
          status: row.status,
          errorSummary: row.error_summary,
          consumedQuota: row.consumed_quota,
          correlationId: row.correlation_id,
          createdAt: row.created_at.toISOString()
        })),
        storageMode: "postgres"
      };
    } catch {
      return { logs: inMemoryLogs.slice(0, 100), storageMode: "memory" };
    }
  }
}

@Injectable()
class LogisticsService {
  constructor(private readonly repository: LogisticsRepository) {}

  async query(headers: HeaderBag, rawTrackingNumber: string, forceRefresh = false) {
    const ctx = createContext(headers);
    const trackingNumber = normalizeTrackingNumber(rawTrackingNumber);

    if (!forceRefresh) {
      const cached = await this.repository.getCached(trackingNumber);

      if (cached) {
        return { ...cached, source: "cache" };
      }
    }

    const accountResult = await this.repository.listAccounts();
    const availableAccounts = (accountResult.accounts.length > 0 ? accountResult.accounts : [defaultMockAccount()])
      .filter((account) => account.status === "active" && account.usedCount < account.monthlyLimit)
      .sort((left, right) => left.sortOrder - right.sortOrder);

    for (const account of availableAccounts) {
      if (account.provider !== "mock") {
        await this.repository.addLog({
          trackingNumber,
          provider: account.provider,
          accountName: account.accountName,
          status: "skipped",
          errorSummary: "External provider adapter is not configured in local build",
          consumedQuota: false,
          correlationId: ctx.correlationId
        });
        continue;
      }

      const record = { ...mockTracking(trackingNumber, account), storageMode: accountResult.storageMode };
      await this.repository.saveCache(record);
      await this.repository.addLog({
        trackingNumber,
        provider: account.provider,
        accountName: account.accountName,
        status: "success",
        errorSummary: null,
        consumedQuota: false,
        correlationId: ctx.correlationId
      });

      return { ...record, source: "provider" };
    }

    await this.repository.addLog({
      trackingNumber,
      provider: "none",
      accountName: "none",
      status: "failed",
      errorSummary: "No available logistics provider account",
      consumedQuota: false,
      correlationId: ctx.correlationId
    });

    throw providerUnavailable("No available logistics provider account", { trackingNumber });
  }

  async sendUpdateEmail(headers: HeaderBag, body: Record<string, unknown>) {
    const ctx = createContext(headers);
    const to = typeof body.to === "string" ? body.to.trim() : "";
    const trackingNumber = typeof body.trackingNumber === "string" ? normalizeTrackingNumber(body.trackingNumber) : "";

    if (!to || !trackingNumber) {
      throw validationFailed("to and trackingNumber are required", { fields: ["to", "trackingNumber"] });
    }

    const response = await fetch(`${notificationServiceUrl}/emails/transactional`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-correlation-id": ctx.correlationId
      },
      body: JSON.stringify({
        to,
        templateKey: "shipping_notice",
        idempotencyKey: `logistics-update-${trackingNumber}-${to}`,
        variables: {
          brandName: process.env.STOREFRONT_BRAND_NAME ?? "Demo Teaware",
          name: body.name ?? "Customer",
          orderNumber: body.orderNumber ?? "N/A",
          trackingNumber,
          carrier: body.carrier ?? "Carrier pending",
          trackingUrl: body.trackingUrl ?? `${process.env.STOREFRONT_PUBLIC_URL ?? "http://localhost:3000"}/track-order?trackingNumber=${encodeURIComponent(trackingNumber)}`,
          locale: body.locale ?? "en"
        }
      })
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw dependencyUnavailable("notification service rejected logistics update email", {
        status: response.status,
        response: payload
      });
    }

    return payload;
  }
}

@Controller()
class LogisticsController {
  constructor(
    private readonly repository: LogisticsRepository,
    private readonly logisticsService: LogisticsService
  ) {}

  @Get("/health")
  health() {
    return { service: "logistics-service", status: "ok" };
  }

  @Get("/ready")
  async ready() {
    const storageMode = await this.repository.storageMode();
    return {
      service: "logistics-service",
      status: storageMode === "postgres" ? "ready" : "degraded",
      storageMode
    };
  }

  @Get("/tracking/:trackingNumber")
  tracking(@Headers() headers: HeaderBag, @Param("trackingNumber") trackingNumber: string) {
    return this.logisticsService.query(headers, trackingNumber);
  }

  @Post("/tracking/refresh")
  refreshTracking(@Headers() headers: HeaderBag, @Body() body: Record<string, unknown>) {
    if (typeof body.trackingNumber !== "string") {
      throw validationFailed("trackingNumber is required", { field: "trackingNumber" });
    }

    return this.logisticsService.query(headers, body.trackingNumber, true);
  }

  @Get("/admin/logistics/api-accounts")
  async apiAccounts() {
    return this.repository.listAccounts();
  }

  @Put("/admin/logistics/api-accounts")
  async replaceAccounts(@Body() body: { accounts?: AccountInput[] }) {
    return this.repository.replaceAccounts(body.accounts ?? []);
  }

  @Get("/admin/logistics/api-call-logs")
  apiCallLogs() {
    return this.repository.listLogs();
  }

  @Post("/admin/logistics/send-update-email")
  sendUpdateEmail(@Headers() headers: HeaderBag, @Body() body: Record<string, unknown>) {
    return this.logisticsService.sendUpdateEmail(headers, body);
  }
}

@Module({
  controllers: [LogisticsController],
  providers: [LogisticsRepository, LogisticsService]
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  await app.listen(Number(process.env.PORT ?? 4110), "0.0.0.0");
}

void bootstrap();
