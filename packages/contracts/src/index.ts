import type { Money } from "@commerce/money";
export { containsInsecureHttp, normalizeResourceReference, publicMediaPath } from "./media-reference.js";
export {
  createDefaultHomepageLayout,
  duplicateHomepageModule,
  moveHomepageModule,
  normalizeHomepageLayout,
  removeHomepageModule,
  toggleHomepageModule
} from "./homepage-layout.js";
export type {
  HomepageLayout,
  HomepageLocalizedText,
  HomepageModule,
  HomepageModuleContent,
  HomepageModuleType
} from "./homepage-layout.js";

export type LocaleCode = "en" | "zh" | string;

export type LocalizedText<T> = Record<LocaleCode, T>;

export type ProductSummary = {
  id: string;
  storeId: string;
  title: string;
  slug: string;
  status: "draft" | "active" | "archived";
};

export type SkuSummary = {
  id: string;
  storeId: string;
  productId: string;
  skuCode: string;
  title: string;
  hsCode: string;
  materialComposition: string;
  originCountry: string;
  capacity: string;
  packageDimensionsMm: {
    length: number;
    width: number;
    height: number;
  };
  weightGrams: number;
  customsDeclaration: string;
  price: Money;
};

export type CatalogProductSummary = ProductSummary & {
  primarySku: SkuSummary;
};

export type CatalogLocalizedName = {
  name: string;
};

export type CatalogCategory = {
  id: string;
  storeId: string;
  slug: string;
  imageUrl: string;
  isVisible: boolean;
  sortOrder: number;
  copy: LocalizedText<CatalogLocalizedName>;
};

export type CatalogRegionIcon =
  | "palace"
  | "skyline"
  | "pavilion"
  | "wall"
  | "mountain"
  | "bridge"
  | "tower"
  | "water"
  | "statue"
  | "pagoda";

export type CatalogRegionCopy = {
  name: string;
  landmark: string;
  title: string;
  description: string;
  more: string;
};

export type CatalogRegion = {
  id: string;
  storeId: string;
  slug: string;
  imageUrl: string;
  icon: CatalogRegionIcon;
  isVisible: boolean;
  showOnHomepage: boolean;
  sortOrder: number;
  copy: LocalizedText<CatalogRegionCopy>;
};

export type CatalogMediaKind = "image" | "gif" | "video";

export type CatalogProductMediaAsset = {
  assetId: string;
  kind: CatalogMediaKind;
  url: string;
  objectKey: string;
  storageProvider: string;
  originalName: string;
  mimeType: string;
  byteSize: number | null;
  width: number | null;
  height: number | null;
  posterUrl: string | null;
  durationSeconds: number | null;
  variants: Record<string, string>;
  responsiveSources: Array<{
    url: string;
    objectKey: string;
    width: number;
    height: number;
    mimeType: string;
    byteSize: number;
  }>;
  altTextZh: string;
  altTextEn: string;
  sortOrder: number;
};

export type CatalogProductStoryBlock = {
  sortOrder: number;
  title: string;
  body: string;
  mediaKind: CatalogMediaKind;
  imageUrl: string;
  imageAlt: string;
  posterUrl?: string | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  mimeType?: string | null;
  byteSize?: number | null;
};

export type CatalogProductCopy = {
  name: string;
  tag: string;
  shortDescription: string;
  longDescription: string;
  storyBlocks: CatalogProductStoryBlock[];
  highlights: string[];
  details: {
    material: string;
    capacity: string;
    origin: string;
    hsCode: string;
    customsDeclaration: string;
    packageDimensionsMm: {
      length: number;
      width: number;
      height: number;
    };
    weightGrams: number;
  };
};

export type CatalogStorefrontProduct = {
  id: string;
  storeId: string;
  slug: string;
  imageUrl: string;
  mediaAssets: CatalogProductMediaAsset[];
  price: Money;
  originalPrice: Money;
  monthlySales: number;
  stock: number;
  sales: number;
  categorySlug: string;
  regionSlug: string;
  skuId: string;
  skuCode: string;
  originCountry: string;
  status: "draft" | "active" | "archived";
  copy: LocalizedText<CatalogProductCopy>;
};

export type CatalogStorefrontSnapshot = {
  storeId: string;
  generatedAt: string;
  categories: CatalogCategory[];
  regions: CatalogRegion[];
  products: CatalogStorefrontProduct[];
};

export type OrderStatus =
  | "draft"
  | "pending_payment"
  | "payment_unavailable"
  | "paid"
  | "cancelled"
  | "compensating";
