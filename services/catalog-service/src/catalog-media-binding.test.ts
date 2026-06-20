import { describe, expect, it } from "vitest";

describe("catalog media binding query", () => {
  it("accepts UUID asset ids and rejects malformed ids as validation errors", async () => {
    const modulePath = "./catalog-media-binding.js";
    const mediaBinding = await import(modulePath).catch(() => null) as null | {
      normalizeMediaAssetId(value: string): string;
    };

    expect(mediaBinding).not.toBeNull();
    if (!mediaBinding) return;

    const assetId = "00000000-0000-4000-8000-000000030001";
    expect(mediaBinding.normalizeMediaAssetId(assetId)).toBe(assetId);
    expect(() => mediaBinding.normalizeMediaAssetId("not-a-uuid")).toThrowError(expect.objectContaining({
      status: 400,
      response: expect.objectContaining({ code: "VALIDATION_FAILED" })
    }));
  });
});
