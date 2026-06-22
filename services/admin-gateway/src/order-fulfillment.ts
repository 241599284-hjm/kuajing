export type FulfillmentOrder = {
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  status: string;
  paymentStatus: string;
};

export class OrderFulfillmentError extends Error {}

export function assertOrderCanShip(order: FulfillmentOrder) {
  if (order.status === "cancelled") {
    throw new OrderFulfillmentError("cancelled orders cannot be shipped");
  }
  if (order.status !== "paid" || order.paymentStatus !== "paid") {
    throw new OrderFulfillmentError("order must be paid before shipment");
  }
}

export function trustedShipmentRequest(
  order: FulfillmentOrder,
  body: Record<string, unknown>,
  actorId: string
) {
  return {
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    actorId,
    carrierCode: body.carrierCode,
    carrierName: body.carrierName,
    trackingNumber: body.trackingNumber,
    reason: body.reason
  };
}
