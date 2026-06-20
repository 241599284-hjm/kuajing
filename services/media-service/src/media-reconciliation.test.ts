import { describe, expect, it } from "vitest";

describe("media reconciliation policy", () => {
  it("preserves bound media and requires two unbound observations before cleanup", async () => {
    const modulePath = "./media-reconciliation.js";
    const policy = await import(modulePath).catch(() => null) as null | {
      nextReconciliationStep(input: { bound: boolean; unboundObservations: number }): string;
    };

    expect(policy).not.toBeNull();
    if (!policy) return;

    expect(policy.nextReconciliationStep({ bound: true, unboundObservations: 0 })).toBe("resolved_bound");
    expect(policy.nextReconciliationStep({ bound: false, unboundObservations: 0 })).toBe("confirm_unbound");
    expect(policy.nextReconciliationStep({ bound: false, unboundObservations: 1 })).toBe("cleanup");
  });

  it("uses bounded exponential retry delays", async () => {
    const modulePath = "./media-reconciliation.js";
    const policy = await import(modulePath).catch(() => null) as null | {
      reconciliationRetryDelayMs(attempt: number): number;
    };

    expect(policy).not.toBeNull();
    if (!policy) return;

    expect([1, 2, 3, 10].map(policy.reconciliationRetryDelayMs)).toEqual([5_000, 10_000, 20_000, 300_000]);
  });

  it("validates and deduplicates store-owned reconciliation objects", async () => {
    const modulePath = "./media-reconciliation.js";
    const policy = await import(modulePath) as {
      normalizeReconciliationRequest(storeId: string, body: unknown): { assetId: string; objectKeys: string[] };
    };
    const storeId = "00000000-0000-4000-8000-000000000001";
    const assetId = "00000000-0000-4000-8000-000000030001";
    const objectKey = `${storeId}/product-media/image/2026-06/source.png`;

    expect((policy as unknown as Record<string, unknown>).normalizeReconciliationRequest).toBeTypeOf("function");
    expect(policy.normalizeReconciliationRequest(storeId, { assetId, objectKeys: [objectKey, objectKey] })).toEqual({
      assetId,
      objectKeys: [objectKey]
    });
    expect(() => policy.normalizeReconciliationRequest(storeId, {
      assetId,
      objectKeys: ["another-store/product-media/image/source.png"]
    })).toThrow("media reconciliation object key does not belong to this store");
  });

  it("validates manual action identity, idempotency, and decision note", async () => {
    const modulePath = "./media-reconciliation.js";
    const policy = await import(modulePath) as Record<string, unknown>;
    const normalizeReconciliationAction = policy.normalizeReconciliationAction;
    expect(normalizeReconciliationAction).toBeTypeOf("function");
    if (typeof normalizeReconciliationAction !== "function") return;

    const taskId = "00000000-0000-4000-8000-000000030001";
    expect(normalizeReconciliationAction({
      taskId,
      actorId: "admin-ui",
      decisionNote: "确认 Catalog 已恢复，重新执行对账",
      idempotencyKey: "retry-0001"
    })).toEqual({
      taskId,
      actorId: "admin-ui",
      decisionNote: "确认 Catalog 已恢复，重新执行对账",
      idempotencyKey: "retry-0001"
    });
    expect(() => normalizeReconciliationAction({
      taskId,
      actorId: "",
      decisionNote: "x",
      idempotencyKey: "short"
    })).toThrow();
  });

  it("allows manual actions only from failed tasks", async () => {
    const modulePath = "./media-reconciliation.js";
    const policy = await import(modulePath) as Record<string, unknown>;
    const manualReconciliationTarget = policy.manualReconciliationTarget;
    expect(manualReconciliationTarget).toBeTypeOf("function");
    if (typeof manualReconciliationTarget !== "function") return;

    expect(manualReconciliationTarget("failed", "retry")).toBe("pending");
    expect(manualReconciliationTarget("failed", "discard")).toBe("discarded");
    expect(() => manualReconciliationTarget("cleaned", "retry")).toThrow("only failed media reconciliation tasks can be handled manually");
  });
});
