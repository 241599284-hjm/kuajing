import { describe, expect, it } from "vitest";
import { assertOrderCanShip, trustedShipmentRequest } from "./order-fulfillment.js";

const order = {
  orderId: "11111111-1111-4111-8111-111111111111",
  orderNumber: "ORD-1001",
  customerEmail: "buyer@example.com",
  status: "paid",
  paymentStatus: "paid"
};

describe("admin order fulfillment boundary", () => {
  it("only allows captured/paid orders to ship", () => {
    expect(() => assertOrderCanShip(order)).not.toThrow();
    expect(() => assertOrderCanShip({ ...order, paymentStatus: "mock_created" })).toThrow("paid");
    expect(() => assertOrderCanShip({ ...order, status: "cancelled" })).toThrow("cancelled");
  });

  it("overrides browser-owned order and actor fields with trusted values", () => {
    expect(trustedShipmentRequest(order, {
      orderId: "attacker-order",
      orderNumber: "ATTACKER",
      actorId: "attacker",
      carrierCode: "DHL",
      carrierName: "DHL Express",
      trackingNumber: "JD014600003",
      reason: "Dispatched"
    }, "admin-1")).toEqual({
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      actorId: "admin-1",
      carrierCode: "DHL",
      carrierName: "DHL Express",
      trackingNumber: "JD014600003",
      reason: "Dispatched"
    });
  });
});
