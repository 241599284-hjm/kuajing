export type ReconciliationStep = "resolved_bound" | "confirm_unbound" | "cleanup";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function nextReconciliationStep(input: { bound: boolean; unboundObservations: number }): ReconciliationStep {
  if (input.bound) return "resolved_bound";
  return input.unboundObservations > 0 ? "cleanup" : "confirm_unbound";
}

export function reconciliationRetryDelayMs(attempt: number): number {
  const normalizedAttempt = Number.isInteger(attempt) && attempt > 0 ? attempt : 1;
  return Math.min(5_000 * (2 ** (normalizedAttempt - 1)), 300_000);
}

export function normalizeReconciliationRequest(
  storeId: string,
  body: unknown
): { assetId: string; objectKeys: string[] } {
  if (typeof body !== "object" || body === null) throw new Error("media reconciliation request is required");
  const assetId = "assetId" in body && typeof body.assetId === "string" ? body.assetId.trim() : "";
  const rawObjectKeys = "objectKeys" in body && Array.isArray(body.objectKeys) ? body.objectKeys : [];

  if (!uuidPattern.test(assetId)) throw new Error("media reconciliation assetId must be a UUID");
  if (rawObjectKeys.length < 1 || rawObjectKeys.length > 20) {
    throw new Error("media reconciliation objectKeys must contain between 1 and 20 items");
  }

  const objectKeys = [...new Set(rawObjectKeys.map((value) => typeof value === "string" ? value.trim() : ""))];
  for (const objectKey of objectKeys) {
    if (!objectKey || objectKey.includes("..") || objectKey.includes("\\")) {
      throw new Error("media reconciliation object key is invalid");
    }
    if (!objectKey.startsWith(`${storeId}/product-media/`)) {
      throw new Error("media reconciliation object key does not belong to this store");
    }
  }

  return { assetId, objectKeys };
}

export type ManualReconciliationAction = "retry" | "discard";

export function normalizeReconciliationAction(input: {
  taskId: unknown;
  actorId: unknown;
  decisionNote: unknown;
  idempotencyKey: unknown;
}): { taskId: string; actorId: string; decisionNote: string; idempotencyKey: string } {
  const taskId = typeof input.taskId === "string" ? input.taskId.trim() : "";
  const actorId = typeof input.actorId === "string" ? input.actorId.trim() : "";
  const decisionNote = typeof input.decisionNote === "string" ? input.decisionNote.trim() : "";
  const idempotencyKey = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";

  if (!uuidPattern.test(taskId)) throw new Error("media reconciliation taskId must be a UUID");
  if (actorId.length < 1 || actorId.length > 100) throw new Error("media reconciliation actorId must contain 1 to 100 characters");
  if (decisionNote.length < 3 || decisionNote.length > 500) throw new Error("media reconciliation decisionNote must contain 3 to 500 characters");
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) throw new Error("media reconciliation idempotency key must contain 8 to 200 characters");

  return { taskId, actorId, decisionNote, idempotencyKey };
}

export function manualReconciliationTarget(
  status: string,
  action: ManualReconciliationAction
): "pending" | "discarded" {
  if (status !== "failed") throw new Error("only failed media reconciliation tasks can be handled manually");
  return action === "retry" ? "pending" : "discarded";
}
