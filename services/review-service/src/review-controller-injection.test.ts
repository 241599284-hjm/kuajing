import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ReviewController dependency injection", () => {
  it("uses explicit injection tokens for the tsx runtime", () => {
    const source = readFileSync(new URL("./main.ts", import.meta.url), "utf8");

    expect(source).toContain("@Inject(ReviewRepository)");
    expect(source).toContain("@Inject(OrderPurchaseVerifier)");
    expect(source).toContain("@Inject(ReviewNotificationService)");
  });
});
