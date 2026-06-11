"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";
import type { Locale, RegionIconKey, StorefrontRegion, storefrontCopy } from "../lib/storefront-content.js";
import { useStorefrontCatalog } from "./storefront-catalog-provider.js";

type RegionCollectionProps = {
  locale: Locale;
  copy: (typeof storefrontCopy)[Locale];
};

type RegionIconProps = {
  icon: RegionIconKey;
  className?: string;
};

export function RegionLineIcon({ icon, className = "h-12 w-12" }: RegionIconProps) {
  if (icon === "skyline") {
    return (
      <svg aria-hidden="true" className={className} viewBox="0 0 64 64" fill="none">
        <path d="M8 52h48" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M14 52V32h10v20M24 52V22h10v30M34 52V28h10v24M44 52V18h8v34" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M18 38h3M18 44h3M28 29h3M28 36h3M28 43h3M38 35h3M38 42h3M48 25h2M48 32h2M48 39h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "pavilion") {
    return (
      <svg aria-hidden="true" className={className} viewBox="0 0 64 64" fill="none">
        <path d="M12 28h40L32 14 12 28Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M17 28v20M27 28v20M37 28v20M47 28v20M12 48h40M10 54h44" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M20 22c6 2 18 2 24 0M24 38h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "wall") {
    return (
      <svg aria-hidden="true" className={className} viewBox="0 0 64 64" fill="none">
        <path d="M8 45c10-12 18-12 28-2s17 8 21-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M11 41h8v10h-8zM29 37h8v10h-8zM47 35h8v10h-8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M14 41v-5M33 37v-5M51 35v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "mountain") {
    return (
      <svg aria-hidden="true" className={className} viewBox="0 0 64 64" fill="none">
        <path d="M7 50 24 22l10 16 7-10 16 22H7Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="m20 29 5 4 4-6M39 31l4 5 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 54h40" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "bridge") {
    return (
      <svg aria-hidden="true" className={className} viewBox="0 0 64 64" fill="none">
        <path d="M9 41c8-14 38-14 46 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 41h40M17 41v10M25 39v12M33 38v13M41 39v12M49 41v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M10 52h44" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "tower") {
    return (
      <svg aria-hidden="true" className={className} viewBox="0 0 64 64" fill="none">
        <path d="M32 10v44M24 54h16M26 22h12M22 35h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="m32 10-6 44M32 10l6 44M18 54h44M48 54V30h8v24M50 37h4M50 44h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (icon === "water") {
    return (
      <svg aria-hidden="true" className={className} viewBox="0 0 64 64" fill="none">
        <path d="M10 44c5-4 10-4 15 0s10 4 15 0 9-4 14 0M12 51c5-3 10-3 15 0s9 3 14 0 8-3 13 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M18 38 31 18l8 13 5-7 9 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (icon === "statue") {
    return (
      <svg aria-hidden="true" className={className} viewBox="0 0 64 64" fill="none">
        <path d="M32 13c7 0 12 6 12 14 0 13-8 18-12 18s-12-5-12-18c0-8 5-14 12-14Z" stroke="currentColor" strokeWidth="2" />
        <path d="M24 50h16M21 56h22M27 28c2 2 8 2 10 0M28 21h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M19 35c-5 2-8 5-10 10M45 35c5 2 8 5 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "pagoda") {
    return (
      <svg aria-hidden="true" className={className} viewBox="0 0 64 64" fill="none">
        <path d="M32 10 18 22h28L32 10ZM21 30h22L32 22 21 30ZM24 38h16L32 30 24 38Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M24 22v28M40 22v28M20 50h24M17 56h30" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 64 64" fill="none">
      <path d="M12 30h40L32 16 12 30Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M16 30v18M24 30v18M32 30v18M40 30v18M48 30v18M12 48h40M10 54h44" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M25 24h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function getHomepageRegions(regions: StorefrontRegion[]): StorefrontRegion[] {
  return regions
    .filter((region) => region.isVisible && region.showOnHomepage)
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

function getAllVisibleRegions(regions: StorefrontRegion[]): StorefrontRegion[] {
  return regions
    .filter((region) => region.isVisible)
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

export function RegionCollection({ locale, copy }: RegionCollectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const catalog = useStorefrontCatalog();
  const homepageRegions = useMemo(() => getHomepageRegions(catalog.regions).slice(0, 4), [catalog.regions]);
  const allVisibleRegions = useMemo(() => getAllVisibleRegions(catalog.regions), [catalog.regions]);
  const visibleRegions = isExpanded ? allVisibleRegions : homepageRegions;

  if (visibleRegions.length === 0) return null;

  return (
    <section className="relative overflow-hidden border-y border-[var(--line)] bg-white">
      <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
            {copy.regionNavTitle}
          </p>
          <h2 className="mt-2 text-3xl font-semibold leading-tight sm:text-4xl">{copy.regionTitle}</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)] sm:max-w-2xl">{copy.regionDescription}</p>
        </div>

        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {visibleRegions.map((region) => {
            const regionCopy = region.copy[locale];

            return (
              <Link
                key={region.slug}
                aria-label={`${regionCopy.name} ${regionCopy.more}`}
                className="group relative flex min-h-[7.25rem] items-center overflow-hidden rounded-2xl border border-black/45 bg-white px-5 py-4 text-black transition hover:border-black hover:shadow-sm"
                href={`/regions/${region.slug}` as Route}
              >
                <RegionLineIcon className="absolute -right-4 -top-4 h-36 w-36 text-black opacity-[0.07] transition duration-300 group-hover:opacity-[0.13] sm:h-44 sm:w-44" icon={region.icon} />
                <div className="absolute inset-0 bg-gradient-to-r from-white via-white/92 to-white/45" />
                <div className="relative flex min-w-0 items-center gap-4">
                  <RegionLineIcon className="h-12 w-12 shrink-0" icon={region.icon} />
                  <div className="min-w-0">
                    <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
                      {regionCopy.landmark}
                    </span>
                    <span className="mt-1 block text-lg font-semibold leading-tight text-black sm:text-xl">
                    {regionCopy.name}
                  </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {allVisibleRegions.length > 4 ? (
          <div className="mt-6 flex justify-center">
          <button
            aria-label={isExpanded ? (locale === "zh" ? "收回地域分类" : "Collapse regions") : (locale === "zh" ? "展开全部地域" : "Expand all regions")}
            className="inline-flex h-11 items-center rounded-full border border-black px-5 text-sm font-semibold"
            onClick={() => setIsExpanded((value) => !value)}
            type="button"
          >
            {isExpanded ? (locale === "zh" ? "收回" : "Collapse") : copy.viewAll}
          </button>
        </div>
        ) : null}
      </div>
    </section>
  );
}
