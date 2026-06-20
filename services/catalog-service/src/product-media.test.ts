import { describe, expect, it } from "vitest";
import { normalizeProductMediaAssets, type SaveProductMediaAssetInput } from "./product-media.js";

const storeId = "00000000-0000-4000-8000-000000000001";
const asset = {
  assetId: "00000000-0000-4000-8000-000000030001",
  kind: "image" as const,
  url: "https://cdn.example.com/image.webp",
  objectKey: `${storeId}/product-media/image/2026-06/image.webp`,
  storageProvider: "minio",
  originalName: "image.webp",
  mimeType: "image/webp",
  byteSize: 1200,
  width: 800,
  height: 600,
  variants: {},
  responsiveSources: [],
  altTextZh: "白瓷茶具主图",
  altTextEn: "Porcelain tea set main image",
  sortOrder: 10
};

describe("normalizeProductMediaAssets", () => {
  it("sorts valid assets by explicit sortOrder", () => {
    const result = normalizeProductMediaAssets(storeId, [
      { ...asset, assetId: "00000000-0000-4000-8000-000000030002", sortOrder: 20 },
      asset
    ]);
    expect(result.map((item) => item.sortOrder)).toEqual([10, 20]);
    expect(result[0]?.url).toBe(`/media/public/${storeId}/product-media/image/2026-06/image.webp`);
  });

  const invalidCases: SaveProductMediaAssetInput[][] = [
    [{ ...asset, altTextEn: "" }],
    [{ ...asset, objectKey: "another-store/product-media/image/file.webp" }],
    [asset, { ...asset, assetId: "00000000-0000-4000-8000-000000030002" }]
  ];

  invalidCases.forEach((assets, index) => {
    it(`rejects invalid or ambiguous media bindings (${index + 1})`, () => {
      expect(() => normalizeProductMediaAssets(storeId, assets)).toThrowError(expect.objectContaining({
        status: 400,
        response: expect.objectContaining({ code: "VALIDATION_FAILED" })
      }));
    });
  });
});
