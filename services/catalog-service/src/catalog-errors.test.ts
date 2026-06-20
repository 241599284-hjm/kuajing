import { describe, expect, it } from "vitest";

describe("catalog error mapping", () => {
  it("maps missing catalog dependencies to HTTP 404 with NOT_FOUND", async () => {
    const modulePath = "./catalog-errors.js";
    const catalogErrors = await import(modulePath).catch(() => null) as null | {
      catalogNotFound(message: string, details?: unknown): { getStatus(): number; getResponse(): unknown };
    };

    expect(catalogErrors).not.toBeNull();
    if (!catalogErrors) return;

    const error = catalogErrors.catalogNotFound("category missing", { categorySlug: "missing" });
    expect(error.getStatus()).toBe(404);
    expect(error.getResponse()).toEqual({
      code: "NOT_FOUND",
      message: "category missing",
      details: { categorySlug: "missing" }
    });
  });
});
