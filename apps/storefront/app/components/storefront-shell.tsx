"use client";

import Link from "next/link";
import type { Route } from "next";
import { MessageCircle } from "lucide-react";
import { storefrontCopy } from "../lib/storefront-content.js";
import { ProductCollection } from "./product-collection.js";
import { RegionCollection } from "./region-collection.js";
import { StorefrontCatalogProvider, useStorefrontCatalog } from "./storefront-catalog-provider.js";
import { StorefrontHero } from "./storefront-hero.js";
import { useStorefrontLocale } from "./use-storefront-locale.js";

export function StorefrontShell() {
  return (
    <StorefrontCatalogProvider>
      <StorefrontShellContent />
    </StorefrontCatalogProvider>
  );
}

function StorefrontShellContent() {
  const [locale, setLocale] = useStorefrontLocale();
  const copy = storefrontCopy[locale];
  const catalog = useStorefrontCatalog();

  return (
    <main className="premium-shell min-h-screen text-[var(--ink)]">
      <StorefrontHero copy={copy} locale={locale} onLocaleChange={setLocale} />

      <section className="premium-container py-16">
        <div className="mb-8 flex items-end justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">{locale === "zh" ? "Shop" : "Shop"}</p>
            <h2 className="premium-display mt-2 text-4xl leading-tight sm:text-5xl">{copy.categoryTitle}</h2>
          </div>
          <Link className="hidden text-xs font-bold uppercase tracking-[0.12em] md:inline-flex" href={"/regions" as Route}>
            {copy.viewAll} →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
          {catalog.productCategories
            .filter((category) => category.isVisible)
            .sort((left, right) => left.sortOrder - right.sortOrder)
            .slice(0, 4)
            .map((category) => (
            <Link key={category.slug} className="group block" href={`/categories/${category.slug}` as Route}>
              <img
                alt={category.copy[locale].name}
                className="aspect-[4/5] w-full bg-[var(--surface)] object-cover transition duration-500 group-hover:brightness-95"
                src={category.image}
              />
              <p className="mt-4 text-sm font-semibold">{category.copy[locale].name}</p>
            </Link>
          ))}
        </div>
      </section>

      <RegionCollection copy={copy} locale={locale} />

      <ProductCollection copy={copy} locale={locale} products={catalog.products} />

      <section id="about" className="premium-container pb-20">
        <div className="grid overflow-hidden bg-[var(--surface)] md:grid-cols-[1.05fr_0.95fr]">
          <img
            alt={locale === "zh" ? "手作茶具陈列" : "Handcrafted teaware arrangement"}
            className="h-full min-h-[18rem] w-full object-cover"
            src="/assets/hero-teaware-photo.jpg"
          />
          <div className="flex flex-col justify-center p-8 md:p-12">
            <h2 className="premium-display text-4xl leading-tight sm:text-5xl">
              {locale === "zh" ? "慢下来，认真泡一壶茶。" : "The Art of Slow Living"}
            </h2>
            <p className="mt-5 max-w-md text-sm leading-7 text-[var(--ink-soft)]">
              {locale === "zh"
                ? "这套底座会把商品、地域系列、茶具故事和跨境购买流程统一成一个安静、可信、适合外销的品牌体验。"
                : "A quiet commerce experience for teaware, regional collections, product stories, and cross-border buying flows."}
            </p>
            <Link className="mt-7 text-xs font-bold uppercase tracking-[0.12em]" href={"/#products" as Route}>
              {locale === "zh" ? "查看商品" : "About our products"} →
            </Link>
          </div>
        </div>
      </section>

      <details id="support" className="fixed bottom-4 right-4 z-20 max-w-[calc(100vw-2rem)] md:bottom-8 md:right-8">
        <summary
          aria-label={copy.support.title}
          className="flex size-12 list-none items-center justify-center rounded-full bg-black text-white shadow-lg"
        >
          <MessageCircle size={20} />
        </summary>
        <div className="mt-3 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-[var(--line)] bg-white p-4 text-black shadow-xl">
          <p className="text-sm font-semibold">{copy.support.title}</p>
          <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
            {copy.support.body}
          </p>
          <div className="mt-4 grid gap-2">
            <button className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm text-white">{copy.support.startChat}</button>
            <button className="rounded-full border border-[var(--line)] px-4 py-2 text-sm">{copy.support.createTicket}</button>
          </div>
        </div>
      </details>
    </main>
  );
}
