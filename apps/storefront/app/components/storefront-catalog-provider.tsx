"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { CatalogStorefrontSnapshot } from "@commerce/contracts";
import {
  productCategories as fallbackCategories,
  products as fallbackProducts,
  regions as fallbackRegions
} from "../lib/storefront-content.js";
import type {
  Locale,
  ProductContent,
  StorefrontCategory,
  StorefrontProduct,
  StorefrontRegion
} from "../lib/storefront-content.js";

type StorefrontCatalogData = {
  products: StorefrontProduct[];
  productCategories: StorefrontCategory[];
  regions: StorefrontRegion[];
  source: "fallback" | "api";
};

const fallbackCatalog: StorefrontCatalogData = {
  products: fallbackProducts,
  productCategories: fallbackCategories,
  regions: fallbackRegions,
  source: "fallback"
};

const CatalogContext = createContext<StorefrontCatalogData>(fallbackCatalog);
const apiGatewayUrl = process.env.NEXT_PUBLIC_API_GATEWAY_URL ?? "http://localhost:4000";

function formatPrice(amountMinor: number) {
  return `$${Math.round(amountMinor / 100)}`;
}

function localeCopy<T>(copy: Record<string, T>, locale: Locale): T {
  return copy[locale] ?? copy.en ?? Object.values(copy)[0];
}

function mapProductCopy(copy: ReturnType<typeof localeCopy<CatalogStorefrontSnapshot["products"][number]["copy"][string]>>): ProductContent {
  return {
    name: copy.name,
    tag: copy.tag,
    shortDescription: copy.shortDescription,
    longDescription: copy.longDescription,
    storyBlocks: copy.storyBlocks.map((block) => ({
      title: block.title,
      body: block.body,
      mediaKind: block.mediaKind,
      image: block.imageUrl,
      imageAlt: block.imageAlt,
      poster: block.posterUrl,
      width: block.width,
      height: block.height,
      durationSeconds: block.durationSeconds,
      mimeType: block.mimeType,
      byteSize: block.byteSize
    })),
    highlights: copy.highlights,
    details: copy.details
  };
}

function mapSnapshot(snapshot: CatalogStorefrontSnapshot): StorefrontCatalogData {
  const productCategories = snapshot.categories.map<StorefrontCategory>((category) => ({
    slug: category.slug,
    image: category.imageUrl,
    isVisible: category.isVisible,
    sortOrder: category.sortOrder,
    copy: {
      en: localeCopy(category.copy, "en"),
      zh: localeCopy(category.copy, "zh")
    }
  }));

  const regions = snapshot.regions.map<StorefrontRegion>((region) => ({
    slug: region.slug,
    image: region.imageUrl,
    icon: region.icon,
    isVisible: region.isVisible,
    showOnHomepage: region.showOnHomepage,
    sortOrder: region.sortOrder,
    copy: {
      en: localeCopy(region.copy, "en"),
      zh: localeCopy(region.copy, "zh")
    }
  }));

  const products = snapshot.products.map<StorefrontProduct>((product) => ({
    slug: product.slug,
    image: product.imageUrl,
    price: formatPrice(product.price.amountMinor),
    priceValue: Math.round(product.price.amountMinor / 100),
    originalPrice: formatPrice(product.originalPrice.amountMinor),
    originalPriceValue: Math.round(product.originalPrice.amountMinor / 100),
    monthlySales: product.monthlySales,
    stock: product.stock,
    sales: product.sales,
    category: product.categorySlug,
    region: product.regionSlug,
    skuId: product.skuId,
    sku: product.skuCode,
    copy: {
      en: mapProductCopy(localeCopy(product.copy, "en")),
      zh: mapProductCopy(localeCopy(product.copy, "zh"))
    }
  }));

  return { products, productCategories, regions, source: "api" };
}

export function StorefrontCatalogProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<StorefrontCatalogData>(fallbackCatalog);

  useEffect(() => {
    let isMounted = true;

    async function loadCatalog() {
      try {
        const response = await fetch(`${apiGatewayUrl}/catalog/storefront`, {
          headers: { "x-correlation-id": crypto.randomUUID() }
        });

        if (!response.ok) return;

        const snapshot = (await response.json()) as CatalogStorefrontSnapshot;
        const mapped = mapSnapshot(snapshot);

        if (isMounted && mapped.products.length > 0) {
          setCatalog(mapped);
        }
      } catch {
        // Local development can run without PostgreSQL/API gateway; fallback data keeps the storefront usable.
      }
    }

    void loadCatalog();

    return () => {
      isMounted = false;
    };
  }, []);

  const value = useMemo(() => catalog, [catalog]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useStorefrontCatalog() {
  return useContext(CatalogContext);
}
