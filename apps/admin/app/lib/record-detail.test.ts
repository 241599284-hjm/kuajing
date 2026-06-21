import { describe, expect, it } from "vitest";
import { recordDetailRequest } from "./record-detail.js";

describe("recordDetailRequest", () => {
  it.each([
    ["refunds", { refundId: "refund-1" }, "/payments/refunds/refund-1"],
    ["webhooks", { eventId: "event/1" }, "/payments/webhooks/event%2F1"],
    ["customers", { customerId: "customer-1" }, "/customers/customer-1"]
  ] as const)("uses the stable business id for %s", (kind, record, path) => {
    expect(recordDetailRequest(kind, record)).toEqual({ id: Object.values(record)[0], path });
  });

  it("rejects list records without a stable business id", () => {
    expect(() => recordDetailRequest("customers", { email: "buyer@example.com" })).toThrow("stable business id");
  });
});
