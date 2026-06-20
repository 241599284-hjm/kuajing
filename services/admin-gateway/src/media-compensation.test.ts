import { HttpException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import * as mediaCompensation from "./media-compensation.js";
import { pendingProductMediaObjects, shouldCompensateCatalogFailure } from "./media-compensation.js";

describe("catalog media compensation", () => {
  it("collects only newly uploaded pending objects", () => {
    expect(pendingProductMediaObjects({ products: [{ mediaAssets: [
      {
        assetId: "new",
        objectKey: "store/product-media/new.png",
        responsiveSources: [
          { objectKey: "store/product-media/new-w480.webp" },
          { objectKey: "store/product-media/new-w960.webp" }
        ],
        isPending: true
      },
      { assetId: "bound", objectKey: "store/product-media/bound.webp", isPending: false }
    ] }] })).toEqual([
      { assetId: "new", objectKey: "store/product-media/new.png" },
      { assetId: "new", objectKey: "store/product-media/new-w480.webp" },
      { assetId: "new", objectKey: "store/product-media/new-w960.webp" }
    ]);
  });

  it("compensates deterministic catalog rejections but not uncertain 5xx outcomes", () => {
    expect(shouldCompensateCatalogFailure(new HttpException({}, 400))).toBe(true);
    expect(shouldCompensateCatalogFailure(new HttpException({}, 503))).toBe(false);
  });

  it("queues durable reconciliation only for uncertain server outcomes", () => {
    const shouldReconcileCatalogFailure = (mediaCompensation as Record<string, unknown>).shouldReconcileCatalogFailure;
    expect(shouldReconcileCatalogFailure).toBeTypeOf("function");
    if (typeof shouldReconcileCatalogFailure !== "function") return;

    expect(shouldReconcileCatalogFailure(new HttpException({}, 503))).toBe(true);
    expect(shouldReconcileCatalogFailure(new HttpException({}, 400))).toBe(false);
  });

  it("collects removed bound media only from the explicit post-save cleanup list", () => {
    const removedProductMediaObjects = (mediaCompensation as Record<string, unknown>).removedProductMediaObjects;
    expect(removedProductMediaObjects).toBeTypeOf("function");
    if (typeof removedProductMediaObjects !== "function") return;

    expect(removedProductMediaObjects({
      products: [{ mediaAssets: [{ assetId: "kept", objectKey: "store/product-media/kept.webp" }] }],
      removedMediaAssets: [{
        assetId: "removed",
        objectKey: "store/product-media/removed.png",
        responsiveSources: [
          { objectKey: "store/product-media/removed-w480.webp" },
          { objectKey: "store/product-media/removed-w960.webp" }
        ]
      }]
    })).toEqual([
      { assetId: "removed", objectKey: "store/product-media/removed.png" },
      { assetId: "removed", objectKey: "store/product-media/removed-w480.webp" },
      { assetId: "removed", objectKey: "store/product-media/removed-w960.webp" }
    ]);
  });

  it("groups pending upload objects into one durable reconciliation asset", () => {
    const pendingProductMediaAssets = (mediaCompensation as Record<string, unknown>).pendingProductMediaAssets;
    expect(pendingProductMediaAssets).toBeTypeOf("function");
    if (typeof pendingProductMediaAssets !== "function") return;

    expect(pendingProductMediaAssets({ products: [{ mediaAssets: [{
      assetId: "uncertain",
      objectKey: "store/product-media/uncertain.png",
      responsiveSources: [
        { objectKey: "store/product-media/uncertain-w480.webp" },
        { objectKey: "store/product-media/uncertain-w960.webp" }
      ],
      isPending: true
    }] }] })).toEqual([{
      assetId: "uncertain",
      objectKeys: [
        "store/product-media/uncertain.png",
        "store/product-media/uncertain-w480.webp",
        "store/product-media/uncertain-w960.webp"
      ]
    }]);
  });
});
