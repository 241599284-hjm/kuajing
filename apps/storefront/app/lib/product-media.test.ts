import { describe, expect, it } from "vitest";
import type { CatalogProductMediaAsset } from "@commerce/contracts";
import { mapCatalogProductMediaAssets } from "./product-media.js";

const asset: CatalogProductMediaAsset = {
  assetId: "asset-1",
  kind: "image",
  url: "https://cdn.example.com/main.webp",
  objectKey: "store/product-media/main.webp",
  storageProvider: "minio",
  originalName: "main.webp",
  mimeType: "image/webp",
  byteSize: 1000,
  width: 800,
  height: 600,
  posterUrl: null,
  durationSeconds: null,
  variants: {},
  responsiveSources: [{
    url: "https://cdn.example.com/main-480.webp",
    objectKey: "store/product-media/main-480.webp",
    width: 480,
    height: 360,
    mimeType: "image/webp",
    byteSize: 500
  }],
  altTextZh: "白瓷茶具俯视图",
  altTextEn: "Top view of a porcelain tea set",
  sortOrder: 10
};

describe("mapCatalogProductMediaAssets", () => {
  it("sorts media and preserves localized alt text", () => {
    const result = mapCatalogProductMediaAssets([
      { ...asset, assetId: "asset-2", sortOrder: 20, altTextEn: "Second image", altTextZh: "第二张图片" },
      asset
    ]);

    expect(result.map((item) => item.assetId)).toEqual(["asset-1", "asset-2"]);
    expect(result[0].alt).toEqual({
      en: "Top view of a porcelain tea set",
      zh: "白瓷茶具俯视图"
    });
    expect(result[0].responsiveSources).toEqual([{ url: "https://cdn.example.com/main-480.webp", width: 480 }]);
  });
});
