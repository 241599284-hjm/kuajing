import { ConflictException } from "@nestjs/common";
import { ERROR_CODES } from "@commerce/error-codes";
import { createHash } from "node:crypto";

export function checkoutFingerprint(checkout: unknown): string {
  return createHash("sha256").update(JSON.stringify(checkout)).digest("hex");
}

export function assertCheckoutReplay(
  idempotencyKey: string,
  existingFingerprint: string | null | undefined,
  incomingFingerprint: string
): void {
  if (!existingFingerprint || existingFingerprint === incomingFingerprint) {
    return;
  }

  throw new ConflictException({
    code: ERROR_CODES.IDEMPOTENCY_CONFLICT,
    message: "The idempotency key was already used for a different checkout request.",
    details: { idempotencyKey }
  });
}
