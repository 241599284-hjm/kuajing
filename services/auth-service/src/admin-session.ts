import { createHash } from "node:crypto";

export const adminSessionCookieName = "admin_session";

export function canIssueRefund(role: string) {
  return role === "owner" || role === "finance";
}

export function hashAdminSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function parseAdminSessionToken(cookieHeader: string | undefined) {
  return cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${adminSessionCookieName}=`))
    ?.slice(adminSessionCookieName.length + 1);
}

export function adminSessionCookie(token: string, secure: boolean, maxAgeSeconds = 8 * 60 * 60) {
  return `${adminSessionCookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${secure ? "; Secure" : ""}`;
}

export function expiredAdminSessionCookie(secure: boolean) {
  return adminSessionCookie("", secure, 0);
}
