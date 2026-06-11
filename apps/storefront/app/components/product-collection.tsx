"use client";

import Link from "next/link";
import type { Route } from "next";
import { Search } from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { Locale, StorefrontProduct, storefrontCopy } from "../lib/storefront-content.js";
import { useStorefrontCatalog } from "./storefront-catalog-provider.js";

type SortKey = "featured" | "salesDesc" | "priceAsc" | "priceDesc" | "nameAsc";
type CategoryKey = "all" | StorefrontProduct["category"];

type ProductCollectionProps = {
  locale: Locale;
  copy: (typeof storefrontCopy)[Locale];
  products: StorefrontProduct[];
  variant?: "default" | "category";
};

const pageSize = 4;

function formatTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), template);
}

export function ProductCollection({ locale, copy, products, variant = "default" }: ProductCollectionProps) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("featured");
  const [category, setCategory] = useState<CategoryKey>("all");
  const [page, setPage] = useState(1);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchInputId = useId();
  const collectionCopy = copy.collection;
  const isCategoryVariant = variant === "category";
  const catalog = useStorefrontCatalog();

  const filteredProducts = useMemo(() => {
    const normalizedQuery = isCategoryVariant ? "" : query.trim().toLowerCase();
    const matches = products.filter((product) => {
      const productCopy = product.copy[locale];
      const searchableText = [
        productCopy.name,
        productCopy.tag,
        productCopy.shortDescription,
        productCopy.details.material,
        product.sku
      ].join(" ").toLowerCase();

      return (isCategoryVariant || category === "all" || product.category === category) && (!normalizedQuery || searchableText.includes(normalizedQuery));
    });

    return [...matches].sort((left, right) => {
      if (sortKey === "salesDesc") return right.sales - left.sales;
      if (sortKey === "priceAsc") return left.priceValue - right.priceValue;
      if (sortKey === "priceDesc") return right.priceValue - left.priceValue;
      if (sortKey === "nameAsc") return left.copy[locale].name.localeCompare(right.copy[locale].name);
      return products.indexOf(left) - products.indexOf(right);
    });
  }, [category, isCategoryVariant, locale, products, query, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const visibleProducts = filteredProducts.slice(pageStart, pageStart + pageSize);
  const resultStart = filteredProducts.length === 0 ? 0 : pageStart + 1;
  const resultEnd = Math.min(pageStart + pageSize, filteredProducts.length);
  const productNameSuggestions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];

    return products
      .filter((product) => product.copy[locale].name.toLowerCase().includes(normalizedQuery))
      .slice(0, 5);
  }, [locale, products, query]);

  function updateQuery(value: string) {
    setQuery(value);
    setPage(1);
  }

  function updateCategory(value: CategoryKey) {
    setCategory(value);
    setPage(1);
  }

  function updateSort(value: SortKey) {
    setSortKey(value);
    setPage(1);
  }

  return (
    <section id="products" className="premium-container pb-24">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
            {isCategoryVariant ? collectionCopy.category : "Featured"}
          </p>
          <h2 className="premium-display mt-2 text-4xl leading-tight sm:text-5xl">{copy.featuredTitle}</h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">{copy.featuredDescription}</p>
        </div>
        <p className="text-sm font-medium text-[var(--ink-soft)]" role="status">
          {formatTemplate(collectionCopy.resultCount, {
            start: resultStart,
            end: resultEnd,
            total: filteredProducts.length
          })}
        </p>
      </div>

      {isCategoryVariant ? (
        <div className="mb-7">
          <div className="flex items-center gap-4 overflow-x-auto pb-1">
            <span className="shrink-0 text-xs font-medium uppercase tracking-[0.12em] text-[var(--ink-soft)]">{collectionCopy.sort}</span>
            {Object.entries(collectionCopy.sortOptions).map(([key, label]) => (
              <button
                key={key}
                className={[
                  "h-8 shrink-0 text-xs font-medium transition",
                  sortKey === key ? "border-b border-black text-black" : "text-[var(--ink-soft)] hover:text-black"
                ].join(" ")}
                onClick={() => updateSort(key as SortKey)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mb-8 grid gap-4 border-y border-[var(--line)] bg-transparent py-5 md:grid-cols-[minmax(16rem,1fr)_11rem_13rem] md:items-end">
        <div className="relative grid gap-2 text-sm font-semibold">
          <label htmlFor={searchInputId}>{collectionCopy.search}</label>
          <span className="flex h-11 items-center gap-2 border-b border-black/25 bg-transparent px-0">
            <Search size={17} />
            <input
              id={searchInputId}
              className="min-w-0 flex-1 bg-transparent text-sm font-normal outline-none"
              onBlur={() => window.setTimeout(() => setIsSearchFocused(false), 120)}
              onChange={(event) => updateQuery(event.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              placeholder={collectionCopy.searchPlaceholder}
              type="search"
              value={query}
            />
          </span>
          {isSearchFocused && productNameSuggestions.length > 0 ? (
            <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-md border border-[var(--line)] bg-white shadow-xl">
              {productNameSuggestions.map((product) => {
                const productCopy = product.copy[locale];

                return (
                  <button
                    key={product.slug}
                    className="flex w-full items-center gap-3 border-b border-[var(--line)] px-3 py-3 text-left last:border-b-0"
                    onClick={() => {
                      updateQuery(productCopy.name);
                      setIsSearchFocused(false);
                    }}
                    type="button"
                  >
                    <img alt={productCopy.name} className="size-10 object-cover" src={product.image} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{productCopy.name}</span>
                      <span className="block text-xs text-[var(--ink-soft)]">{product.sku}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <label className="grid gap-2 text-sm font-semibold">
          {collectionCopy.category}
          <select
            className="h-11 border-b border-black/25 bg-transparent px-0 text-sm font-normal outline-none"
            onChange={(event) => updateCategory(event.target.value as CategoryKey)}
            value={category}
          >
            <option value="all">{collectionCopy.allCategories}</option>
            {catalog.productCategories
              .filter((item) => item.isVisible)
              .sort((left, right) => left.sortOrder - right.sortOrder)
              .map((item) => (
                <option key={item.slug} value={item.slug}>{item.copy[locale].name}</option>
              ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-semibold">
          {collectionCopy.sort}
          <select
            className="h-11 border-b border-black/25 bg-transparent px-0 text-sm font-normal outline-none"
            onChange={(event) => updateSort(event.target.value as SortKey)}
            value={sortKey}
          >
            <option value="featured">{collectionCopy.sortOptions.featured}</option>
            <option value="salesDesc">{collectionCopy.sortOptions.salesDesc}</option>
            <option value="priceAsc">{collectionCopy.sortOptions.priceAsc}</option>
            <option value="priceDesc">{collectionCopy.sortOptions.priceDesc}</option>
            <option value="nameAsc">{collectionCopy.sortOptions.nameAsc}</option>
          </select>
        </label>
      </div>
      )}

      {visibleProducts.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4">
          {visibleProducts.map((product) => {
            const productCopy = product.copy[locale];

            return (
              <Link
                key={product.slug}
                aria-label={productCopy.name}
                className="group block"
                href={`/products/${product.slug}` as Route}
              >
                <article>
                  <img
                    alt={productCopy.name}
                    className="aspect-[4/5] w-full bg-[var(--surface)] object-cover transition duration-500 group-hover:brightness-95"
                    src={product.image}
                  />
                  <div className="mt-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold leading-tight sm:text-base">{productCopy.name}</h3>
                      <p className="mt-1 text-xs text-[var(--ink-soft)] sm:text-sm">
                        {productCopy.tag}
                      </p>
                      <p className="mt-1 text-xs text-[var(--ink-soft)]">
                        {formatTemplate(collectionCopy.monthlySales, { count: product.monthlySales })}
                      </p>
                      <p className="text-xs text-[var(--ink-soft)]">
                        {formatTemplate(collectionCopy.stock, { count: product.stock })}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold sm:text-base">{product.price}</p>
                      <p className="text-xs text-[var(--ink-soft)] line-through">{product.originalPrice}</p>
                    </div>
                  </div>
                </article>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="border border-dashed border-[var(--line)] px-4 py-10 text-center text-sm text-[var(--ink-soft)]">
          {collectionCopy.noResults}
        </div>
      )}

      <div className="mt-8 flex flex-col gap-3 border-t border-[var(--line)] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-center text-sm font-medium text-[var(--ink-soft)] sm:text-left">
          {formatTemplate(collectionCopy.page, { page: currentPage, totalPages })}
        </p>
        <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center">
          <button
            className="h-11 border border-[var(--line)] px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            disabled={currentPage <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            type="button"
          >
            {collectionCopy.previous}
          </button>
          <button
            className="h-11 bg-black px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-black/40"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            type="button"
          >
            {collectionCopy.next}
          </button>
        </div>
      </div>
    </section>
  );
}
