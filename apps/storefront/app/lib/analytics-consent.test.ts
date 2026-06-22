import { describe, expect, it } from "vitest";
import { analyticsAllowed } from "./analytics-consent.js";

describe("analytics consent", () => {
  it("requires explicit acceptance", () => {
    expect(analyticsAllowed("accepted", "0")).toBe(true);
    expect(analyticsAllowed("declined", "0")).toBe(false);
    expect(analyticsAllowed(null, "0")).toBe(false);
  });

  it("respects Do Not Track", () => {
    expect(analyticsAllowed("accepted", "1")).toBe(false);
    expect(analyticsAllowed("accepted", "yes")).toBe(false);
  });
});
