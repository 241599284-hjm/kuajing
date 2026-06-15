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
  companyCredentials: {
    alertEmail: string;
    reminderDays: number;
    documents: CompanyCredentialDocument[];
  };
};
type CompanyCredentialDocument = {
  key: "business_license" | "import_export_right" | "customs_registration" | "corporate_bank_account";
  nameZh: string;
  referenceNumber: string;
  issuer: string;
  holderName: string;
  expiresAt: string | null;
  attachmentUrls: string[];
  notes: string;
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
const notificationServiceUrl = process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:4111";
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
    },
    companyCredentials: {
      alertEmail: process.env.OPS_ALERT_EMAIL ?? "",
      reminderDays: 30,
      documents: [
        defaultCompanyCredential("business_license", "营业执照"),
        defaultCompanyCredential("import_export_right", "进出口权"),
        defaultCompanyCredential("customs_registration", "海关备案"),
        defaultCompanyCredential("corporate_bank_account", "企业对公账户")
      ]
    }
  };
}

function defaultCompanyCredential(key: CompanyCredentialDocument["key"], nameZh: string): CompanyCredentialDocument {
  return {
    key,
    nameZh,
    referenceNumber: "",
    issuer: "",
    holderName: "",
    expiresAt: null,
    attachmentUrls: [],
    notes: ""
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

function cleanAttachmentUrls(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 20);
}

function htmlEscape(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[char] ?? char;
  });
}

function cleanCompanyDocuments(value: unknown): CompanyCredentialDocument[] {
  const defaults = defaultSettings().companyCredentials.documents;
  const documents = Array.isArray(value) ? value : [];
  const allowedKeys = new Set(defaults.map((document) => document.key));
  const byKey = new Map<string, Partial<CompanyCredentialDocument>>();

  for (const document of documents) {
    if (typeof document !== "object" || document === null) continue;
    const candidate = document as Partial<CompanyCredentialDocument>;
    if (!candidate.key || !allowedKeys.has(candidate.key)) continue;
    byKey.set(candidate.key, candidate);
  }

  return defaults.map((fallback) => {
    const input = byKey.get(fallback.key) ?? {};
    return {
      key: fallback.key,
      nameZh: cleanString(input.nameZh, fallback.nameZh),
      referenceNumber: cleanString(input.referenceNumber, ""),
      issuer: cleanString(input.issuer, ""),
      holderName: cleanString(input.holderName, ""),
      expiresAt: cleanString(input.expiresAt, "") || null,
      attachmentUrls: cleanAttachmentUrls(input.attachmentUrls),
      notes: cleanString(input.notes, "")
    };
  });
}

function normalizeSettings(input: unknown): OpsSettings {
  const current = defaultSettings();
  const value = typeof input === "object" && input !== null ? input as Partial<OpsSettings> : {};
  const ssl: Partial<OpsSettings["ssl"]> = typeof value.ssl === "object" && value.ssl !== null ? value.ssl : {};
  const cdn: Partial<OpsSettings["cdn"]> = typeof value.cdn === "object" && value.cdn !== null ? value.cdn : {};
  const analytics: Partial<OpsSettings["analytics"]> =
    typeof value.analytics === "object" && value.analytics !== null ? value.analytics : {};
  const companyCredentials: Partial<OpsSettings["companyCredentials"]> =
    typeof value.companyCredentials === "object" && value.companyCredentials !== null ? value.companyCredentials : {};

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
    },
    companyCredentials: {
      alertEmail: cleanString(companyCredentials.alertEmail, current.companyCredentials.alertEmail),
      reminderDays: Math.max(1, Math.min(365, Number(companyCredentials.reminderDays ?? current.companyCredentials.reminderDays))),
      documents: cleanCompanyDocuments(companyCredentials.documents)
    }
  };
}

function actorFromHeaders(headers: HeaderBag) {
  return headerValue(headers, "x-admin-actor") ?? "local-admin";
}

function expiringCompanyCredentials(settings: OpsSettings) {
  const now = Date.now();
  const maxTime = now + settings.companyCredentials.reminderDays * 24 * 60 * 60 * 1000;

  return settings.companyCredentials.documents.filter((document) => {
    if (!document.expiresAt) return false;
    const expiresAt = new Date(document.expiresAt).getTime();
    return Number.isFinite(expiresAt) && expiresAt >= now && expiresAt <= maxTime;
  });
}

async function sendCompanyCredentialReminder(context: ReturnType<typeof createContext>, settings: OpsSettings, documents: CompanyCredentialDocument[]) {
  if (!settings.companyCredentials.alertEmail || documents.length === 0) {
    return { attempted: false, status: "skipped", reason: "missing alert email or no expiring credentials" };
  }

  const response = await fetch(`${notificationServiceUrl}/emails/transactional`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-correlation-id": context.correlationId
    },
    body: JSON.stringify({
      to: settings.companyCredentials.alertEmail,
      templateKey: "company_credential_expiry",
      idempotencyKey: `company-credential-expiry:${new Date().toISOString().slice(0, 10)}`,
      variables: {
        brandName: process.env.STOREFRONT_BRAND_NAME ?? "Demo Teaware",
        reminderDays: settings.companyCredentials.reminderDays,
        credentialSummaryText: documents.map((document) => `${document.nameZh}: ${document.expiresAt ?? "N/A"}`).join("; "),
        credentialSummaryHtml: documents
          .map((document) => `<li>${htmlEscape(document.nameZh)}: ${htmlEscape(document.expiresAt ?? "N/A")}</li>`)
          .join(""),
        locale: "en"
      }
    })
  });
  const payload = await response.json().catch(() => ({}));
  return { attempted: true, status: response.ok ? "sent" : "failed", payload };
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
    const allowedActions = new Set(["ssl-renew", "http-scan", "cdn-purge-all", "cdn-purge-path", "analytics-test", "credential-expiry-scan"]);
    const normalizedAction = action.trim().toLowerCase();
    let summary = allowedActions.has(normalizedAction)
      ? `已记录 ${normalizedAction} 运维动作，真实云 API 执行器待接入。`
      : `拒绝未知运维动作：${normalizedAction}`;
    let details = body;

    if (normalizedAction === "credential-expiry-scan") {
      const { settings } = await this.repository.settings();
      const expiring = expiringCompanyCredentials(settings);
      let reminder: unknown = { attempted: false };
      try {
        reminder = await sendCompanyCredentialReminder(context, settings, expiring);
      } catch (error) {
        reminder = { attempted: true, status: "failed", message: error instanceof Error ? error.message : "unknown notification error" };
      }
      summary = expiring.length > 0
        ? `发现 ${expiring.length} 项企业资质将在 ${settings.companyCredentials.reminderDays} 天内到期。`
        : "未发现即将到期的企业资质。";
      details = { requested: body, expiring, reminder };
    }

    const event = auditEvent(
      `ops.action.${normalizedAction}`,
      actorFromHeaders(headers),
      summary,
      details,
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
