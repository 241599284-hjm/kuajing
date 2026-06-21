import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";
import type { StoreContext } from "@commerce/store-context";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { PayPalProvider, PayPalProviderError } from "./paypal-provider.js";

export type PayPalEnvironment = "sandbox" | "live";

const PAYPAL_BASE_URLS: Record<PayPalEnvironment, string> = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com"
};

export const PAYPAL_WEBHOOK_EVENTS = [
  "CHECKOUT.ORDER.APPROVED",
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.REFUNDED",
  "PAYMENT.REFUND.PENDING",
  "PAYMENT.REFUND.FAILED"
] as const;

type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

export type StoredPayPalConfiguration = {
  storeId: string;
  environment: PayPalEnvironment;
  clientId: string;
  secretCiphertext: string;
  secretIv: string;
  secretAuthTag: string;
  webhookId: string | null;
  webhookEvents: string[];
  enabled: boolean;
  updatedBy: string;
  updatedAt: Date;
  lastTestedAt: Date | null;
  lastTestStatus: "succeeded" | "failed" | null;
  lastTestErrorCode: string | null;
};

export type PayPalConfigurationView = {
  environment: PayPalEnvironment;
  clientId: string;
  secretConfigured: boolean;
  webhookId: string;
  webhookEvents: string[];
  enabled: boolean;
  updatedBy: string;
  updatedAt: string;
  lastTestedAt: string | null;
  lastTestStatus: "succeeded" | "failed" | null;
  lastTestErrorCode: string | null;
};

export class PayPalConfigurationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "PayPalConfigurationError";
  }
}

function encryptionKey(value: string) {
  let key: Buffer;
  try {
    key = Buffer.from(value, "base64");
  } catch {
    throw new PayPalConfigurationError("PAYPAL_ENCRYPTION_KEY_INVALID", "Payment configuration encryption key is invalid.");
  }
  if (!value || key.length !== 32 || key.toString("base64") !== value) {
    throw new PayPalConfigurationError(
      "PAYPAL_ENCRYPTION_KEY_INVALID",
      "Payment configuration encryption key must be a canonical base64-encoded 32-byte key."
    );
  }
  return key;
}

export function encryptPayPalSecret(secret: string, keyValue: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(keyValue), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64")
  };
}

export function decryptPayPalSecret(secret: EncryptedSecret, keyValue: string) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(keyValue),
    Buffer.from(secret.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(secret.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
}

export function normalizePayPalEnvironment(value: unknown): PayPalEnvironment {
  if (value !== "sandbox" && value !== "live") {
    throw new PayPalConfigurationError("PAYPAL_ENVIRONMENT_INVALID", "PayPal environment must be sandbox or live.");
  }
  return value;
}

export function normalizePayPalConfigurationUpdate(value: unknown) {
  const body = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  const clientSecret = typeof body.clientSecret === "string" && body.clientSecret.trim()
    ? body.clientSecret.trim()
    : undefined;
  const webhookId = typeof body.webhookId === "string" && body.webhookId.trim()
    ? body.webhookId.trim()
    : undefined;
  const webhookEvents = Array.isArray(body.webhookEvents)
    ? [...new Set(body.webhookEvents.map((event) => typeof event === "string" ? event.trim() : ""))]
    : [];
  const enabled = body.enabled === undefined ? true : body.enabled;

  if (!clientId || clientId.length > 500) {
    throw new PayPalConfigurationError("PAYPAL_CONFIG_INVALID", "PayPal Client ID is required and must not exceed 500 characters.");
  }
  if (clientSecret && clientSecret.length > 4000) {
    throw new PayPalConfigurationError("PAYPAL_CONFIG_INVALID", "PayPal Secret must not exceed 4000 characters.");
  }
  if (webhookId && webhookId.length > 500) {
    throw new PayPalConfigurationError("PAYPAL_CONFIG_INVALID", "PayPal Webhook ID must not exceed 500 characters.");
  }
  if (typeof enabled !== "boolean") {
    throw new PayPalConfigurationError("PAYPAL_CONFIG_INVALID", "PayPal enabled must be a boolean.");
  }
  if (webhookEvents.some((event) => !PAYPAL_WEBHOOK_EVENTS.includes(event as typeof PAYPAL_WEBHOOK_EVENTS[number]))) {
    throw new PayPalConfigurationError("PAYPAL_CONFIG_INVALID", "PayPal webhook event is not supported.");
  }
  return { clientId, clientSecret, webhookId, webhookEvents, enabled };
}

export function toPayPalConfigurationView(config: StoredPayPalConfiguration): PayPalConfigurationView {
  return {
    environment: config.environment,
    clientId: config.clientId,
    secretConfigured: Boolean(config.secretCiphertext && config.secretIv && config.secretAuthTag),
    webhookId: config.webhookId ?? "",
    webhookEvents: [...config.webhookEvents],
    enabled: config.enabled,
    updatedBy: config.updatedBy,
    updatedAt: config.updatedAt.toISOString(),
    lastTestedAt: config.lastTestedAt?.toISOString() ?? null,
    lastTestStatus: config.lastTestStatus,
    lastTestErrorCode: config.lastTestErrorCode
  };
}

type ConfigurationRow = {
  store_id: string;
  environment: PayPalEnvironment;
  client_id: string;
  secret_ciphertext: string;
  secret_iv: string;
  secret_auth_tag: string;
  webhook_id: string | null;
  webhook_events: string[];
  enabled: boolean;
  updated_by: string;
  updated_at: Date;
  last_tested_at: Date | null;
  last_test_status: "succeeded" | "failed" | null;
  last_test_error_code: string | null;
};

function mapRow(row: ConfigurationRow): StoredPayPalConfiguration {
  return {
    storeId: row.store_id,
    environment: row.environment,
    clientId: row.client_id,
    secretCiphertext: row.secret_ciphertext,
    secretIv: row.secret_iv,
    secretAuthTag: row.secret_auth_tag,
    webhookId: row.webhook_id,
    webhookEvents: row.webhook_events,
    enabled: row.enabled,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
    lastTestedAt: row.last_tested_at,
    lastTestStatus: row.last_test_status,
    lastTestErrorCode: row.last_test_error_code
  };
}

@Injectable()
export class PayPalConfigurationRepository implements OnApplicationShutdown {
  private readonly pool = new Pool({
    connectionString: process.env.ORDER_DATABASE_URL ?? "postgres://commerce:commerce@localhost:5432/order_db",
    connectionTimeoutMillis: 800
  });

  async get(storeId: string, environment: PayPalEnvironment): Promise<StoredPayPalConfiguration | null> {
    const result = await this.pool.query<ConfigurationRow>(
      `SELECT store_id, environment, client_id, secret_ciphertext, secret_iv, secret_auth_tag,
              webhook_id, webhook_events, enabled, updated_by, updated_at,
              last_tested_at, last_test_status, last_test_error_code
       FROM paypal_configurations
       WHERE store_id = $1 AND environment = $2`,
      [storeId, environment]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async save(input: {
    storeId: string;
    environment: PayPalEnvironment;
    clientId: string;
    encryptedSecret: EncryptedSecret;
    secretChanged: boolean;
    webhookId?: string;
    webhookEvents: string[];
    enabled: boolean;
    actorId: string;
    actorIp: string;
    correlationId: string;
  }): Promise<StoredPayPalConfiguration> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<ConfigurationRow>(
        `INSERT INTO paypal_configurations (
           store_id, environment, client_id, secret_ciphertext, secret_iv, secret_auth_tag,
           webhook_id, webhook_events, enabled, updated_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
         ON CONFLICT (store_id, environment) DO UPDATE SET
           client_id = EXCLUDED.client_id,
           secret_ciphertext = EXCLUDED.secret_ciphertext,
           secret_iv = EXCLUDED.secret_iv,
           secret_auth_tag = EXCLUDED.secret_auth_tag,
           webhook_id = EXCLUDED.webhook_id,
           webhook_events = EXCLUDED.webhook_events,
           enabled = EXCLUDED.enabled,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()
         RETURNING store_id, environment, client_id, secret_ciphertext, secret_iv, secret_auth_tag,
                   webhook_id, webhook_events, enabled, updated_by, updated_at,
                   last_tested_at, last_test_status, last_test_error_code`,
        [
          input.storeId,
          input.environment,
          input.clientId,
          input.encryptedSecret.ciphertext,
          input.encryptedSecret.iv,
          input.encryptedSecret.authTag,
          input.webhookId ?? null,
          JSON.stringify(input.webhookEvents),
          input.enabled,
          input.actorId
        ]
      );
      if (!result.rows[0]) throw new Error("PayPal configuration was not saved.");
      await this.audit(client, {
        storeId: input.storeId,
        environment: input.environment,
        action: "updated",
        actorId: input.actorId,
        actorIp: input.actorIp,
        correlationId: input.correlationId,
        details: {
          changedFields: [
            "clientId",
            ...(input.secretChanged ? ["clientSecret"] : []),
            "webhookId",
            "webhookEvents",
            "enabled"
          ]
        }
      });
      await client.query("COMMIT");
      return mapRow(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async recordTest(input: {
    storeId: string;
    environment: PayPalEnvironment;
    status: "succeeded" | "failed";
    errorCode?: string;
    actorId: string;
    actorIp: string;
    correlationId: string;
  }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE paypal_configurations
         SET last_tested_at = now(), last_test_status = $3, last_test_error_code = $4
         WHERE store_id = $1 AND environment = $2`,
        [input.storeId, input.environment, input.status, input.errorCode ?? null]
      );
      await this.audit(client, {
        storeId: input.storeId,
        environment: input.environment,
        action: "connectivity_tested",
        actorId: input.actorId,
        actorIp: input.actorIp,
        correlationId: input.correlationId,
        details: { status: input.status, errorCode: input.errorCode ?? null }
      });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private audit(client: PoolClient, input: {
    storeId: string;
    environment: PayPalEnvironment;
    action: string;
    actorId: string;
    actorIp: string;
    correlationId: string;
    details: Record<string, unknown>;
  }) {
    return client.query(
      `INSERT INTO paypal_configuration_audit_events (
         id, store_id, environment, action, actor_id, actor_ip, correlation_id, details
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        randomUUID(),
        input.storeId,
        input.environment,
        input.action,
        input.actorId,
        input.actorIp,
        input.correlationId,
        JSON.stringify(input.details)
      ]
    );
  }

  async onApplicationShutdown() {
    await this.pool.end();
  }
}

@Injectable()
export class PayPalConfigurationService {
  private readonly encryptionKeyValue = process.env.PAYMENT_CONFIG_ENCRYPTION_KEY ?? "";
  private readonly timeoutMs = Number(process.env.PAYPAL_TIMEOUT_MS ?? 5000);

  constructor(
    @Inject(PayPalConfigurationRepository)
    private readonly repository: PayPalConfigurationRepository
  ) {}

  async getView(storeId: string, environment: PayPalEnvironment) {
    const config = await this.repository.get(storeId, environment);
    return config ? toPayPalConfigurationView(config) : {
      environment,
      clientId: "",
      secretConfigured: false,
      webhookId: "",
      webhookEvents: [...PAYPAL_WEBHOOK_EVENTS],
      enabled: true,
      updatedBy: "",
      updatedAt: "",
      lastTestedAt: null,
      lastTestStatus: null,
      lastTestErrorCode: null
    } satisfies PayPalConfigurationView;
  }

  async save(input: {
    storeId: string;
    environment: PayPalEnvironment;
    body: unknown;
    actorId: string;
    actorIp: string;
    correlationId: string;
  }) {
    const update = normalizePayPalConfigurationUpdate(input.body);
    const existing = await this.repository.get(input.storeId, input.environment);
    if (!existing && !update.clientSecret) {
      throw new PayPalConfigurationError("PAYPAL_SECRET_REQUIRED", "PayPal Secret is required for the first save.");
    }
    const encryptedSecret = update.clientSecret
      ? encryptPayPalSecret(update.clientSecret, this.encryptionKeyValue)
      : {
          ciphertext: existing!.secretCiphertext,
          iv: existing!.secretIv,
          authTag: existing!.secretAuthTag
        };
    const saved = await this.repository.save({
      storeId: input.storeId,
      environment: input.environment,
      clientId: update.clientId,
      encryptedSecret,
      secretChanged: Boolean(update.clientSecret),
      webhookId: update.webhookId,
      webhookEvents: update.webhookEvents,
      enabled: update.enabled,
      actorId: input.actorId,
      actorIp: input.actorIp,
      correlationId: input.correlationId
    });
    return toPayPalConfigurationView(saved);
  }

  async test(input: {
    store: StoreContext;
    environment: PayPalEnvironment;
    actorId: string;
    actorIp: string;
    includeWebhook?: boolean;
  }) {
    try {
      const provider = await this.createProvider(input.store.storeId, input.environment, false);
      const health = input.includeWebhook
        ? await provider.webhookHealthCheck(input.store)
        : await provider.healthCheck(input.store);
      await this.repository.recordTest({
        storeId: input.store.storeId,
        environment: input.environment,
        status: "succeeded",
        actorId: input.actorId,
        actorIp: input.actorIp,
        correlationId: input.store.correlationId
      });
      return { environment: input.environment, status: health.status, checkedAt: health.checkedAt };
    } catch (error) {
      await this.repository.recordTest({
        storeId: input.store.storeId,
        environment: input.environment,
        status: "failed",
        errorCode: error instanceof PayPalConfigurationError || error instanceof PayPalProviderError
          ? error.code
          : "PAYPAL_CONNECTIVITY_FAILED",
        actorId: input.actorId,
        actorIp: input.actorIp,
        correlationId: input.store.correlationId
      }).catch(() => undefined);
      throw error;
    }
  }

  async createProvider(storeId: string, environment: PayPalEnvironment, allowEnvironmentFallback = true) {
    const config = await this.repository.get(storeId, environment);
    if (config) {
      if (!config.enabled) {
        throw new PayPalConfigurationError("PAYPAL_CONFIG_DISABLED", `PayPal ${environment} configuration is disabled.`);
      }
      return new PayPalProvider({
        clientId: config.clientId,
        clientSecret: decryptPayPalSecret({
          ciphertext: config.secretCiphertext,
          iv: config.secretIv,
          authTag: config.secretAuthTag
        }, this.encryptionKeyValue),
        webhookId: config.webhookId ?? undefined,
        baseUrl: PAYPAL_BASE_URLS[environment],
        timeoutMs: this.timeoutMs
      });
    }
    if (!allowEnvironmentFallback) {
      throw new PayPalConfigurationError("PAYPAL_CONFIG_MISSING", `PayPal ${environment} configuration has not been saved.`);
    }
    return new PayPalProvider({
      clientId: process.env.PAYPAL_CLIENT_ID ?? "",
      clientSecret: process.env.PAYPAL_CLIENT_SECRET ?? "",
      webhookId: process.env.PAYPAL_WEBHOOK_ID,
      baseUrl: PAYPAL_BASE_URLS[environment],
      timeoutMs: this.timeoutMs
    });
  }
}
