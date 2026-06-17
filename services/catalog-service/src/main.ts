import "reflect-metadata";
import { BadRequestException, Body, Controller, Get, Headers, Inject, Injectable, Module, OnApplicationShutdown, Put, Query, ServiceUnavailableException } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { money } from "@commerce/money";
import { catalogCacheKeys, categoryWriteInvalidationKeys, productWriteInvalidationKeys, regionWriteInvalidationKeys } from "./cache-policy.js";
import type {
  CatalogCategory,
  CatalogMediaKind,
  CatalogProductStoryBlock,
  CatalogProductSummary,
  CatalogRegion,
  CatalogRegionIcon,
  CatalogStorefrontProduct,
  CatalogStorefrontSnapshot,
  LocalizedText,
  SkuSummary
} from "@commerce/contracts";
import { assertStoreContext, storeCacheKey, type StoreContext } from "@commerce/store-context";
import { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";

type CatalogProductRow = {
  product_id: string;
  store_id: string;
  product_title: string;
  slug: string;
  status: "draft" | "active" | "archived";
  sku_id: string;
  sku_code: string;
  sku_title: string;
  hs_code: string;
  material_composition: string;
  origin_country: string;
  capacity: string;
  package_length_mm: number;
  package_width_mm: number;
  package_height_mm: number;
  weight_grams: number;
  customs_declaration: string;
  price_minor: number;
  currency: string;
};

type CategoryRow = {
  id: string;
  store_id: string;
  slug: string;
  image_url: string;
  is_visible: boolean;
  sort_order: number;
  copy: LocalizedText<{ name: string }>;
};

type RegionRow = {
  id: string;
  store_id: string;
  slug: string;
  image_url: string;
  icon: CatalogRegionIcon;
  is_visible: boolean;
  show_on_homepage: boolean;
  sort_order: number;
  copy: LocalizedText<{
    name: string;
    landmark: string;
    title: string;
    description: string;
    more: string;
  }>;
};

type StorefrontProductTranslationRow = {
  product_id: string;
  store_id: string;
  slug: string;
  status: "draft" | "active" | "archived";
  image_url: string;
  price_minor: number;
  original_price_minor: number;
  currency: string;
  monthly_sales: number;
  stock_qty: number;
  sales_count: number;
  category_slug: string;
  region_slug: string;
  sku_id: string;
  sku_code: string;
  locale: string;
  name: string;
  tag: string;
  short_description: string;
  long_description: string;
  highlights: string[];
  material: string;
  capacity: string;
  origin: string;
  hs_code: string;
  customs_declaration: string;
  package_length_mm: number;
  package_width_mm: number;
  package_height_mm: number;
  weight_grams: number;
};

type StoryBlockRow = {
  product_id: string;
  locale: string;
  sort_order: number;
  title: string;
  body: string;
  media_kind: CatalogMediaKind;
  image_url: string;
  image_alt: string;
  poster_url: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  mime_type: string | null;
  byte_size: number | null;
};

type SaveCategoryInput = {
  slug?: string;
  nameZh?: string;
  nameEn?: string;
  sortOrder?: number;
  status?: "active" | "inactive";
  imageUrl?: string;
};

type SaveRegionInput = {
  slug?: string;
  nameZh?: string;
  nameEn?: string;
  landmarkZh?: string;
  landmarkEn?: string;
  icon?: CatalogRegionIcon;
  sortOrder?: number;
  showOnHomepage?: boolean;
  status?: "active" | "inactive";
  imageUrl?: string;
};

type SaveProductInput = {
  sku?: string;
  nameZh?: string;
  nameEn?: string;
  category?: string;
  region?: string;
  price?: number;
  detailZh?: string;
  detailEn?: string;
  materialZh?: string;
  materialEn?: string;
  originZh?: string;
  originEn?: string;
  originCountry?: string;
  capacityZh?: string;
  capacityEn?: string;
  hsCode?: string;
  packageLengthMm?: number;
  packageWidthMm?: number;
  packageHeightMm?: number;
  weightGrams?: number;
  customsDeclarationZh?: string;
  customsDeclarationEn?: string;
  status?: "active" | "inactive";
  imageUrl?: string;
};

type AdminProductRow = {
  product_id: string;
  sku_code: string;
  slug: string;
  status: "draft" | "active" | "archived";
  image_url: string;
  price_minor: number;
  category_slug: string;
  region_slug: string;
  hs_code: string;
  material_composition: string;
  origin_country: string;
  capacity: string;
  package_length_mm: number;
  package_width_mm: number;
  package_height_mm: number;
  weight_grams: number;
  customs_declaration: string;
  name_zh: string;
  name_en: string;
  detail_zh: string;
  detail_en: string;
  material_zh: string;
  material_en: string;
  origin_zh: string;
  origin_en: string;
  capacity_zh: string;
  capacity_en: string;
  customs_declaration_zh: string;
  customs_declaration_en: string;
};

type AdminProductList = {
  items: SaveProductInput[];
  page: number;
  size: number;
  total: number;
};

type CatalogAuditEvent = {
  id: string;
  storeId: string;
  entityType: "category" | "region" | "product";
  entityId: string;
  action: string;
  actorId: string;
  summary: string;
  oldValue: unknown;
  newValue: unknown;
  correlationId: string;
  createdAt: string;
};

type CatalogAuditEventRow = {
  id: string;
  store_id: string;
  entity_type: "category" | "region" | "product";
  entity_id: string;
  action: string;
  actor_id: string;
  summary: string;
  old_value: unknown;
  new_value: unknown;
  correlation_id: string;
  created_at: Date;
};

type CatalogReadiness = {
  service: "catalog-service";
  status: "ready" | "degraded";
  dependencies: {
    postgres: "ok";
    redis: "ok" | "unavailable";
  };
  cacheRequired: false;
};

const slowCatalogReadMs = Number(process.env.SLOW_CATALOG_READ_MS ?? 500);

function createStoreContext(correlationId: string | undefined): StoreContext {
  return assertStoreContext({
    storeId: process.env.DEFAULT_STORE_ID ?? "00000000-0000-4000-8000-000000000001",
    region: process.env.DEFAULT_STORE_REGION ?? "local",
    timezone: process.env.DEFAULT_STORE_TIMEZONE ?? "Asia/Hong_Kong",
    correlationId: correlationId ?? randomUUID()
  });
}

function actorFromHeader(actorId: string | undefined): string {
  return actorId?.trim() || "local-admin";
}

function warnIfSlow(operation: string, startedAt: number, thresholdMs: number, ctx: StoreContext) {
  const durationMs = Date.now() - startedAt;

  if (durationMs <= thresholdMs) {
    return;
  }

  console.warn(
    JSON.stringify({
      event: "slow_request",
      service: "catalog-service",
      operation,
      durationMs,
      thresholdMs,
      correlationId: ctx.correlationId
    })
  );
}

function normalizeSlug(value: string | undefined, field: string): string {
  const slug = value?.trim().toLowerCase();

  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new BadRequestException(`${field} must be a lowercase slug`);
  }

  return slug;
}

function normalizeText(value: string | undefined, field: string, maxLength = 240): string {
  const text = value?.trim();

  if (!text) {
    throw new BadRequestException(`${field} is required`);
  }

  if (text.length > maxLength) {
    throw new BadRequestException(`${field} is too long`);
  }

  return text;
}

function normalizeInteger(value: number | undefined, field: string, max = 999999): number {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue < 0 || numberValue > max) {
    throw new BadRequestException(`${field} must be an integer between 0 and ${max}`);
  }

  return numberValue;
}

function normalizeSortOrder(value: number | undefined): number {
  const sortOrder = Number(value ?? 0);

  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    throw new BadRequestException("sortOrder must be a non-negative integer");
  }

  return sortOrder;
}

function normalizePage(value: string | undefined): number {
  const page = Number(value ?? 1);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function normalizePageSize(value: string | undefined): number {
  const size = Number(value ?? 100);
  return Number.isInteger(size) && size > 0 ? Math.min(size, 200) : 100;
}

function normalizeImageUrl(value: string | undefined, fallback: string): string {
  const imageUrl = value?.trim();
  return imageUrl || fallback;
}

function normalizeSku(value: string | undefined): string {
  const sku = value?.trim().toUpperCase();

  if (!sku || sku.length > 80) {
    throw new BadRequestException("product.sku is required");
  }

  return sku;
}

function slugFromName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `product-${randomUUID().slice(0, 8)}`;
}

function normalizePriceMinor(value: number | undefined): number {
  const price = Number(value ?? 0);

  if (!Number.isFinite(price) || price < 0) {
    throw new BadRequestException("product.price must be a non-negative number");
  }

  return Math.round(price * 100);
}

function assertRegionIcon(value: string | undefined): CatalogRegionIcon {
  const icons: CatalogRegionIcon[] = ["palace", "skyline", "pavilion", "wall", "mountain", "bridge", "tower", "water", "statue", "pagoda"];

  if (!value || !icons.includes(value as CatalogRegionIcon)) {
    throw new BadRequestException("region icon is invalid");
  }

  return value as CatalogRegionIcon;
}

function emptyCopy<T>(): LocalizedText<T> {
  return {};
}

function ensureStoryBlocks(
  blocksByProductLocale: Map<string, CatalogProductStoryBlock[]>,
  productId: string,
  locale: string
): CatalogProductStoryBlock[] {
  return blocksByProductLocale.get(`${productId}:${locale}`) ?? [];
}

@Injectable()
class CatalogCache implements OnApplicationShutdown {
  private readonly redis?: Redis;

  constructor() {
    const redisUrl = process.env.CATALOG_REDIS_URL ?? process.env.REDIS_URL ?? "redis://localhost:6379";

    this.redis = new Redis(redisUrl, {
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 0
    });
    this.redis.on("error", () => undefined);
  }

  async get<T>(ctx: StoreContext, key: string): Promise<T | null> {
    try {
      await this.ensureConnected();
      const value = await this.redis?.get(this.cacheKey(ctx, key));
      return value ? (JSON.parse(value) as T) : null;
    } catch {
      return null;
    }
  }

  async set(ctx: StoreContext, key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.ensureConnected();
      const jitter = Math.floor(Math.random() * 20);
      await this.redis?.set(this.cacheKey(ctx, key), JSON.stringify(value), "EX", ttlSeconds + jitter);
    } catch {
      // Redis is an optimization for catalog reads. Database remains authoritative.
    }
  }

  async invalidate(ctx: StoreContext, keys: string[]): Promise<void> {
    try {
      await this.ensureConnected();
      const scopedKeys = keys.map((key) => this.cacheKey(ctx, key));
      if (scopedKeys.length > 0) {
        await this.redis?.del(...scopedKeys);
      }
    } catch {
      // Cache invalidation failure must not roll back an already committed catalog write.
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.ensureConnected();
      const response = await this.redis?.ping();
      return response === "PONG";
    } catch {
      return false;
    }
  }

  private cacheKey(ctx: StoreContext, key: string): string {
    const prefix = process.env.CACHE_KEY_PREFIX?.trim();
    const scopedKey = storeCacheKey(ctx, key);
    return prefix ? `${prefix}:${scopedKey}` : scopedKey;
  }

  private async ensureConnected(): Promise<void> {
    if (!this.redis || this.redis.status === "ready" || this.redis.status === "connecting") return;
    await this.redis.connect();
  }

  async onApplicationShutdown() {
    this.redis?.disconnect();
  }
}

@Injectable()
class CatalogRepository implements OnApplicationShutdown {
  constructor(@Inject(CatalogCache) private readonly cache: CatalogCache) {}

  private readonly pool = new Pool({
    connectionString:
      process.env.APP_DATABASE_URL ?? "postgres://commerce:commerce@localhost:5432/app_db"
  });

  async readiness(): Promise<CatalogReadiness> {
    try {
      await this.pool.query("SELECT 1");
    } catch {
      throw new ServiceUnavailableException({
        service: "catalog-service",
        status: "unavailable",
        dependencies: {
          postgres: "unavailable",
          redis: "unknown"
        }
      });
    }

    const redisReady = await this.cache.ping();

    return {
      service: "catalog-service",
      status: redisReady ? "ready" : "degraded",
      dependencies: {
        postgres: "ok",
        redis: redisReady ? "ok" : "unavailable"
      },
      cacheRequired: false
    };
  }

  async listActiveProducts(ctx: StoreContext): Promise<CatalogProductSummary[]> {
    const cached = await this.cache.get<CatalogProductSummary[]>(ctx, catalogCacheKeys.productSummaries);

    if (cached) {
      return cached;
    }

    const result = await this.pool.query<CatalogProductRow>(
      `
        SELECT
          p.id AS product_id,
          p.store_id,
          p.title AS product_title,
          p.slug,
          p.status,
          s.id AS sku_id,
          s.sku_code,
          s.title AS sku_title,
          s.hs_code,
          s.material_composition,
          s.origin_country,
          s.capacity,
          s.package_length_mm,
          s.package_width_mm,
          s.package_height_mm,
          s.weight_grams,
          s.customs_declaration,
          s.price_minor,
          s.currency
        FROM products p
        JOIN LATERAL (
          SELECT *
          FROM skus s
          WHERE s.store_id = p.store_id
            AND s.product_id = p.id
          ORDER BY s.created_at ASC
          LIMIT 1
        ) s ON TRUE
        WHERE p.store_id = $1
          AND p.status = 'active'
        ORDER BY p.created_at DESC
        LIMIT 24
      `,
      [ctx.storeId]
    );

    const products = result.rows.map((row) => ({
      id: row.product_id,
      storeId: row.store_id,
      title: row.product_title,
      slug: row.slug,
      status: row.status,
      primarySku: {
        id: row.sku_id,
        storeId: row.store_id,
        productId: row.product_id,
        skuCode: row.sku_code,
        title: row.sku_title,
        hsCode: row.hs_code,
        materialComposition: row.material_composition,
        originCountry: row.origin_country,
        capacity: row.capacity,
        packageDimensionsMm: {
          length: row.package_length_mm,
          width: row.package_width_mm,
          height: row.package_height_mm
        },
        weightGrams: row.weight_grams,
        customsDeclaration: row.customs_declaration,
        price: money(row.price_minor, row.currency)
      }
    }));
    await this.cache.set(ctx, catalogCacheKeys.productSummaries, products, 60);
    return products;
  }

  async listAdminProducts(ctx: StoreContext, page: number, size: number): Promise<AdminProductList> {
    const offset = (page - 1) * size;
    const [productResult, countResult] = await Promise.all([
      this.pool.query<AdminProductRow>(
        `
          SELECT
            p.id AS product_id,
            p.slug,
            p.status,
            p.image_url,
            s.sku_code,
            s.price_minor,
            c.slug AS category_slug,
            r.slug AS region_slug,
            s.hs_code,
            s.material_composition,
            s.origin_country,
            s.capacity,
            s.package_length_mm,
            s.package_width_mm,
            s.package_height_mm,
            s.weight_grams,
            s.customs_declaration,
            COALESCE(pt_zh.name, p.title) AS name_zh,
            COALESCE(pt_en.name, p.title) AS name_en,
            COALESCE(pt_zh.long_description, '') AS detail_zh,
            COALESCE(pt_en.long_description, '') AS detail_en,
            COALESCE(pt_zh.material, s.material_composition) AS material_zh,
            COALESCE(pt_en.material, s.material_composition) AS material_en,
            COALESCE(pt_zh.origin, s.origin_country) AS origin_zh,
            COALESCE(pt_en.origin, s.origin_country) AS origin_en,
            COALESCE(pt_zh.capacity, s.capacity) AS capacity_zh,
            COALESCE(pt_en.capacity, s.capacity) AS capacity_en,
            COALESCE(pt_zh.customs_declaration, s.customs_declaration) AS customs_declaration_zh,
            COALESCE(pt_en.customs_declaration, s.customs_declaration) AS customs_declaration_en
          FROM products p
          JOIN LATERAL (
            SELECT *
            FROM skus s
            WHERE s.store_id = p.store_id
              AND s.product_id = p.id
            ORDER BY s.created_at ASC
            LIMIT 1
          ) s ON TRUE
          JOIN categories c ON c.id = p.category_id
          JOIN regions r ON r.id = p.region_id
          LEFT JOIN product_translations pt_zh ON pt_zh.product_id = p.id AND pt_zh.locale = 'zh'
          LEFT JOIN product_translations pt_en ON pt_en.product_id = p.id AND pt_en.locale = 'en'
          WHERE p.store_id = $1
          ORDER BY p.created_at DESC
          LIMIT $2 OFFSET $3
        `,
        [ctx.storeId, size, offset]
      ),
      this.pool.query<{ count: string }>("SELECT count(*) FROM products WHERE store_id = $1", [ctx.storeId])
    ]);

    return {
      items: productResult.rows.map((row) => ({
        sku: row.sku_code,
        nameZh: row.name_zh,
        nameEn: row.name_en,
        category: row.category_slug,
        region: row.region_slug,
        price: row.price_minor / 100,
        detailZh: row.detail_zh,
        detailEn: row.detail_en,
        imageUrl: row.image_url,
        materialZh: row.material_zh,
        materialEn: row.material_en,
        originZh: row.origin_zh,
        originEn: row.origin_en,
        originCountry: row.origin_country,
        capacityZh: row.capacity_zh,
        capacityEn: row.capacity_en,
        hsCode: row.hs_code,
        packageLengthMm: row.package_length_mm,
        packageWidthMm: row.package_width_mm,
        packageHeightMm: row.package_height_mm,
        weightGrams: row.weight_grams,
        customsDeclarationZh: row.customs_declaration_zh,
        customsDeclarationEn: row.customs_declaration_en,
        status: row.status === "active" ? "active" : "inactive"
      })),
      page,
      size,
      total: Number(countResult.rows[0]?.count ?? 0)
    };
  }

  async listCategories(ctx: StoreContext): Promise<CatalogCategory[]> {
    const cached = await this.cache.get<CatalogCategory[]>(ctx, catalogCacheKeys.categories);

    if (cached) {
      return cached;
    }

    const result = await this.pool.query<CategoryRow>(
      `
        SELECT
          c.id,
          c.store_id,
          c.slug,
          c.image_url,
          c.is_visible,
          c.sort_order,
          jsonb_object_agg(
            ct.locale,
            jsonb_build_object('name', ct.name)
            ORDER BY ct.locale
          ) AS copy
        FROM categories c
        JOIN category_translations ct ON ct.category_id = c.id
        WHERE c.store_id = $1
        GROUP BY c.id
        ORDER BY c.sort_order ASC, c.slug ASC
      `,
      [ctx.storeId]
    );

    const categories = result.rows.map((row) => ({
      id: row.id,
      storeId: row.store_id,
      slug: row.slug,
      imageUrl: row.image_url,
      isVisible: row.is_visible,
      sortOrder: row.sort_order,
      copy: row.copy
    }));
    await this.cache.set(ctx, catalogCacheKeys.categories, categories, 120);
    return categories;
  }

  async listRegions(ctx: StoreContext): Promise<CatalogRegion[]> {
    const cached = await this.cache.get<CatalogRegion[]>(ctx, catalogCacheKeys.regions);

    if (cached) {
      return cached;
    }

    const result = await this.pool.query<RegionRow>(
      `
        SELECT
          r.id,
          r.store_id,
          r.slug,
          r.image_url,
          r.icon,
          r.is_visible,
          r.show_on_homepage,
          r.sort_order,
          jsonb_object_agg(
            rt.locale,
            jsonb_build_object(
              'name', rt.name,
              'landmark', rt.landmark,
              'title', rt.title,
              'description', rt.description,
              'more', rt.more_label
            )
            ORDER BY rt.locale
          ) AS copy
        FROM regions r
        JOIN region_translations rt ON rt.region_id = r.id
        WHERE r.store_id = $1
        GROUP BY r.id
        ORDER BY r.sort_order ASC, r.slug ASC
      `,
      [ctx.storeId]
    );

    const regions = result.rows.map((row) => ({
      id: row.id,
      storeId: row.store_id,
      slug: row.slug,
      imageUrl: row.image_url,
      icon: row.icon,
      isVisible: row.is_visible,
      showOnHomepage: row.show_on_homepage,
      sortOrder: row.sort_order,
      copy: row.copy
    }));
    await this.cache.set(ctx, catalogCacheKeys.regions, regions, 120);
    return regions;
  }

  async listStorefrontProducts(ctx: StoreContext): Promise<CatalogStorefrontProduct[]> {
    const cached = await this.cache.get<CatalogStorefrontProduct[]>(ctx, catalogCacheKeys.storefrontProducts);

    if (cached) {
      return cached;
    }

    const [productResult, storyResult] = await Promise.all([
      this.pool.query<StorefrontProductTranslationRow>(
        `
          SELECT
            p.id AS product_id,
            p.store_id,
            p.slug,
            p.status,
            p.image_url,
            s.price_minor,
            p.original_price_minor,
            s.currency,
            p.monthly_sales,
            p.stock_qty,
            p.sales_count,
            c.slug AS category_slug,
            r.slug AS region_slug,
            s.id AS sku_id,
            s.sku_code,
            pt.locale,
            pt.name,
            pt.tag,
            pt.short_description,
            pt.long_description,
            pt.highlights,
            pt.material,
            pt.capacity,
            pt.origin,
            pt.hs_code,
            pt.customs_declaration,
            s.package_length_mm,
            s.package_width_mm,
            s.package_height_mm,
            s.weight_grams
          FROM products p
          JOIN skus s ON s.store_id = p.store_id AND s.product_id = p.id
          JOIN categories c ON c.id = p.category_id
          JOIN regions r ON r.id = p.region_id
          JOIN product_translations pt ON pt.product_id = p.id
          WHERE p.store_id = $1
            AND p.status = 'active'
          ORDER BY p.created_at DESC, pt.locale ASC
        `,
        [ctx.storeId]
      ),
      this.pool.query<StoryBlockRow>(
        `
          SELECT
            product_id,
            locale,
            sort_order,
            title,
            body,
            COALESCE(media_kind, 'image') AS media_kind,
            image_url,
            image_alt,
            poster_url,
            width,
            height,
            duration_seconds::float8 AS duration_seconds,
            mime_type,
            byte_size
          FROM product_story_blocks
          WHERE store_id = $1
          ORDER BY product_id ASC, locale ASC, sort_order ASC
        `,
        [ctx.storeId]
      )
    ]);

    const blocksByProductLocale = new Map<string, CatalogProductStoryBlock[]>();

    for (const row of storyResult.rows) {
      const key = `${row.product_id}:${row.locale}`;
      const current = blocksByProductLocale.get(key) ?? [];
      current.push({
        sortOrder: row.sort_order,
        title: row.title,
        body: row.body,
        mediaKind: row.media_kind,
        imageUrl: row.image_url,
        imageAlt: row.image_alt,
        posterUrl: row.poster_url,
        width: row.width,
        height: row.height,
        durationSeconds: row.duration_seconds,
        mimeType: row.mime_type,
        byteSize: row.byte_size
      });
      blocksByProductLocale.set(key, current);
    }

    const products = new Map<string, CatalogStorefrontProduct>();

    for (const row of productResult.rows) {
      const existing = products.get(row.product_id);
      const product =
        existing ??
        {
          id: row.product_id,
          storeId: row.store_id,
          slug: row.slug,
          imageUrl: row.image_url,
          price: money(row.price_minor, row.currency),
          originalPrice: money(row.original_price_minor, row.currency),
          monthlySales: row.monthly_sales,
          stock: row.stock_qty,
          sales: row.sales_count,
          categorySlug: row.category_slug,
          regionSlug: row.region_slug,
          skuId: row.sku_id,
          skuCode: row.sku_code,
          status: row.status,
          copy: emptyCopy()
        };

      product.copy[row.locale] = {
        name: row.name,
        tag: row.tag,
        shortDescription: row.short_description,
        longDescription: row.long_description,
        storyBlocks: ensureStoryBlocks(blocksByProductLocale, row.product_id, row.locale),
        highlights: row.highlights,
        details: {
          material: row.material,
          capacity: row.capacity,
          origin: row.origin,
          hsCode: row.hs_code,
          customsDeclaration: row.customs_declaration,
          packageDimensionsMm: {
            length: row.package_length_mm,
            width: row.package_width_mm,
            height: row.package_height_mm
          },
          weightGrams: row.weight_grams
        }
      };

      products.set(row.product_id, product);
    }

    const storefrontProducts = [...products.values()];
    await this.cache.set(ctx, catalogCacheKeys.storefrontProducts, storefrontProducts, 60);
    return storefrontProducts;
  }

  async getStorefrontSnapshot(ctx: StoreContext): Promise<CatalogStorefrontSnapshot> {
    const cached = await this.cache.get<CatalogStorefrontSnapshot>(ctx, catalogCacheKeys.storefront);

    if (cached) {
      return cached;
    }

    const [categories, regions, products] = await Promise.all([
      this.listCategories(ctx),
      this.listRegions(ctx),
      this.listStorefrontProducts(ctx)
    ]);

    const snapshot = {
      storeId: ctx.storeId,
      generatedAt: new Date().toISOString(),
      categories,
      regions,
      products
    };
    await this.cache.set(ctx, catalogCacheKeys.storefront, snapshot, 60);
    return snapshot;
  }

  async auditEvents(ctx: StoreContext, limit = 50): Promise<{ events: CatalogAuditEvent[]; storageMode: "postgres" }> {
    const result = await this.pool.query<CatalogAuditEventRow>(
      `
        SELECT id, store_id, entity_type, entity_id, action, actor_id, summary, old_value, new_value, correlation_id, created_at
        FROM catalog_audit_events
        WHERE store_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [ctx.storeId, limit]
    );

    return {
      storageMode: "postgres",
      events: result.rows.map((row) => ({
        id: row.id,
        storeId: row.store_id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        action: row.action,
        actorId: row.actor_id,
        summary: row.summary,
        oldValue: row.old_value,
        newValue: row.new_value,
        correlationId: row.correlation_id,
        createdAt: row.created_at.toISOString()
      }))
    };
  }

  async saveCategories(ctx: StoreContext, categories: SaveCategoryInput[], actorId: string): Promise<CatalogCategory[]> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      for (const category of categories) {
        const slug = normalizeSlug(category.slug, "category.slug");
        const oldValue = await this.categoryAuditSnapshot(client, ctx.storeId, slug);
        const nameZh = normalizeText(category.nameZh, "category.nameZh");
        const nameEn = normalizeText(category.nameEn, "category.nameEn");
        const newValue = {
          slug,
          imageUrl: normalizeImageUrl(category.imageUrl, "/assets/porcelain-tea-set-photo.jpg"),
          isVisible: category.status !== "inactive",
          sortOrder: normalizeSortOrder(category.sortOrder),
          copy: {
            zh: { name: nameZh },
            en: { name: nameEn }
          }
        };
        const idResult = await client.query<{ id: string }>(
          `
            INSERT INTO categories (id, store_id, slug, image_url, is_visible, sort_order)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (store_id, slug) DO UPDATE
            SET image_url = EXCLUDED.image_url,
                is_visible = EXCLUDED.is_visible,
                sort_order = EXCLUDED.sort_order,
                updated_at = now()
            RETURNING id
          `,
          [
            randomUUID(),
            ctx.storeId,
            slug,
            newValue.imageUrl,
            newValue.isVisible,
            newValue.sortOrder
          ]
        );
        const categoryId = idResult.rows[0].id;

        await client.query(
          `
            INSERT INTO category_translations (category_id, locale, name)
            VALUES ($1, 'zh', $2), ($1, 'en', $3)
            ON CONFLICT (category_id, locale) DO UPDATE
            SET name = EXCLUDED.name
          `,
          [
            categoryId,
            nameZh,
            nameEn
          ]
        );
        await this.recordAudit(client, {
          id: randomUUID(),
          storeId: ctx.storeId,
          entityType: "category",
          entityId: categoryId,
          action: oldValue ? "catalog.category.update" : "catalog.category.create",
          actorId,
          summary: `${oldValue ? "更新" : "新增"}商品分类：${nameZh} / ${nameEn}`,
          oldValue,
          newValue,
          correlationId: ctx.correlationId,
          createdAt: new Date().toISOString()
        });
      }

      await client.query("COMMIT");
      await this.cache.invalidate(ctx, categoryWriteInvalidationKeys());
      return this.listCategories(ctx);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async saveRegions(ctx: StoreContext, regions: SaveRegionInput[], actorId: string): Promise<CatalogRegion[]> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      for (const region of regions) {
        const slug = normalizeSlug(region.slug, "region.slug");
        const oldValue = await this.regionAuditSnapshot(client, ctx.storeId, slug);
        const nameEn = normalizeText(region.nameEn, "region.nameEn");
        const nameZh = normalizeText(region.nameZh, "region.nameZh");
        const landmarkEn = normalizeText(region.landmarkEn, "region.landmarkEn");
        const landmarkZh = normalizeText(region.landmarkZh, "region.landmarkZh");
        const newValue = {
          slug,
          imageUrl: normalizeImageUrl(region.imageUrl, "/assets/region-jiangxi-tengwang.jpg"),
          icon: assertRegionIcon(region.icon),
          isVisible: region.status !== "inactive",
          showOnHomepage: region.showOnHomepage === true,
          sortOrder: normalizeSortOrder(region.sortOrder),
          copy: {
            zh: {
              name: nameZh,
              landmark: landmarkZh,
              title: `${nameZh}地域定制瓷器`,
              description: `以${landmarkZh}为视觉线索，面向地域礼品、城市故事和定制茶具系列。`,
              more: "更多"
            },
            en: {
              name: nameEn,
              landmark: landmarkEn,
              title: `${nameEn} Custom Porcelain`,
              description: `${landmarkEn}-inspired teaware for regional gifts, cultural storytelling, and custom porcelain collections.`,
              more: "More"
            }
          }
        };
        const idResult = await client.query<{ id: string }>(
          `
            INSERT INTO regions (id, store_id, slug, image_url, icon, is_visible, show_on_homepage, sort_order)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (store_id, slug) DO UPDATE
            SET image_url = EXCLUDED.image_url,
                icon = EXCLUDED.icon,
                is_visible = EXCLUDED.is_visible,
                show_on_homepage = EXCLUDED.show_on_homepage,
                sort_order = EXCLUDED.sort_order,
                updated_at = now()
            RETURNING id
          `,
          [
            randomUUID(),
            ctx.storeId,
            slug,
            newValue.imageUrl,
            newValue.icon,
            newValue.isVisible,
            newValue.showOnHomepage,
            newValue.sortOrder
          ]
        );
        const regionId = idResult.rows[0].id;

        await client.query(
          `
            INSERT INTO region_translations (region_id, locale, name, landmark, title, description, more_label)
            VALUES
              ($1, 'zh', $2, $3, $4, $5, '更多'),
              ($1, 'en', $6, $7, $8, $9, 'More')
            ON CONFLICT (region_id, locale) DO UPDATE
            SET name = EXCLUDED.name,
                landmark = EXCLUDED.landmark,
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                more_label = EXCLUDED.more_label
          `,
          [
            regionId,
            nameZh,
            landmarkZh,
            newValue.copy.zh.title,
            newValue.copy.zh.description,
            nameEn,
            landmarkEn,
            newValue.copy.en.title,
            newValue.copy.en.description
          ]
        );
        await this.recordAudit(client, {
          id: randomUUID(),
          storeId: ctx.storeId,
          entityType: "region",
          entityId: regionId,
          action: oldValue ? "catalog.region.update" : "catalog.region.create",
          actorId,
          summary: `${oldValue ? "更新" : "新增"}地域分类：${nameZh} / ${nameEn}`,
          oldValue,
          newValue,
          correlationId: ctx.correlationId,
          createdAt: new Date().toISOString()
        });
      }

      await client.query("COMMIT");
      await this.cache.invalidate(ctx, regionWriteInvalidationKeys());
      return this.listRegions(ctx);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async saveProducts(ctx: StoreContext, products: SaveProductInput[], actorId: string): Promise<CatalogStorefrontProduct[]> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      for (const product of products) {
        const sku = normalizeSku(product.sku);
        const oldValue = await this.productAuditSnapshot(client, ctx.storeId, sku);
        const nameEn = normalizeText(product.nameEn, "product.nameEn");
        const nameZh = normalizeText(product.nameZh, "product.nameZh");
        const categorySlug = normalizeSlug(product.category, "product.category");
        const regionSlug = normalizeSlug(product.region, "product.region");
        const categoryResult = await client.query<{ id: string }>(
          "SELECT id FROM categories WHERE store_id = $1 AND slug = $2",
          [ctx.storeId, categorySlug]
        );
        const regionResult = await client.query<{ id: string }>(
          "SELECT id FROM regions WHERE store_id = $1 AND slug = $2",
          [ctx.storeId, regionSlug]
        );

        if (!categoryResult.rows[0]) {
          throw new BadRequestException(`category ${categorySlug} does not exist`);
        }

        if (!regionResult.rows[0]) {
          throw new BadRequestException(`region ${regionSlug} does not exist`);
        }

        const existingSkuResult = await client.query<{ product_id: string }>(
          "SELECT product_id FROM skus WHERE store_id = $1 AND sku_code = $2",
          [ctx.storeId, sku]
        );
        const productId = existingSkuResult.rows[0]?.product_id ?? randomUUID();
        const slug = slugFromName(nameEn);
        const priceMinor = normalizePriceMinor(product.price);
        const materialZh = normalizeText(product.materialZh, "product.materialZh");
        const materialEn = normalizeText(product.materialEn, "product.materialEn");
        const originZh = normalizeText(product.originZh, "product.originZh");
        const originEn = normalizeText(product.originEn, "product.originEn");
        const originCountry = normalizeText(product.originCountry, "product.originCountry", 2).toUpperCase();
        const capacityZh = normalizeText(product.capacityZh, "product.capacityZh");
        const capacityEn = normalizeText(product.capacityEn, "product.capacityEn");
        const hsCode = normalizeText(product.hsCode, "product.hsCode", 32);
        const packageLengthMm = normalizeInteger(product.packageLengthMm, "product.packageLengthMm");
        const packageWidthMm = normalizeInteger(product.packageWidthMm, "product.packageWidthMm");
        const packageHeightMm = normalizeInteger(product.packageHeightMm, "product.packageHeightMm");
        const weightGrams = normalizeInteger(product.weightGrams, "product.weightGrams");
        const customsDeclarationZh = normalizeText(product.customsDeclarationZh, "product.customsDeclarationZh", 500);
        const customsDeclarationEn = normalizeText(product.customsDeclarationEn, "product.customsDeclarationEn", 500);
        const newValue = {
          sku,
          slug,
          nameZh,
          nameEn,
          category: categorySlug,
          region: regionSlug,
          status: product.status === "active" ? "active" : "draft",
          imageUrl: normalizeImageUrl(product.imageUrl, "/assets/porcelain-tea-set-photo.jpg"),
          priceMinor,
          originalPriceMinor: Math.round(priceMinor * 1.2),
          materialZh,
          materialEn,
          originZh,
          originEn,
          originCountry,
          capacityZh,
          capacityEn,
          hsCode,
          packageLengthMm,
          packageWidthMm,
          packageHeightMm,
          weightGrams,
          customsDeclarationZh,
          customsDeclarationEn
        };

        await client.query(
          `
            INSERT INTO products (
              id,
              store_id,
              title,
              slug,
              status,
              category_id,
              region_id,
              image_url,
              original_price_minor,
              monthly_sales,
              stock_qty,
              sales_count
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 0, 0)
            ON CONFLICT (id) DO UPDATE
            SET title = EXCLUDED.title,
                status = EXCLUDED.status,
                category_id = EXCLUDED.category_id,
                region_id = EXCLUDED.region_id,
                image_url = EXCLUDED.image_url,
                original_price_minor = EXCLUDED.original_price_minor
          `,
          [
            productId,
            ctx.storeId,
            nameEn,
            slug,
            newValue.status,
            categoryResult.rows[0].id,
            regionResult.rows[0].id,
            newValue.imageUrl,
            newValue.originalPriceMinor
          ]
        );

        await client.query(
          `
            INSERT INTO skus (
              id,
              store_id,
              product_id,
              sku_code,
              title,
              material_composition,
              hs_code,
              origin_country,
              capacity,
              package_length_mm,
              package_width_mm,
              package_height_mm,
              weight_grams,
              customs_declaration,
              price_minor,
              currency
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'USD')
            ON CONFLICT (store_id, sku_code) DO UPDATE
            SET title = EXCLUDED.title,
                material_composition = EXCLUDED.material_composition,
                hs_code = EXCLUDED.hs_code,
                origin_country = EXCLUDED.origin_country,
                capacity = EXCLUDED.capacity,
                package_length_mm = EXCLUDED.package_length_mm,
                package_width_mm = EXCLUDED.package_width_mm,
                package_height_mm = EXCLUDED.package_height_mm,
                weight_grams = EXCLUDED.weight_grams,
                customs_declaration = EXCLUDED.customs_declaration,
                price_minor = EXCLUDED.price_minor,
                currency = EXCLUDED.currency
          `,
          [
            randomUUID(),
            ctx.storeId,
            productId,
            sku,
            `${nameEn} / Default`,
            materialEn,
            hsCode,
            originCountry,
            capacityEn,
            packageLengthMm,
            packageWidthMm,
            packageHeightMm,
            weightGrams,
            customsDeclarationEn,
            priceMinor
          ]
        );

        await client.query(
          `
            INSERT INTO product_translations (
              product_id,
              locale,
              name,
              tag,
              short_description,
              long_description,
              highlights,
              material,
              capacity,
              origin,
              hs_code,
              customs_declaration
            )
            VALUES
              ($1, 'zh', $2, '商品', $3, $3, '[]'::jsonb, $6, $7, $8, $9, $10),
              ($1, 'en', $4, 'Product', $5, $5, '[]'::jsonb, $11, $12, $13, $9, $14)
            ON CONFLICT (product_id, locale) DO UPDATE
            SET name = EXCLUDED.name,
                short_description = EXCLUDED.short_description,
                long_description = EXCLUDED.long_description,
                material = EXCLUDED.material,
                capacity = EXCLUDED.capacity,
                origin = EXCLUDED.origin,
                hs_code = EXCLUDED.hs_code,
                customs_declaration = EXCLUDED.customs_declaration
          `,
          [
            productId,
            nameZh,
            normalizeText(product.detailZh, "product.detailZh", 2000),
            nameEn,
            normalizeText(product.detailEn, "product.detailEn", 2000),
            materialZh,
            capacityZh,
            originZh,
            hsCode,
            customsDeclarationZh,
            materialEn,
            capacityEn,
            originEn,
            customsDeclarationEn
          ]
        );
        await this.recordAudit(client, {
          id: randomUUID(),
          storeId: ctx.storeId,
          entityType: "product",
          entityId: productId,
          action: oldValue ? "catalog.product.update" : "catalog.product.create",
          actorId,
          summary: `${oldValue ? "更新" : "新增"}商品：${nameZh} / ${nameEn}`,
          oldValue,
          newValue,
          correlationId: ctx.correlationId,
          createdAt: new Date().toISOString()
        });
      }

      await client.query("COMMIT");
      await this.cache.invalidate(ctx, productWriteInvalidationKeys());
      return this.listStorefrontProducts(ctx);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async onApplicationShutdown() {
    await this.pool.end();
  }

  private async recordAudit(client: PoolClient, event: CatalogAuditEvent) {
    await client.query(
      `
        INSERT INTO catalog_audit_events (
          id, store_id, entity_type, entity_id, action, actor_id, summary, old_value, new_value, correlation_id, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11)
      `,
      [
        event.id,
        event.storeId,
        event.entityType,
        event.entityId,
        event.action,
        event.actorId,
        event.summary,
        JSON.stringify(event.oldValue),
        JSON.stringify(event.newValue),
        event.correlationId,
        event.createdAt
      ]
    );
  }

  private async categoryAuditSnapshot(client: PoolClient, storeId: string, slug: string): Promise<unknown | null> {
    const result = await client.query<{ value: unknown }>(
      `
        SELECT jsonb_build_object(
          'id', c.id,
          'slug', c.slug,
          'imageUrl', c.image_url,
          'isVisible', c.is_visible,
          'sortOrder', c.sort_order,
          'copy', jsonb_object_agg(ct.locale, jsonb_build_object('name', ct.name) ORDER BY ct.locale)
        ) AS value
        FROM categories c
        LEFT JOIN category_translations ct ON ct.category_id = c.id
        WHERE c.store_id = $1 AND c.slug = $2
        GROUP BY c.id
        LIMIT 1
      `,
      [storeId, slug]
    );
    return result.rows[0]?.value ?? null;
  }

  private async regionAuditSnapshot(client: PoolClient, storeId: string, slug: string): Promise<unknown | null> {
    const result = await client.query<{ value: unknown }>(
      `
        SELECT jsonb_build_object(
          'id', r.id,
          'slug', r.slug,
          'imageUrl', r.image_url,
          'icon', r.icon,
          'isVisible', r.is_visible,
          'showOnHomepage', r.show_on_homepage,
          'sortOrder', r.sort_order,
          'copy', jsonb_object_agg(
            rt.locale,
            jsonb_build_object(
              'name', rt.name,
              'landmark', rt.landmark,
              'title', rt.title,
              'description', rt.description,
              'more', rt.more_label
            )
            ORDER BY rt.locale
          )
        ) AS value
        FROM regions r
        LEFT JOIN region_translations rt ON rt.region_id = r.id
        WHERE r.store_id = $1 AND r.slug = $2
        GROUP BY r.id
        LIMIT 1
      `,
      [storeId, slug]
    );
    return result.rows[0]?.value ?? null;
  }

  private async productAuditSnapshot(client: PoolClient, storeId: string, sku: string): Promise<unknown | null> {
    const result = await client.query<{ value: unknown }>(
      `
        SELECT jsonb_build_object(
          'productId', p.id,
          'sku', s.sku_code,
          'slug', p.slug,
          'status', p.status,
          'imageUrl', p.image_url,
          'category', c.slug,
          'region', r.slug,
          'priceMinor', s.price_minor,
          'originalPriceMinor', p.original_price_minor,
          'materialComposition', s.material_composition,
          'hsCode', s.hs_code,
          'originCountry', s.origin_country,
          'capacity', s.capacity,
          'packageLengthMm', s.package_length_mm,
          'packageWidthMm', s.package_width_mm,
          'packageHeightMm', s.package_height_mm,
          'weightGrams', s.weight_grams,
          'customsDeclaration', s.customs_declaration,
          'copy', COALESCE((
            SELECT jsonb_object_agg(
              pt.locale,
              jsonb_build_object(
                'name', pt.name,
                'shortDescription', pt.short_description,
                'longDescription', pt.long_description,
                'material', pt.material,
                'capacity', pt.capacity,
                'origin', pt.origin,
                'hsCode', pt.hs_code,
                'customsDeclaration', pt.customs_declaration
              )
              ORDER BY pt.locale
            )
            FROM product_translations pt
            WHERE pt.product_id = p.id
          ), '{}'::jsonb)
        ) AS value
        FROM skus s
        JOIN products p ON p.id = s.product_id AND p.store_id = s.store_id
        JOIN categories c ON c.id = p.category_id
        JOIN regions r ON r.id = p.region_id
        WHERE s.store_id = $1 AND s.sku_code = $2
        LIMIT 1
      `,
      [storeId, sku]
    );
    return result.rows[0]?.value ?? null;
  }
}

@Controller()
class CatalogController {
  constructor(@Inject(CatalogRepository) private readonly catalogRepository: CatalogRepository) {}

  @Get("/health")
  health() {
    return { service: "catalog-service", status: "ok" };
  }

  @Get("/ready")
  ready(): Promise<CatalogReadiness> {
    return this.catalogRepository.readiness();
  }

  @Get("/products")
  async products(
    @Headers("x-correlation-id") correlationId: string | undefined
  ): Promise<CatalogProductSummary[]> {
    const ctx = createStoreContext(correlationId);
    const startedAt = Date.now();

    try {
      return await this.catalogRepository.listActiveProducts(ctx);
    } finally {
      warnIfSlow("catalog.products", startedAt, slowCatalogReadMs, ctx);
    }
  }

  @Get("/admin/products")
  async adminProducts(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Query("page") page: string | undefined,
    @Query("size") size: string | undefined
  ): Promise<AdminProductList> {
    const ctx = createStoreContext(correlationId);
    const startedAt = Date.now();

    try {
      return await this.catalogRepository.listAdminProducts(ctx, normalizePage(page), normalizePageSize(size));
    } finally {
      warnIfSlow("catalog.admin.products", startedAt, slowCatalogReadMs, ctx);
    }
  }

  @Get("/categories")
  async categories(@Headers("x-correlation-id") correlationId: string | undefined): Promise<CatalogCategory[]> {
    const ctx = createStoreContext(correlationId);
    const startedAt = Date.now();

    try {
      return await this.catalogRepository.listCategories(ctx);
    } finally {
      warnIfSlow("catalog.categories", startedAt, slowCatalogReadMs, ctx);
    }
  }

  @Get("/regions")
  async regions(@Headers("x-correlation-id") correlationId: string | undefined): Promise<CatalogRegion[]> {
    const ctx = createStoreContext(correlationId);
    const startedAt = Date.now();

    try {
      return await this.catalogRepository.listRegions(ctx);
    } finally {
      warnIfSlow("catalog.regions", startedAt, slowCatalogReadMs, ctx);
    }
  }

  @Put("/categories")
  async saveCategories(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Headers("x-admin-actor") actorId: string | undefined,
    @Body() body: { categories?: SaveCategoryInput[] }
  ): Promise<CatalogCategory[]> {
    const ctx = createStoreContext(correlationId);
    return this.catalogRepository.saveCategories(ctx, body.categories ?? [], actorFromHeader(actorId));
  }

  @Put("/regions")
  async saveRegions(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Headers("x-admin-actor") actorId: string | undefined,
    @Body() body: { regions?: SaveRegionInput[] }
  ): Promise<CatalogRegion[]> {
    const ctx = createStoreContext(correlationId);
    return this.catalogRepository.saveRegions(ctx, body.regions ?? [], actorFromHeader(actorId));
  }

  @Put("/products")
  async saveProducts(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Headers("x-admin-actor") actorId: string | undefined,
    @Body() body: { products?: SaveProductInput[] }
  ): Promise<CatalogStorefrontProduct[]> {
    const ctx = createStoreContext(correlationId);
    return this.catalogRepository.saveProducts(ctx, body.products ?? [], actorFromHeader(actorId));
  }

  @Get("/audit-events")
  auditEvents(@Headers("x-correlation-id") correlationId: string | undefined) {
    const ctx = createStoreContext(correlationId);
    return this.catalogRepository.auditEvents(ctx);
  }

  @Get("/storefront")
  async storefront(@Headers("x-correlation-id") correlationId: string | undefined): Promise<CatalogStorefrontSnapshot> {
    const ctx = createStoreContext(correlationId);
    const startedAt = Date.now();

    try {
      return await this.catalogRepository.getStorefrontSnapshot(ctx);
    } finally {
      warnIfSlow("catalog.storefront", startedAt, slowCatalogReadMs, ctx);
    }
  }

  @Get("/demo-sku")
  demoSku(): SkuSummary {
    return {
      id: "00000000-0000-4000-8000-000000002001",
      storeId: "00000000-0000-4000-8000-000000000001",
      productId: "00000000-0000-4000-8000-000000001001",
      skuCode: "TEA-PORCELAIN-SET-001",
      title: "Porcelain Tea Set / White",
      hsCode: "691110",
      materialComposition: "Porcelain ceramic",
      originCountry: "CN",
      capacity: "Teapot 180 ml, cups 40 ml",
      packageDimensionsMm: {
        length: 320,
        width: 240,
        height: 120
      },
      weightGrams: 1500,
      customsDeclaration: "Porcelain teaware set for household tea brewing",
      price: money(9600, "USD")
    };
  }
}

@Module({ controllers: [CatalogController], providers: [CatalogCache, CatalogRepository] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  await app.listen(Number(process.env.PORT ?? 4103), "0.0.0.0");
}

void bootstrap();
