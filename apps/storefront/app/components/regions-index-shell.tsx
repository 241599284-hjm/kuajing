"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { regions, storefrontCopy } from "../lib/storefront-content.js";
import { PremiumStorefrontHeader } from "./premium-storefront-header.js";
import { RegionLineIcon } from "./region-collection.js";
import { RegistrationDialog } from "./registration-dialog.js";
import { useStorefrontLocale } from "./use-storefront-locale.js";

export function RegionsIndexShell() {
  const [locale, setLocale] = useStorefrontLocale();
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);
  const copy = storefrontCopy[locale];
  const visibleRegions = useMemo(
    () => regions.filter((region) => region.isVisible).sort((left, right) => left.sortOrder - right.sortOrder),
    []
  );

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
        <div className="mt-6 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
            {copy.regionNavTitle}
          </p>
          <h1 className="premium-display mt-2 text-5xl leading-tight sm:text-7xl">{copy.allRegions}</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">{copy.regionDescription}</p>
        </div>

        <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleRegions.map((region) => {
            const regionCopy = region.copy[locale];

            return (
              <Link
                key={region.slug}
                aria-label={`${regionCopy.name} ${regionCopy.more}`}
                className="group relative flex min-h-[7.25rem] items-center overflow-hidden border border-black/30 bg-white px-5 py-4 text-black transition hover:border-black hover:shadow-sm"
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
      </section>
      <RegistrationDialog copy={copy.registration} isOpen={isRegistrationOpen} locale={locale} onClose={() => setIsRegistrationOpen(false)} />
    </main>
  );
}
