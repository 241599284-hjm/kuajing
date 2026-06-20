import { BadRequestException } from "@nestjs/common";
import { ERROR_CODES } from "@commerce/error-codes";
import { publicMediaPath, type CatalogProductMediaAsset } from "@commerce/contracts";

export type SaveProductMediaAssetInput = Partial<CatalogProductMediaAsset> & {
  isPending?: boolean;
};

function invalid(message: string, details?: unknown): never {
  throw new BadRequestException({
    code: ERROR_CODES.VALIDATION_FAILED,
    message,
    ...(details === undefined ? {} : { details })
  });
}

function requiredText(value: unknown, field: string, maxLength = 500): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > maxLength) invalid(`${field} is required`, { field, maxLength });
  return text;
}

export function normalizeProductMediaAssets(
  storeId: string,
  assets: SaveProductMediaAssetInput[]
): CatalogProductMediaAsset[] {
  if (!Array.isArray(assets) || assets.length > 20) {
    invalid("product.mediaAssets must contain at most 20 items", { field: "mediaAssets", maxItems: 20 });
  }

  const seenIds = new Set<string>();
  const seenSortOrders = new Set<number>();

  return assets.map((asset, index) => {
    const assetId = requiredText(asset.assetId, `mediaAssets[${index}].assetId`, 80);
    const objectKey = requiredText(asset.objectKey, `mediaAssets[${index}].objectKey`, 500);
    const kind = asset.kind;
    const sortOrder = Number(asset.sortOrder);

    if (!objectKey.startsWith(`${storeId}/product-media/`)) {
      invalid("media object does not belong to this store", { field: `mediaAssets[${index}].objectKey` });
    }
    if (kind !== "image" && kind !== "gif" && kind !== "video") {
      invalid("media kind must be image, gif, or video", { field: `mediaAssets[${index}].kind` });
    }
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000) {
      invalid("media sortOrder must be an integer between 0 and 10000", { field: `mediaAssets[${index}].sortOrder` });
    }
    if (seenIds.has(assetId) || seenSortOrders.has(sortOrder)) {
      invalid("media assetId and sortOrder must be unique per product", { assetId, sortOrder });
    }
    seenIds.add(assetId);
    seenSortOrders.add(sortOrder);

    const responsiveSourcePairs = Array.isArray(asset.responsiveSources)
      ? asset.responsiveSources.filter((source) =>
          typeof source?.url === "string"
          && typeof source?.objectKey === "string"
          && source.objectKey.startsWith(`${storeId}/product-media/`)
          && Number.isInteger(source.width)
          && Number.isInteger(source.height)
          && Number.isInteger(source.byteSize)
        ).map((source) => [source.url, { ...source, url: publicMediaPath(source.objectKey) }] as const)
      : [];
    const responsiveSources = responsiveSourcePairs.map(([, source]) => source);
    const sourceBySubmittedUrl = new Map(responsiveSourcePairs.map(([submittedUrl, source]) => [submittedUrl, source.url]));
    const posterUrl = typeof asset.posterUrl === "string"
      ? sourceBySubmittedUrl.get(asset.posterUrl) ?? null
      : null;
    const variants = typeof asset.variants === "object" && asset.variants !== null && !Array.isArray(asset.variants)
      ? Object.fromEntries(Object.entries(asset.variants).flatMap(([name, submittedUrl]) => {
          const normalizedUrl = sourceBySubmittedUrl.get(submittedUrl);
          return normalizedUrl ? [[name, normalizedUrl]] : [];
        }))
      : {};

    return {
      assetId,
      kind,
      url: publicMediaPath(objectKey),
      objectKey,
      storageProvider: requiredText(asset.storageProvider, `mediaAssets[${index}].storageProvider`, 40),
      originalName: requiredText(asset.originalName, `mediaAssets[${index}].originalName`, 255),
      mimeType: requiredText(asset.mimeType, `mediaAssets[${index}].mimeType`, 120),
      byteSize: Number.isInteger(asset.byteSize) && Number(asset.byteSize) > 0 ? Number(asset.byteSize) : null,
      width: Number.isInteger(asset.width) && Number(asset.width) > 0 ? Number(asset.width) : null,
      height: Number.isInteger(asset.height) && Number(asset.height) > 0 ? Number(asset.height) : null,
      posterUrl,
      durationSeconds: typeof asset.durationSeconds === "number" && asset.durationSeconds >= 0 ? asset.durationSeconds : null,
      variants,
      responsiveSources,
      altTextZh: requiredText(asset.altTextZh, `mediaAssets[${index}].altTextZh`, 300),
      altTextEn: requiredText(asset.altTextEn, `mediaAssets[${index}].altTextEn`, 300),
      sortOrder
    };
  }).sort((left, right) => left.sortOrder - right.sortOrder);
}
