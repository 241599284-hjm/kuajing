"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";
import type { Locale, storefrontCopy } from "../lib/storefront-content.js";
import { PremiumStorefrontHeader } from "./premium-storefront-header.js";
import { RegistrationDialog } from "./registration-dialog.js";

type StorefrontHeroProps = {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  copy: (typeof storefrontCopy)[Locale];
};

export function StorefrontHero({ locale, onLocaleChange, copy }: StorefrontHeroProps) {
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);
  const isZh = locale === "zh";

  return (
    <section className="relative overflow-hidden bg-white text-[var(--ink)]">
      <div className="h-10 overflow-hidden border-b border-[var(--line)] bg-[var(--surface-strong)] text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink)]">
        <div className="inline-block min-w-full whitespace-nowrap py-3 motion-safe:animate-[announcement-scroll_24s_linear_infinite]">
          {isZh
            ? "订单满 $85 全球免邮 | 景德镇手工瓷器 | 易碎品安全包装"
            : "Free Worldwide Shipping On Orders Over $85 | Handmade Jingdezhen Porcelain | Secure Fragile Packaging"}
        </div>
      </div>

      <PremiumStorefrontHeader
        copy={copy}
        locale={locale}
        onLocaleChange={onLocaleChange}
        onRegisterClick={() => setIsRegistrationOpen(true)}
      />

      <div className="relative min-h-[70svh] bg-[var(--ink)] md:min-h-[62svh]">
        <img
          alt={copy.heroAlt}
          className="absolute inset-0 h-full w-full object-cover opacity-80"
          loading="eager"
          src="/assets/hero-teaware-photo.webp"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-black/12 to-black/62" />
        <div className="premium-container relative z-10 flex min-h-[70svh] items-end md:min-h-[62svh]">
          <div className="max-w-3xl pb-12 pt-24 text-white md:pb-20">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/80">{copy.heroEyebrow}</p>
            <h1 className="premium-display mt-5 max-w-4xl text-4xl leading-[1.02] sm:text-6xl lg:text-7xl">
              {copy.heroTitle}
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-7 text-white/85 sm:text-base">
              {copy.heroDescription}
            </p>
            <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap">
              <Link className="premium-btn min-h-12" href={"/categories/gift" as Route}>
                {isZh ? "选购茶具系列" : "Shop Tea Collections"}
              </Link>
              <Link className="inline-flex min-h-12 items-center justify-center border border-white/80 px-5 text-xs font-bold uppercase tracking-[0.08em] text-white transition hover:border-white hover:bg-white hover:text-[var(--ink)]" href={"/#products" as Route}>
                {isZh ? "查看热销礼品" : "View Best Selling Gifts"}
              </Link>
            </div>
          </div>
        </div>
      </div>

      <RegistrationDialog copy={copy.registration} isOpen={isRegistrationOpen} locale={locale} onClose={() => setIsRegistrationOpen(false)} />
    </section>
  );
}
