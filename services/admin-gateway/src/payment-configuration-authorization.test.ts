import { describe, expect, it } from "vitest";
import { authorizePaymentConfigurationRequest } from "./refund-authorization.js";

function session(role: string) {
  return async () => new Response(JSON.stringify({ adminId: "admin-1", role }), { status: 200 });
}

describe("authorizePaymentConfigurationRequest", () => {
  it("allows finance to read and test both environments", async () => {
    await expect(authorizePaymentConfigurationRequest(
      { cookie: "admin_session=token" },
      "live",
      "read",
      session("finance")
    )).resolves.toEqual({ actorId: "admin-1", role: "finance" });
  });

  it("allows finance to update sandbox but not live credentials", async () => {
    await expect(authorizePaymentConfigurationRequest(
      { cookie: "admin_session=token" },
      "sandbox",
      "write",
      session("finance")
    )).resolves.toMatchObject({ role: "finance" });
    await expect(authorizePaymentConfigurationRequest(
      { cookie: "admin_session=token" },
      "live",
      "write",
      session("finance")
    )).rejects.toMatchObject({ status: 403 });
  });

  it("allows the owner to update live credentials", async () => {
    await expect(authorizePaymentConfigurationRequest(
      { cookie: "admin_session=token" },
      "live",
      "write",
      session("owner")
    )).resolves.toMatchObject({ role: "owner" });
  });
});
