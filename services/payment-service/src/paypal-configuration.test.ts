import { describe, expect, it, vi } from "vitest";
import {
  decryptPayPalSecret,
  encryptPayPalSecret,
  normalizePayPalConfigurationUpdate,
  normalizePayPalEnvironment,
  PayPalConfigurationService,
  toPayPalConfigurationView
} from "./paypal-configuration.js";

const encryptionKey = Buffer.alloc(32, 7).toString("base64");

describe("PayPal configuration security", () => {
  it("encrypts secrets with authenticated encryption and detects tampering", () => {
    const encrypted = encryptPayPalSecret("sandbox-secret", encryptionKey);

    expect(JSON.stringify(encrypted)).not.toContain("sandbox-secret");
    expect(decryptPayPalSecret(encrypted, encryptionKey)).toBe("sandbox-secret");
    expect(() => decryptPayPalSecret({
      ...encrypted,
      ciphertext: `${encrypted.ciphertext.slice(0, -2)}AA`
    }, encryptionKey)).toThrow();
  });

  it("never exposes encrypted secret material in the admin view", () => {
    const view = toPayPalConfigurationView({
      storeId: "00000000-0000-4000-8000-000000000001",
      environment: "sandbox",
      clientId: "client-id",
      secretCiphertext: "ciphertext",
      secretIv: "iv",
      secretAuthTag: "tag",
      webhookId: "WH-1",
      webhookEvents: ["PAYMENT.CAPTURE.COMPLETED"],
      enabled: true,
      updatedBy: "admin-1",
      updatedAt: new Date("2026-06-21T00:00:00.000Z"),
      lastTestedAt: null,
      lastTestStatus: null,
      lastTestErrorCode: null
    });

    expect(view).toMatchObject({
      environment: "sandbox",
      clientId: "client-id",
      secretConfigured: true
    });
    expect(JSON.stringify(view)).not.toContain("ciphertext");
    expect(JSON.stringify(view)).not.toContain("secretAuthTag");
  });
});

describe("PayPal configuration validation", () => {
  it.each(["sandbox", "live"] as const)("accepts the %s environment", (environment) => {
    expect(normalizePayPalEnvironment(environment)).toBe(environment);
  });

  it("rejects unknown environments and unsupported webhook events", () => {
    expect(() => normalizePayPalEnvironment("production")).toThrow();
    expect(() => normalizePayPalConfigurationUpdate({
      clientId: "client-id",
      clientSecret: "secret",
      webhookEvents: ["PAYMENT.UNKNOWN"]
    })).toThrow();
  });

  it("trims supported fields and allows preserving an existing secret", () => {
    expect(normalizePayPalConfigurationUpdate({
      clientId: " client-id ",
      webhookId: " WH-1 ",
      webhookEvents: ["PAYMENT.CAPTURE.COMPLETED"],
      enabled: true
    })).toEqual({
      clientId: "client-id",
      clientSecret: undefined,
      webhookId: "WH-1",
      webhookEvents: ["PAYMENT.CAPTURE.COMPLETED"],
      enabled: true
    });
  });
});

describe("PayPalConfigurationService", () => {
  it("reuses existing encrypted secret fields when an update omits the Secret", async () => {
    process.env.PAYMENT_CONFIG_ENCRYPTION_KEY = encryptionKey;
    const existing = {
      storeId: "00000000-0000-4000-8000-000000000001",
      environment: "sandbox" as const,
      clientId: "old-client",
      secretCiphertext: "existing-ciphertext",
      secretIv: "existing-iv",
      secretAuthTag: "existing-tag",
      webhookId: null,
      webhookEvents: [],
      enabled: true,
      updatedBy: "admin-1",
      updatedAt: new Date(),
      lastTestedAt: null,
      lastTestStatus: null,
      lastTestErrorCode: null
    };
    const repository = {
      get: vi.fn().mockResolvedValue(existing),
      save: vi.fn().mockImplementation(async (input) => ({ ...existing, clientId: input.clientId }))
    };
    const service = new PayPalConfigurationService(repository as never);

    await service.save({
      storeId: existing.storeId,
      environment: "sandbox",
      body: { clientId: "new-client", webhookEvents: [], enabled: true },
      actorId: "admin-1",
      actorIp: "127.0.0.1",
      correlationId: "config-update"
    });

    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
      encryptedSecret: {
        ciphertext: "existing-ciphertext",
        iv: "existing-iv",
        authTag: "existing-tag"
      },
      secretChanged: false
    }));
  });
});
