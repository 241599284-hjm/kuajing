import { describe, expect, it } from "vitest";
import {
  assertShipmentTransition,
  FulfillmentConflictError,
  notificationIdempotencyKey,
  normalizeCreateShipment,
  normalizeShipmentStatusUpdate,
  shipmentRequestHash,
  shipmentStatusRequestHash
} from "./fulfillment.js";

describe("shipment fulfillment domain", () => {
  it("normalizes a trusted shipment creation request", () => {
    expect(normalizeCreateShipment({
      orderId: "11111111-1111-4111-8111-111111111111",
      orderNumber: " ORD-1001 ",
      carrierCode: " dhl ",
      carrierName: " DHL Express ",
      trackingNumber: " jd 014 600 003 ",
      actorId: "admin-1",
      idempotencyKey: "shipment-order-1",
      reason: "Customer order dispatched"
    })).toEqual(expect.objectContaining({
      orderId: "11111111-1111-4111-8111-111111111111",
      orderNumber: "ORD-1001",
      carrierCode: "DHL",
      carrierName: "DHL Express",
      trackingNumber: "JD014600003",
      status: "shipped"
    }));
  });

  it("rejects malformed shipment identifiers", () => {
    expect(() => normalizeCreateShipment({
      orderId: "not-a-uuid",
      orderNumber: "",
      carrierCode: "",
      carrierName: "",
      trackingNumber: "x",
      actorId: "",
      idempotencyKey: ""
    })).toThrow("orderId");
  });

  it("allows forward fulfillment transitions and rejects changes after delivery", () => {
    expect(FulfillmentConflictError).toBeTypeOf("function");
    expect(() => assertShipmentTransition("shipped", "in_transit")).not.toThrow();
    expect(() => assertShipmentTransition("customs", "out_for_delivery")).not.toThrow();
    expect(() => assertShipmentTransition("delivered", "in_transit")).toThrow(FulfillmentConflictError);
  });

  it("requires a reason and normalizes status updates", () => {
    expect(normalizeShipmentStatusUpdate({
      status: " out_for_delivery ",
      reason: " Courier has the parcel ",
      location: " Los Angeles, US ",
      actorId: "admin-1"
    })).toEqual({
      status: "out_for_delivery",
      reason: "Courier has the parcel",
      location: "Los Angeles, US",
      actorId: "admin-1"
    });
    expect(() => normalizeShipmentStatusUpdate({ status: "delivered", reason: "" })).toThrow("reason");
  });

  it("creates a deterministic request hash for idempotency comparison", () => {
    const input = normalizeCreateShipment({
      orderId: "11111111-1111-4111-8111-111111111111",
      orderNumber: "ORD-1001",
      carrierCode: "DHL",
      carrierName: "DHL Express",
      trackingNumber: "JD014600003",
      actorId: "admin-1",
      idempotencyKey: "shipment-order-1",
      reason: "Dispatched"
    });
    expect(shipmentRequestHash(input)).toMatch(/^[a-f0-9]{64}$/);
    expect(shipmentRequestHash(input)).toBe(shipmentRequestHash({ ...input }));
    expect(shipmentRequestHash(input)).not.toBe(shipmentRequestHash({ ...input, trackingNumber: "JD014600004" }));
  });

  it("hashes status updates independently and accepts a trusted email idempotency key", () => {
    const statusInput = normalizeShipmentStatusUpdate({
      status: "in_transit",
      reason: "Departed facility",
      location: "Hong Kong",
      actorId: "admin-1"
    });
    expect(shipmentStatusRequestHash(statusInput)).toMatch(/^[a-f0-9]{64}$/);
    expect(shipmentStatusRequestHash(statusInput)).not.toBe(
      shipmentStatusRequestHash({ ...statusInput, location: "Los Angeles" })
    );
    expect(notificationIdempotencyKey(" custom-email-key ", "JD014600003", "buyer@example.com"))
      .toBe("custom-email-key");
    expect(notificationIdempotencyKey("", "JD014600003", "buyer@example.com"))
      .toBe("logistics-update-JD014600003-buyer@example.com");
  });
});
