import { ERROR_CODES } from "@commerce/error-codes";

type HeaderBag = Record<string, string | string[] | undefined>;
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class RefundAuthorizationError extends Error {
  constructor(public readonly status: 401 | 403, public readonly code: string, message: string) {
    super(message);
  }
}

function headerValue(headers: HeaderBag, name: string) {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export async function authorizeRefundRequest(
  headers: HeaderBag,
  fetchFn: FetchLike = fetch,
  authServiceUrl = process.env.AUTH_SERVICE_URL ?? "http://localhost:4102"
) {
  const cookie = headerValue(headers, "cookie");
  const authorization = headerValue(headers, "authorization");
  if (!cookie && !authorization) {
    throw new RefundAuthorizationError(401, ERROR_CODES.UNAUTHORIZED, "admin authentication is required");
  }
  const response = await fetchFn(`${authServiceUrl.replace(/\/+$/, "")}/admin/session`, {
    headers: { ...(cookie ? { cookie } : {}), ...(authorization ? { authorization } : {}) }
  });
  if (!response.ok) throw new RefundAuthorizationError(401, ERROR_CODES.UNAUTHORIZED, "admin session is invalid or expired");
  const session = await response.json() as { adminId?: string; role?: string };
  if (!session.adminId || !session.role) {
    throw new RefundAuthorizationError(401, ERROR_CODES.UNAUTHORIZED, "admin session is invalid");
  }
  if (session.role !== "owner" && session.role !== "finance") {
    throw new RefundAuthorizationError(403, ERROR_CODES.FORBIDDEN, "admin role cannot issue refunds");
  }
  return { actorId: session.adminId, role: session.role };
}
