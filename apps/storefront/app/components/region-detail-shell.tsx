"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";
import type { StorefrontRegion } from "../lib/storefront-content.js";
import { products, storefrontCopy } from "../lib/storefront-content.js";
import { PremiumStorefrontHeader } from "./premium-storefront-header.js";
import { ProductCollection } from "./product-collection.js";
import { RegionLineIcon } from "./region-collection.js";
import { RegistrationDialog } from "./registration-dialog.js";
import { useStorefrontLocale } from "./use-storefront-locale.js";

type RegionDetailShellProps = {
  region: StorefrontRegion;
};

export function RegionDetailShell({ region }: RegionDetailShellProps) {
  const [locale, setLocale] = useStorefrontLocale();
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);
  const copy = storefrontCopy[locale];
  const regionCopy = region.copy[locale];
  const regionProducts = products.filter((product) => product.region === region.slug);

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
          {copy.regionDetail.back}
        </Link>
        <div className="mt-7 grid gap-8 md:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)] md:items-end">
          <div
            aria-label={regionCopy.landmark}
            className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden border border-black/15 bg-white"
            role="img"
          >
            <RegionLineIcon className="absolute -right-10 top-4 h-64 w-64 text-black opacity-[0.06]" icon={region.icon} />
            <div className="absolute inset-0 bg-gradient-to-r from-white via-white/90 to-white/45" />
            <RegionLineIcon className="relative h-32 w-32 text-black sm:h-44 sm:w-44" icon={region.icon} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
              {regionCopy.name} · {regionCopy.landmark}
            </p>
            <h1 className="premium-display mt-3 text-5xl leading-tight sm:text-7xl">{regionCopy.title}</h1>
            <p className="mt-4 text-base leading-7 text-[var(--ink-soft)]">{regionCopy.description}</p>
            <p className="mt-4 text-sm leading-6 text-[var(--ink-soft)]">{copy.regionDetail.switchHint}</p>
          </div>
        </div>
      </section>

      <ProductCollection copy={copy} locale={locale} products={regionProducts} />

      <RegistrationDialog copy={copy.registration} isOpen={isRegistrationOpen} locale={locale} onClose={() => setIsRegistrationOpen(false)} />
    </main>
  );
}
