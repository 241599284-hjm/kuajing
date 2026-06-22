import { describe, expect, it, vi } from "vitest";
import { authorizeAdminRequest, authorizeRefundRequest } from "./refund-authorization.js";

describe("authorizeAdminRequest", () => {
  it("allows any authenticated active admin role", async () => {
    await expect(authorizeAdminRequest({ cookie: "admin_session=token" }, async () =>
      new Response(JSON.stringify({ adminId: "admin-1", role: "support" }), { status: 200 })
    )).resolves.toEqual({ actorId: "admin-1", role: "support" });
  });
});

describe("authorizeRefundRequest", () => {
  it("rejects requests without an admin session", async () => {
    await expect(authorizeRefundRequest({}, vi.fn())).rejects.toMatchObject({ status: 401 });
  });

  it("rejects an authenticated role without refund permission", async () => {
    await expect(authorizeRefundRequest({ cookie: "admin_session=token" }, async () =>
      new Response(JSON.stringify({ adminId: "admin-1", role: "support" }), { status: 200 })
    )).rejects.toMatchObject({ status: 403 });
  });

  it.each(["owner", "finance"])("allows the %s role and returns a trusted actor", async (role) => {
    await expect(authorizeRefundRequest({ cookie: "admin_session=token" }, async () =>
      new Response(JSON.stringify({ adminId: "admin-1", role }), { status: 200 })
    )).resolves.toEqual({ actorId: "admin-1", role });
  });
});
