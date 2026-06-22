import { createHash } from "node:crypto";

export const shipmentStatuses = [
  "shipped",
  "in_transit",
  "customs",
  "out_for_delivery",
  "delivered",
  "exception"
] as const;

export type ShipmentStatus = typeof shipmentStatuses[number];

export type CreateShipmentInput = {
  orderId: string;
  orderNumber: string;
  carrierCode: string;
  carrierName: string;
  trackingNumber: string;
  status: "shipped";
  actorId: string;
  idempotencyKey: string;
  reason: string;
};

export type ShipmentStatusUpdateInput = {
  status: ShipmentStatus;
  reason: string;
  location: string;
  actorId: string;
};

export class FulfillmentValidationError extends Error {}
export class FulfillmentConflictError extends Error {}

function requiredText(value: unknown, field: string, maxLength: number) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new FulfillmentValidationError(`${field} is required`);
  if (normalized.length > maxLength) throw new FulfillmentValidationError(`${field} must not exceed ${maxLength} characters`);
  return normalized;
}

export function normalizeCreateShipment(input: Record<string, unknown>): CreateShipmentInput {
  const orderId = requiredText(input.orderId, "orderId", 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
    throw new FulfillmentValidationError("orderId must be a UUID");
  }
  const trackingNumber = requiredText(input.trackingNumber, "trackingNumber", 48).replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z0-9-]{6,48}$/.test(trackingNumber)) {
    throw new FulfillmentValidationError("trackingNumber is invalid");
  }
  return {
    orderId,
    orderNumber: requiredText(input.orderNumber, "orderNumber", 80),
    carrierCode: requiredText(input.carrierCode, "carrierCode", 32).toUpperCase(),
    carrierName: requiredText(input.carrierName, "carrierName", 100),
    trackingNumber,
    status: "shipped",
    actorId: requiredText(input.actorId, "actorId", 120),
    idempotencyKey: requiredText(input.idempotencyKey, "idempotencyKey", 200),
    reason: requiredText(input.reason, "reason", 500)
  };
}

export function normalizeShipmentStatusUpdate(input: Record<string, unknown>): ShipmentStatusUpdateInput {
  const status = requiredText(input.status, "status", 32).toLowerCase() as ShipmentStatus;
  if (!shipmentStatuses.includes(status)) throw new FulfillmentValidationError("status is invalid");
  return {
    status,
    reason: requiredText(input.reason, "reason", 500),
    location: typeof input.location === "string" ? input.location.trim().slice(0, 200) : "",
    actorId: requiredText(input.actorId, "actorId", 120)
  };
}

const allowedTransitions: Record<ShipmentStatus, ShipmentStatus[]> = {
  shipped: ["in_transit", "customs", "out_for_delivery", "delivered", "exception"],
  in_transit: ["customs", "out_for_delivery", "delivered", "exception"],
  customs: ["in_transit", "out_for_delivery", "delivered", "exception"],
  out_for_delivery: ["delivered", "exception"],
  delivered: [],
  exception: ["in_transit", "customs", "out_for_delivery", "delivered"]
};

export function assertShipmentTransition(current: ShipmentStatus, next: ShipmentStatus) {
  if (current === next) return;
  if (!allowedTransitions[current]?.includes(next)) {
    throw new FulfillmentConflictError(`shipment cannot transition from ${current} to ${next}`);
  }
}

export function shipmentRequestHash(input: CreateShipmentInput) {
  return createHash("sha256").update(JSON.stringify({
    orderId: input.orderId,
    orderNumber: input.orderNumber,
    carrierCode: input.carrierCode,
    carrierName: input.carrierName,
    trackingNumber: input.trackingNumber,
    status: input.status,
    reason: input.reason
  })).digest("hex");
}

export function shipmentStatusRequestHash(input: ShipmentStatusUpdateInput) {
  return createHash("sha256").update(JSON.stringify({
    status: input.status,
    reason: input.reason,
    location: input.location
  })).digest("hex");
}

export function notificationIdempotencyKey(
  value: unknown,
  trackingNumber: string,
  recipient: string
) {
  const trusted = typeof value === "string" ? value.trim().slice(0, 200) : "";
  return trusted || `logistics-update-${trackingNumber}-${recipient}`.slice(0, 200);
}
