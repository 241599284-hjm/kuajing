import "reflect-metadata";
import { Body, Controller, Get, Headers, Injectable, Module, Param, Post, Put } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { assertStoreContext } from "@commerce/store-context";
import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;

type HeaderBag = Record<string, string | string[] | undefined>;
type StorageMode = "postgres" | "memory";
type OpsSettings = {
  ssl: {
    domain: string;
    issuer: "lets_encrypt";
    forceHttps: boolean;
    expiresAt: string | null;
    autoRenew: boolean;
    lastCheckAt: string | null;
  };
  cdn: {
    provider: "cloudflare_free";
    enabled: boolean;
    cacheHitRate: number;
    realIpHeaderEnabled: boolean;
    attackProtectionEnabled: boolean;
    noCachePaths: string[];
  };
  analytics: {
    ga4MeasurementId: string;
    gscVerificationCode: string;
    enabled: boolean;
    anonymizeIp: boolean;
    ecommerceEventsEnabled: boolean;
  };
};
type AuditEvent = {
  id: string;
  action: string;
  actor: string;
  summary: string;
  details: unknown;
  correlationId: string;
  createdAt: string;
};

const databaseUrl = process.env.OPS_DATABASE_URL;
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
const defaultCorrelationId = "local-ops-correlation";
let memorySettings: OpsSettings = defaultSettings();
const memoryAuditEvents: AuditEvent[] = [];

function defaultSettings(): OpsSettings {
  return {
    ssl: {
      domain: "[WEBSITE_DOMAIN]",
      issuer: "lets_encrypt",
      forceHttps: true,
      expiresAt: null,
      autoRenew: true,
      lastCheckAt: null
    },
    cdn: {
      provider: "cloudflare_free",
      enabled: false,
      cacheHitRate: 0,
      realIpHeaderEnabled: true,
      attackProtectionEnabled: true,
      noCachePaths: ["/api/*", "/admin/*", "/checkout", "/payment-result", "/track-order", "/products/*/reviews"]
    },
    analytics: {
      ga4MeasurementId: "",
      gscVerificationCode: "",
      enabled: false,
      anonymizeIp: true,
      ecommerceEventsEnabled: true
    }
  };
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

function cleanString(value: unknown, fallback: string) {
  return typeof value === "string" ? value.trim() : fallback;
}

function cleanBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function cleanNoCachePaths(value: unknown) {
  if (!Array.isArray(value)) return defaultSettings().cdn.noCachePaths;
  return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 100);
}

function normalizeSettings(input: unknown): OpsSettings {
  const current = defaultSettings();
  const value = typeof input === "object" && input !== null ? input as Partial<OpsSettings> : {};
  const ssl: Partial<OpsSettings["ssl"]> = typeof value.ssl === "object" && value.ssl !== null ? value.ssl : {};
  const cdn: Partial<OpsSettings["cdn"]> = typeof value.cdn === "object" && value.cdn !== null ? value.cdn : {};
  const analytics: Partial<OpsSettings["analytics"]> =
    typeof value.analytics === "object" && value.analytics !== null ? value.analytics : {};

  return {
    ssl: {
      domain: cleanString(ssl.domain, current.ssl.domain),
      issuer: "lets_encrypt",
      forceHttps: cleanBoolean(ssl.forceHttps, current.ssl.forceHttps),
      expiresAt: cleanString(ssl.expiresAt, "") || null,
      autoRenew: cleanBoolean(ssl.autoRenew, current.ssl.autoRenew),
      lastCheckAt: cleanString(ssl.lastCheckAt, "") || null
    },
    cdn: {
      provider: "cloudflare_free",
      enabled: cleanBoolean(cdn.enabled, current.cdn.enabled),
      cacheHitRate: Math.max(0, Math.min(100, Number(cdn.cacheHitRate ?? current.cdn.cacheHitRate))),
      realIpHeaderEnabled: cleanBoolean(cdn.realIpHeaderEnabled, current.cdn.realIpHeaderEnabled),
      attackProtectionEnabled: cleanBoolean(cdn.attackProtectionEnabled, current.cdn.attackProtectionEnabled),
      noCachePaths: cleanNoCachePaths(cdn.noCachePaths)
    },
    analytics: {
      ga4MeasurementId: cleanString(analytics.ga4MeasurementId, current.analytics.ga4MeasurementId),
      gscVerificationCode: cleanString(analytics.gscVerificationCode, current.analytics.gscVerificationCode),
      enabled: cleanBoolean(analytics.enabled, current.analytics.enabled),
      anonymizeIp: cleanBoolean(analytics.anonymizeIp, current.analytics.anonymizeIp),
      ecommerceEventsEnabled: cleanBoolean(analytics.ecommerceEventsEnabled, current.analytics.ecommerceEventsEnabled)
    }
  };
}

function actorFromHeaders(headers: HeaderBag) {
  return headerValue(headers, "x-admin-actor") ?? "local-admin";
}

@Injectable()
class OpsRepository {
  async settings(): Promise<{ settings: OpsSettings; storageMode: StorageMode }> {
    if (!pool) return { settings: memorySettings, storageMode: "memory" };

    try {
      const result = await pool.query<{ settings: OpsSettings }>(
        "select settings from ops_settings where id = 'default' limit 1"
      );
      if (result.rowCount === 0) {
        const settings = defaultSettings();
        await pool.query("insert into ops_settings (id, settings) values ('default', $1)", [settings]);
        return { settings, storageMode: "postgres" };
      }
      return { settings: normalizeSettings(result.rows[0].settings), storageMode: "postgres" };
    } catch {
      return { settings: memorySettings, storageMode: "memory" };
    }
  }

  async saveSettings(settings: OpsSettings, event: AuditEvent): Promise<StorageMode> {
    if (!pool) {
      memorySettings = settings;
      memoryAuditEvents.unshift(event);
      return "memory";
    }

    try {
      await pool.query(
        `insert into ops_settings (id, settings, updated_at)
         values ('default', $1, now())
         on conflict (id) do update set settings = excluded.settings, updated_at = now()`,
        [settings]
      );
      await this.recordAudit(event);
      return "postgres";
    } catch {
      memorySettings = settings;
      memoryAuditEvents.unshift(event);
      return "memory";
    }
  }

  async recordAudit(event: AuditEvent) {
    if (!pool) {
      memoryAuditEvents.unshift(event);
      return "memory" as const;
    }

    try {
      await pool.query(
        `insert into ops_audit_events (id, action, actor, summary, details, correlation_id, created_at)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [event.id, event.action, event.actor, event.summary, event.details, event.correlationId, event.createdAt]
      );
      return "postgres" as const;
    } catch {
      memoryAuditEvents.unshift(event);
      return "memory" as const;
    }
  }

  async auditEvents(limit = 50): Promise<{ events: AuditEvent[]; storageMode: StorageMode }> {
    if (!pool) return { events: memoryAuditEvents.slice(0, limit), storageMode: "memory" };

    try {
      const result = await pool.query<{
        id: string;
        action: string;
        actor: string;
        summary: string;
        details: unknown;
        correlation_id: string;
        created_at: Date;
      }>(
        `select id, action, actor, summary, details, correlation_id, created_at
         from ops_audit_events
         order by created_at desc
         limit $1`,
        [limit]
      );
      return {
        storageMode: "postgres",
        events: result.rows.map((row) => ({
          id: row.id,
          action: row.action,
          actor: row.actor,
          summary: row.summary,
          details: row.details,
          correlationId: row.correlation_id,
          createdAt: row.created_at.toISOString()
        }))
      };
    } catch {
      return { events: memoryAuditEvents.slice(0, limit), storageMode: "memory" };
    }
  }
}

function auditEvent(action: string, actor: string, summary: string, details: unknown, correlationId: string): AuditEvent {
  return {
    id: randomUUID(),
    action,
    actor,
    summary,
    details,
    correlationId,
    createdAt: new Date().toISOString()
  };
}

@Controller()
class OpsController {
  constructor(private readonly repository: OpsRepository) {}

  @Get("/health")
  health() {
    return { service: "ops-service", status: "ok" };
  }

  @Get("/ready")
  async ready() {
    if (!pool) return { service: "ops-service", status: "degraded", postgres: "not_configured" };
    try {
      await pool.query("select 1");
      return { service: "ops-service", status: "ready", postgres: "ok" };
    } catch {
      return { service: "ops-service", status: "degraded", postgres: "unavailable" };
    }
  }

  @Get("/settings")
  settings() {
    return this.repository.settings();
  }

  @Put("/settings")
  async save(@Headers() headers: HeaderBag, @Body() body: unknown) {
    const context = createContext(headers);
    const settings = normalizeSettings(body);
    const event = auditEvent(
      "ops.settings.update",
      actorFromHeaders(headers),
      "更新 SSL / CDN / 统计配置",
      settings,
      context.correlationId
    );
    const storageMode = await this.repository.saveSettings(settings, event);
    return { settings, storageMode };
  }

  @Post("/actions/:action")
  async action(@Headers() headers: HeaderBag, @Param("action") action: string, @Body() body: unknown) {
    const context = createContext(headers);
    const allowedActions = new Set(["ssl-renew", "http-scan", "cdn-purge-all", "cdn-purge-path", "analytics-test"]);
    const normalizedAction = action.trim().toLowerCase();
    const summary = allowedActions.has(normalizedAction)
      ? `已记录 ${normalizedAction} 运维动作，真实云 API 执行器待接入。`
      : `拒绝未知运维动作：${normalizedAction}`;

    const event = auditEvent(
      `ops.action.${normalizedAction}`,
      actorFromHeaders(headers),
      summary,
      body,
      context.correlationId
    );
    const storageMode = await this.repository.recordAudit(event);

    return {
      action: normalizedAction,
      accepted: allowedActions.has(normalizedAction),
      message: summary,
      storageMode
    };
  }

  @Get("/audit-events")
  auditEvents() {
    return this.repository.auditEvents();
  }
}

@Module({ controllers: [OpsController], providers: [OpsRepository] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  await app.listen(Number(process.env.PORT ?? 4113), "0.0.0.0");
}

void bootstrap();
