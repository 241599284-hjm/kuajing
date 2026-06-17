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

export type ErrorLocale = "en" | "zh";

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

const LOCALIZED_MESSAGES: Record<ErrorLocale, Record<ErrorCode, string>> = {
  en: DEFAULT_MESSAGES,
  zh: {
    VALIDATION_FAILED: "提交的数据不符合要求，请检查后重试。",
    NOT_FOUND: "未找到请求的数据。",
    UNAUTHORIZED: "请先登录后再继续。",
    FORBIDDEN: "当前账号无权执行此操作。",
    CONFLICT: "当前状态不允许执行此操作，请刷新后重试。",
    RATE_LIMITED: "操作过于频繁，请稍后重试。",
    IDEMPOTENCY_CONFLICT: "该请求已提交，且与之前的请求内容不一致。",
    INVENTORY_SHORTAGE: "商品库存不足，请调整数量后重试。",
    UPLOAD_REJECTED: "文件未通过上传校验，请检查格式和大小。",
    PROVIDER_UNAVAILABLE: "第三方服务暂时不可用，请稍后重试。",
    COMPENSATION_PENDING: "操作正在等待系统补偿处理。",
    DEPENDENCY_UNAVAILABLE: "依赖服务暂时不可用，请稍后重试。",
    INTERNAL_ERROR: "系统暂时无法处理该请求，请稍后重试。"
  }
};

export function defaultMessageForCode(code: ErrorCode | string): string {
  return DEFAULT_MESSAGES[code as ErrorCode] ?? DEFAULT_MESSAGES.INTERNAL_ERROR;
}

function isErrorCode(value: string): value is ErrorCode {
  return Object.prototype.hasOwnProperty.call(DEFAULT_MESSAGES, value);
}

export function localizedMessageForCode(code: ErrorCode | string, locale: ErrorLocale): string {
  return isErrorCode(code) ? LOCALIZED_MESSAGES[locale][code] : LOCALIZED_MESSAGES[locale].INTERNAL_ERROR;
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

export function localizedErrorMessage(
  payload: unknown,
  status: number,
  locale: ErrorLocale,
  fallback?: string
): string {
  const normalized = normalizeErrorPayload(payload, status);

  if (isErrorCode(normalized.code)) {
    return localizedMessageForCode(normalized.code, locale);
  }

  return normalized.message || fallback || localizedMessageForCode(ERROR_CODES.INTERNAL_ERROR, locale);
}
