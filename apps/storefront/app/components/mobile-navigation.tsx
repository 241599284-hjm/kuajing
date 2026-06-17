"use client";

import { ChevronDown, ChevronRight, ChevronUp, Menu, X } from "lucide-react";
import { useState } from "react";
import type { Locale, storefrontCopy } from "../lib/storefront-content.js";
import { MarketPreferenceSelector } from "./market-preference-selector.js";
import { ProductSearchBox } from "./product-search-box.js";
import { useStorefrontCatalog } from "./storefront-catalog-provider.js";

type MobileNavigationProps = {
  onRegisterClick: () => void;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  copy: (typeof storefrontCopy)[Locale];
  productsHref?: string;
  supportHref?: string;
};

export function MobileNavigation({
  onRegisterClick,
  locale,
  onLocaleChange,
  copy,
  supportHref = "/contact-us"
}: MobileNavigationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRegionsExpanded, setIsRegionsExpanded] = useState(false);
  const [isCategoriesExpanded, setIsCategoriesExpanded] = useState(false);
  const catalog = useStorefrontCatalog();
  const visibleRegions = catalog.regions.filter((region) => region.isVisible).sort((left, right) => left.sortOrder - right.sortOrder);
  const visibleCategories = catalog.productCategories.filter((category) => category.isVisible).sort((left, right) => left.sortOrder - right.sortOrder);
  const regionLinks = isRegionsExpanded ? visibleRegions : visibleRegions.slice(0, 4);
  const categoryLinks = isCategoriesExpanded ? visibleCategories : visibleCategories.slice(0, 4);

  return (
    <>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-label={copy.mobile.open}
        className="flex size-10 items-center justify-center rounded-full bg-white/90 text-black shadow-sm md:hidden"
        onClick={() => setIsOpen(true)}
      >
        <Menu size={22} strokeWidth={2} />
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label={copy.mobile.closeBackdrop}
            className="absolute inset-0 bg-black/45"
            onClick={() => setIsOpen(false)}
          />
          <aside className="relative h-full w-[min(23rem,90vw)] overflow-y-auto bg-white px-5 py-5 text-black shadow-2xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--ink-soft)]">{copy.mobile.eyebrow}</p>
                <p className="mt-1 text-2xl font-semibold">{copy.mobile.title}</p>
              </div>
              <button
                type="button"
                aria-label={copy.mobile.close}
                className="flex size-10 items-center justify-center rounded-full border border-[var(--line)]"
                onClick={() => setIsOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            <ProductSearchBox
              className="mt-6 flex h-12 items-center gap-3 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4"
              copy={copy}
              locale={locale}
            />

            <div className="mt-4 border-y border-[var(--line)] py-4">
              <MarketPreferenceSelector locale={locale} onLocaleChange={onLocaleChange} />
            </div>

            <button
              className="mt-4 h-12 w-full rounded-full bg-black text-sm font-semibold text-white"
              onClick={() => {
                setIsOpen(false);
                onRegisterClick();
              }}
              type="button"
            >
              {copy.createAccount}
            </button>
            <a
              className="mt-3 flex h-12 w-full items-center justify-center rounded-full border border-black text-sm font-semibold"
              href="/account"
              onClick={() => setIsOpen(false)}
            >
              {copy.account}
            </a>

            <nav className="mt-7">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                  {copy.regionNavTitle}
                </p>
                {visibleRegions.length > 4 ? (
                  <button
                    aria-label={isRegionsExpanded ? (locale === "zh" ? "收起地域分类" : "Collapse regions") : (locale === "zh" ? "展开地域分类" : "Expand regions")}
                    className="flex size-8 items-center justify-center rounded-full border border-[var(--line)]"
                    onClick={() => setIsRegionsExpanded((value) => !value)}
                    type="button"
                  >
                    {isRegionsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                ) : null}
              </div>
              {regionLinks.map((region) => {
                const regionCopy = region.copy[locale];

                return (
                  <a
                    key={region.slug}
                    className="flex items-center justify-between border-b border-[var(--line)] py-4 text-base font-medium"
                    href={`/regions/${region.slug}`}
                    onClick={() => setIsOpen(false)}
                  >
                    <span>{regionCopy.name}</span>
                    <ChevronRight size={18} />
                  </a>
                );
              })}
            </nav>

            <nav className="mt-7">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                  {copy.mobile.categoriesTitle}
                </p>
                {visibleCategories.length > 4 ? (
                  <button
                    aria-label={isCategoriesExpanded ? (locale === "zh" ? "收起商品分类" : "Collapse categories") : (locale === "zh" ? "展开商品分类" : "Expand categories")}
                    className="flex size-8 items-center justify-center rounded-full border border-[var(--line)]"
                    onClick={() => setIsCategoriesExpanded((value) => !value)}
                    type="button"
                  >
                    {isCategoriesExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                ) : null}
              </div>
              {categoryLinks.map((category) => {
                const categoryCopy = category.copy[locale];

                return (
                <a
                  key={category.slug}
                  className="flex items-center justify-between border-b border-[var(--line)] py-4 text-base font-medium"
                  href={`/categories/${category.slug}`}
                  onClick={() => setIsOpen(false)}
                >
                  <span>{categoryCopy.name}</span>
                  <ChevronRight size={18} />
                </a>
              );
              })}
            </nav>

            <nav className="mt-7">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                {copy.mobile.serviceTitle}
              </p>
              {copy.mobile.serviceLinks.map((link) => {
                const href =
                  link === "Track order" || link === "物流追踪"
                    ? "/track-order"
                    : link === "Returns" || link === "退换货"
                      ? "/refund-return-policy"
                      : link === "Wholesale" || link === "批发采购" || link === "Contact" || link === "联系我们"
                        ? supportHref
                        : "/products";

                return (
                  <a
                    key={link}
                    className="block border-b border-[var(--line)] py-4 text-base"
                    href={href}
                    onClick={() => setIsOpen(false)}
                  >
                    {link}
                  </a>
                );
              })}
            </nav>
          </aside>
        </div>
      ) : null}
    </>
  );
}
