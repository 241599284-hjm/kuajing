import { describe, expect, it } from "vitest";
import { normalizeOpsAction } from "./ops-actions.js";

describe("normalizeOpsAction", () => {
  it("normalizes a supported action", () => {
    expect(normalizeOpsAction(" EDGEONE-FREE-CERT-CHECK ")).toBe("edgeone-free-cert-check");
  });

  it.each(["unknown-action", ""])("rejects unsupported action %j with a standard error", (action) => {
    expect(() => normalizeOpsAction(action)).toThrowError(expect.objectContaining({
      status: 400,
      response: expect.objectContaining({
        code: "VALIDATION_FAILED",
        details: { field: "action", value: action }
      })
    }));
  });
});
