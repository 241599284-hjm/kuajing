import { HttpException } from "@nestjs/common";
import { ERROR_CODES } from "@commerce/error-codes";

export const allowedOpsActions = new Set([
  "ssl-renew",
  "edgeone-free-cert-apply",
  "edgeone-free-cert-check",
  "http-scan",
  "cdn-purge-all",
  "cdn-purge-path",
  "analytics-test",
  "credential-expiry-scan",
  "frontend-memory-release"
]);

export function normalizeOpsAction(action: string): string {
  const normalizedAction = action.trim().toLowerCase();

  if (!allowedOpsActions.has(normalizedAction)) {
    throw new HttpException({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: "unknown operations action",
      details: { field: "action", value: normalizedAction }
    }, 400);
  }

  return normalizedAction;
}
