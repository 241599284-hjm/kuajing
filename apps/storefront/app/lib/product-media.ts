import type { CatalogProductMediaAsset } from "@commerce/contracts";
import type { StorefrontProductMediaAsset } from "./storefront-content.js";

export function mapCatalogProductMediaAssets(assets: CatalogProductMediaAsset[]): StorefrontProductMediaAsset[] {
  return assets
    .map((asset) => ({
      assetId: asset.assetId,
      kind: asset.kind,
      url: asset.url,
      poster: asset.posterUrl,
      width: asset.width,
      height: asset.height,
      mimeType: asset.mimeType,
      responsiveSources: asset.responsiveSources.map((source) => ({
        url: source.url,
        width: source.width
      })),
      alt: {
        en: asset.altTextEn,
        zh: asset.altTextZh
      },
      sortOrder: asset.sortOrder
    }))
    .sort((left, right) => left.sortOrder - right.sortOrder);
}
