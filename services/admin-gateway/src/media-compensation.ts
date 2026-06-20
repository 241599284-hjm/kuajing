import { HttpException } from "@nestjs/common";

export type PendingMediaObject = {
  assetId: string;
  objectKey: string;
};

export type PendingMediaAsset = {
  assetId: string;
  objectKeys: string[];
};

function mediaObjects(asset: unknown): PendingMediaObject[] {
  if (typeof asset !== "object" || asset === null) return [];
  if (!("assetId" in asset) || typeof asset.assetId !== "string") return [];
  if (!("objectKey" in asset) || typeof asset.objectKey !== "string") return [];
  const assetId = asset.assetId;

  const responsiveSources: unknown[] = "responsiveSources" in asset && Array.isArray(asset.responsiveSources)
    ? asset.responsiveSources
    : [];
  const objectKeys = [
    asset.objectKey,
    ...responsiveSources
      .map((source: unknown) => typeof source === "object" && source !== null && "objectKey" in source ? source.objectKey : undefined)
      .filter((objectKey: unknown): objectKey is string => typeof objectKey === "string")
  ];

  return [...new Set(objectKeys)].map((objectKey) => ({ assetId, objectKey }));
}

export function pendingProductMediaObjects(body: unknown): PendingMediaObject[] {
  if (typeof body !== "object" || body === null || !("products" in body) || !Array.isArray(body.products)) {
    return [];
  }

  const pending: PendingMediaObject[] = [];
  for (const product of body.products) {
    if (typeof product !== "object" || product === null || !("mediaAssets" in product) || !Array.isArray(product.mediaAssets)) continue;
    for (const asset of product.mediaAssets) {
      if (typeof asset !== "object" || asset === null || asset.isPending !== true) continue;
      pending.push(...mediaObjects(asset));
    }
  }
  return pending;
}

export function removedProductMediaObjects(body: unknown): PendingMediaObject[] {
  if (typeof body !== "object" || body === null || !("removedMediaAssets" in body) || !Array.isArray(body.removedMediaAssets)) {
    return [];
  }

  return body.removedMediaAssets.flatMap(mediaObjects);
}

export function pendingProductMediaAssets(body: unknown): PendingMediaAsset[] {
  const grouped = new Map<string, Set<string>>();

  for (const mediaObject of pendingProductMediaObjects(body)) {
    const objectKeys = grouped.get(mediaObject.assetId) ?? new Set<string>();
    objectKeys.add(mediaObject.objectKey);
    grouped.set(mediaObject.assetId, objectKeys);
  }

  return [...grouped.entries()].map(([assetId, objectKeys]) => ({ assetId, objectKeys: [...objectKeys] }));
}

export function shouldCompensateCatalogFailure(error: unknown): boolean {
  return error instanceof HttpException && error.getStatus() >= 400 && error.getStatus() < 500;
}

export function shouldReconcileCatalogFailure(error: unknown): boolean {
  return error instanceof HttpException && error.getStatus() >= 500;
}
