import { ConflictException } from "@nestjs/common";
import { ERROR_CODES } from "@commerce/error-codes";

export type ReservationIdentity = {
  skuId: string;
  warehouseId: string;
  qty: number;
};

export function assertReservationReplay(
  idempotencyKey: string,
  existing: ReservationIdentity,
  incoming: ReservationIdentity
): void {
  if (
    existing.skuId === incoming.skuId
    && existing.warehouseId === incoming.warehouseId
    && existing.qty === incoming.qty
  ) {
    return;
  }

  throw new ConflictException({
    code: ERROR_CODES.IDEMPOTENCY_CONFLICT,
    message: "The idempotency key was already used for a different inventory reservation.",
    details: { idempotencyKey }
  });
}
