"use client";

import { useState } from "react";
import { PremiumStorefrontHeader } from "./premium-storefront-header.js";
import { ProductCollection } from "./product-collection.js";
import { RegistrationDialog } from "./registration-dialog.js";
import { StorefrontCatalogProvider } from "./storefront-catalog-provider.js";
import { StorefrontFooter } from "./storefront-footer.js";
import { useStorefrontLocale } from "./use-storefront-locale.js";
import { products, storefrontCopy } from "../lib/storefront-content.js";

export function ProductIndexShell() {
  return (
    <StorefrontCatalogProvider>
      <ProductIndexContent />
    </StorefrontCatalogProvider>
  );
}

function ProductIndexContent() {
  const [locale, setLocale] = useStorefrontLocale();
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);
  const copy = storefrontCopy[locale];
  const isZh = locale === "zh";

  return (
    <main className="premium-shell min-h-screen text-[var(--ink)]">
      <PremiumStorefrontHeader
        copy={copy}
        locale={locale}
        onLocaleChange={setLocale}
        onRegisterClick={() => setIsRegistrationOpen(true)}
      />

      <section className="premium-container py-10 md:py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
          {isZh ? "Shop all" : "Shop all"}
        </p>
        <h1 className="premium-display mt-3 max-w-3xl text-5xl leading-tight sm:text-7xl">
          {isZh ? "全部景德镇手工瓷器" : "All Handmade Porcelain"}
        </h1>
        <p className="mt-5 max-w-2xl text-sm leading-7 text-[var(--ink-soft)]">
          {isZh
            ? "集中浏览整套茶具、单杯、旅行茶具、礼盒和配件，并按销量、价格和名称排序。"
            : "Browse tea sets, single cups, travel kits, gift boxes, and accessories with search, pagination, and sorting."}
        </p>
      </section>

      <ProductCollection copy={copy} locale={locale} products={products} />

      <RegistrationDialog
        copy={copy.registration}
        isOpen={isRegistrationOpen}
        locale={locale}
        onClose={() => setIsRegistrationOpen(false)}
      />
      <StorefrontFooter locale={locale} />
    </main>
  );
}
