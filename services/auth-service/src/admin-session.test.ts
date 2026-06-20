import { describe, expect, it } from "vitest";
import { adminSessionCookie, canIssueRefund, hashAdminSessionToken, parseAdminSessionToken } from "./admin-session.js";

describe("admin session policy", () => {
  it("allows only owner and finance to issue refunds", () => {
    expect(canIssueRefund("owner")).toBe(true);
    expect(canIssueRefund("finance")).toBe(true);
    expect(canIssueRefund("support")).toBe(false);
  });

  it("hashes opaque tokens before persistence", () => {
    expect(hashAdminSessionToken("secret-token")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashAdminSessionToken("secret-token")).not.toContain("secret-token");
  });

  it("reads the session cookie and emits HttpOnly cookie attributes", () => {
    expect(parseAdminSessionToken("other=1; admin_session=secret-token")).toBe("secret-token");
    expect(adminSessionCookie("secret-token", false)).toContain("HttpOnly; SameSite=Lax; Path=/");
  });
});
