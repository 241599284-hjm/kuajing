"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";
import type { StorefrontCategory } from "../lib/storefront-content.js";
import { products, storefrontCopy } from "../lib/storefront-content.js";
import { PremiumStorefrontHeader } from "./premium-storefront-header.js";
import { ProductCollection } from "./product-collection.js";
import { RegistrationDialog } from "./registration-dialog.js";
import { useStorefrontLocale } from "./use-storefront-locale.js";

type CategoryDetailShellProps = {
  category: StorefrontCategory;
};

export function CategoryDetailShell({ category }: CategoryDetailShellProps) {
  const [locale, setLocale] = useStorefrontLocale();
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);
  const copy = storefrontCopy[locale];
  const categoryCopy = category.copy[locale];
  const categoryProducts = products.filter((product) => product.category === category.slug);

  return (
    <main className="premium-shell min-h-screen text-[var(--ink)]">
      <PremiumStorefrontHeader
        copy={copy}
        locale={locale}
        onLocaleChange={setLocale}
        onRegisterClick={() => setIsRegistrationOpen(true)}
      />

      <section className="premium-container py-8 md:py-12">
        <Link className="inline-flex items-center gap-2 text-sm font-semibold" href={"/" as Route}>
          <ArrowLeft size={16} />
          {locale === "zh" ? "返回上级" : "Back"}
        </Link>
        <div className="mt-7 grid gap-8 md:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)] md:items-end">
          <img
            alt={categoryCopy.name}
            className="aspect-[4/3] w-full bg-[var(--surface)] object-cover"
            src={category.image}
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
              {copy.collection.category}
            </p>
            <h1 className="premium-display mt-3 text-5xl leading-tight sm:text-7xl">{categoryCopy.name}</h1>
            <p className="mt-4 text-base leading-7 text-[var(--ink-soft)]">
              {locale === "zh" ? "当前分类下的商品会在这里集中展示，方便买家从分类页进入详情和下单。" : "Products in this category are collected here so buyers can browse, open details, and checkout."}
            </p>
          </div>
        </div>
      </section>

      <ProductCollection copy={copy} locale={locale} products={categoryProducts} variant="category" />

      <RegistrationDialog copy={copy.registration} isOpen={isRegistrationOpen} onClose={() => setIsRegistrationOpen(false)} />
    </main>
  );
}
