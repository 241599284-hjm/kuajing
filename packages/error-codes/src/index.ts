export const ERROR_CODES = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  NOT_FOUND: "NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  INVENTORY_SHORTAGE: "INVENTORY_SHORTAGE",
  UPLOAD_REJECTED: "UPLOAD_REJECTED",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  COMPENSATION_PENDING: "COMPENSATION_PENDING",
  DEPENDENCY_UNAVAILABLE: "DEPENDENCY_UNAVAILABLE",
  INTERNAL_ERROR: "INTERNAL_ERROR"
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export type StandardErrorPayload = {
  code: ErrorCode | string;
  message: string;
  details?: unknown;
  correlationId?: string;
};

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_FAILED: "The submitted data is invalid.",
  NOT_FOUND: "The requested resource was not found.",
  UNAUTHORIZED: "Authentication is required.",
  FORBIDDEN: "You do not have permission to perform this action.",
  CONFLICT: "The request conflicts with the current state.",
  RATE_LIMITED: "Too many requests. Please try again later.",
  IDEMPOTENCY_CONFLICT: "This idempotency key conflicts with a previous request.",
  INVENTORY_SHORTAGE: "Insufficient inventory for this item.",
  UPLOAD_REJECTED: "The uploaded file was rejected.",
  PROVIDER_UNAVAILABLE: "The external provider is temporarily unavailable.",
  COMPENSATION_PENDING: "The operation is pending compensation.",
  DEPENDENCY_UNAVAILABLE: "A required dependency is temporarily unavailable.",
  INTERNAL_ERROR: "The service encountered an unexpected error."
};

export function defaultMessageForCode(code: ErrorCode | string): string {
  return DEFAULT_MESSAGES[code as ErrorCode] ?? DEFAULT_MESSAGES.INTERNAL_ERROR;
}

export function codeForHttpStatus(status: number): ErrorCode {
  if (status === 400 || status === 422) return ERROR_CODES.VALIDATION_FAILED;
  if (status === 401) return ERROR_CODES.UNAUTHORIZED;
  if (status === 403) return ERROR_CODES.FORBIDDEN;
  if (status === 404) return ERROR_CODES.NOT_FOUND;
  if (status === 409) return ERROR_CODES.CONFLICT;
  if (status === 429) return ERROR_CODES.RATE_LIMITED;
  if (status === 502 || status === 503 || status === 504) return ERROR_CODES.DEPENDENCY_UNAVAILABLE;
  return ERROR_CODES.INTERNAL_ERROR;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function normalizeErrorPayload(payload: unknown, status: number, correlationId?: string): StandardErrorPayload {
  if (isRecord(payload)) {
    const code = readString(payload.code) ?? codeForHttpStatus(status);
    const message = readString(payload.message) ?? readString(payload.error) ?? defaultMessageForCode(code);

    return {
      code,
      message,
      ...(payload.details === undefined ? { details: payload } : { details: payload.details }),
      ...(readString(payload.correlationId) || correlationId ? { correlationId: readString(payload.correlationId) ?? correlationId } : {})
    };
  }

  const code = codeForHttpStatus(status);
  return {
    code,
    message: defaultMessageForCode(code),
    ...(payload === undefined ? {} : { details: payload }),
    ...(correlationId ? { correlationId } : {})
  };
}
