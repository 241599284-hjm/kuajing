import { describe, expect, it } from "vitest";
import { assertReservationReplay } from "./reservation-idempotency.js";

const reservation = {
  skuId: "00000000-0000-4000-8000-000000002001",
  warehouseId: "00000000-0000-4000-8000-000000003001",
  qty: 2
};

describe("assertReservationReplay", () => {
  it("accepts an exact reservation replay", () => {
    expect(() => assertReservationReplay("reserve-1", reservation, { ...reservation })).not.toThrow();
  });

  it.each([
    { ...reservation, qty: 3 },
    { ...reservation, skuId: "00000000-0000-4000-8000-000000002002" },
    { ...reservation, warehouseId: "00000000-0000-4000-8000-000000003002" }
  ])("rejects a changed reservation with IDEMPOTENCY_CONFLICT", (incoming) => {
    expect(() => assertReservationReplay("reserve-1", reservation, incoming)).toThrowError(expect.objectContaining({
      status: 409,
      response: expect.objectContaining({ code: "IDEMPOTENCY_CONFLICT" })
    }));
  });
});
