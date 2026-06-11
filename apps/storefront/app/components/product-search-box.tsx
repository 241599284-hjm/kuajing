"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { FormEvent, useMemo, useState } from "react";
import type { Locale, storefrontCopy } from "../lib/storefront-content.js";
import { useStorefrontCatalog } from "./storefront-catalog-provider.js";

type ProductSearchBoxProps = {
  className: string;
  copy: (typeof storefrontCopy)[Locale];
  locale: Locale;
};

export function ProductSearchBox({ className, copy, locale }: ProductSearchBoxProps) {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const catalog = useStorefrontCatalog();

  const suggestions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];

    return catalog.products
      .filter((product) => product.copy[locale].name.toLowerCase().includes(normalizedQuery))
      .slice(0, 5);
  }, [catalog.products, locale, query]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const firstSuggestion = suggestions[0];
    if (firstSuggestion) {
      window.location.href = `/products/${firstSuggestion.slug}`;
    }
  }

  return (
    <form className={`relative ${className}`} onSubmit={submitSearch} role="search">
      <Search size={17} />
      <input
        aria-label={copy.searchSr}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        onBlur={() => window.setTimeout(() => setIsFocused(false), 120)}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setIsFocused(true)}
        placeholder={copy.searchPlaceholder}
        type="search"
        value={query}
      />
      {isFocused && suggestions.length > 0 ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-md border border-[var(--line)] bg-white text-black shadow-xl">
          {suggestions.map((product) => {
            const productCopy = product.copy[locale];

            return (
              <Link
                key={product.slug}
                className="flex items-center gap-3 border-b border-[var(--line)] px-3 py-3 last:border-b-0"
                href={`/products/${product.slug}` as Route}
              >
                <img alt={productCopy.name} className="size-10 rounded-md object-cover" src={product.image} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{productCopy.name}</span>
                  <span className="block text-xs text-[var(--ink-soft)]">{product.sku}</span>
                </span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </form>
  );
}
