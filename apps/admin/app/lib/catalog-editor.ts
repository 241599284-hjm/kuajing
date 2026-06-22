export type ProductMediaAsset = {
  assetId: string;
  kind: "image" | "gif" | "video";
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
  isPending?: boolean;
};

export type ProductDraft = {
  sku: string;
  nameZh: string;
  nameEn: string;
  category: string;
  region: string;
  price: number;
  detailZh: string;
  detailEn: string;
  imageUrl: string;
  mediaAssets: ProductMediaAsset[];
  materialZh: string;
  materialEn: string;
  originZh: string;
  originEn: string;
  originCountry: string;
  capacityZh: string;
  capacityEn: string;
  hsCode: string;
  packageLengthMm: number;
  packageWidthMm: number;
  packageHeightMm: number;
  weightGrams: number;
  customsDeclarationZh: string;
  customsDeclarationEn: string;
  status: "active" | "inactive";
};

export type CategoryDraft = {
  slug: string;
  nameZh: string;
  nameEn: string;
  sortOrder: number;
  status: "active" | "inactive";
};

export function createBlankProduct(): ProductDraft {
  return {
    sku: "",
    nameZh: "",
    nameEn: "",
    category: "teapot",
    region: "beijing",
    price: 0,
    detailZh: "",
    detailEn: "",
    imageUrl: "",
    mediaAssets: [],
    materialZh: "",
    materialEn: "",
    originZh: "中国",
    originEn: "China",
    originCountry: "CN",
    capacityZh: "",
    capacityEn: "",
    hsCode: "",
    packageLengthMm: 0,
    packageWidthMm: 0,
    packageHeightMm: 0,
    weightGrams: 0,
    customsDeclarationZh: "",
    customsDeclarationEn: "",
    status: "inactive"
  };
}

export function normalizeProductDetail(value: Partial<ProductDraft>): ProductDraft {
  return {
    ...createBlankProduct(),
    ...value,
    mediaAssets: Array.isArray(value.mediaAssets) ? value.mediaAssets : [],
    status: value.status === "active" ? "active" : "inactive"
  };
}

export function createBlankCategory(maxSortOrder: number): CategoryDraft {
  return {
    slug: "",
    nameZh: "",
    nameEn: "",
    sortOrder: maxSortOrder + 10,
    status: "inactive"
  };
}

export function adminPreviewUrl(value: string | null | undefined) {
  if (!value) return null;
  if (value.startsWith("/media/public/") || value.startsWith("https://")) return value;
  return null;
}
