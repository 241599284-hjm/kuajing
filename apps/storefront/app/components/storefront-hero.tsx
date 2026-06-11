"use client";

import Link from "next/link";
import type { Route } from "next";
import { ChevronDown, ChevronUp, Gem, PackageCheck, ShieldCheck, Truck } from "lucide-react";
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
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);
  const featureItems = [
    {
      icon: Truck,
      title: locale === "zh" ? "全球配送" : "Worldwide Shipping",
      body: locale === "zh" ? "跨境物流预留" : "Delivered to your door"
    },
    {
      icon: Gem,
      title: locale === "zh" ? "手作工艺" : "Handmade Craft",
      body: locale === "zh" ? "每件茶具都有细节" : "Each piece is unique"
    },
    {
      icon: ShieldCheck,
      title: locale === "zh" ? "优选材质" : "Premium Materials",
      body: locale === "zh" ? "瓷器、紫砂、玻璃" : "Clay, porcelain, glass"
    },
    {
      icon: PackageCheck,
      title: locale === "zh" ? "安全包装" : "Secure Packaging",
      body: locale === "zh" ? "易碎品保护" : "Fragile goods protected"
    }
  ];

  return (
    <section
      className={[
        "relative overflow-hidden bg-[var(--bg)] text-black transition-[min-height] duration-300",
        isCollapsed ? "min-h-[96px] md:min-h-[82svh]" : "min-h-[82svh]"
      ].join(" ")}
    >
      <PremiumStorefrontHeader
        copy={copy}
        locale={locale}
        onLocaleChange={onLocaleChange}
        onRegisterClick={() => setIsRegistrationOpen(true)}
        overlay
      />

      <div
        className={[
          "premium-container relative z-10 grid gap-10 py-10 transition-opacity duration-300 md:grid-cols-[0.85fr_1.15fr] md:items-center md:py-16",
          isCollapsed ? "hidden min-h-0 opacity-0 md:grid md:min-h-[58svh] md:opacity-100" : "min-h-[62svh] opacity-100 md:min-h-[58svh]"
        ].join(" ")}
      >
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">{copy.heroEyebrow}</p>
          <h1 className="premium-display mt-6 text-5xl leading-[0.95] sm:text-7xl lg:text-8xl">
            {copy.heroTitle}
          </h1>
          <p className="mt-6 max-w-md text-sm leading-7 text-[var(--ink-soft)] sm:text-base">
            {copy.heroDescription}
          </p>
          <Link className="premium-btn mt-8" href={"#products" as Route}>
            {locale === "zh" ? "选购系列" : "Shop collection"}
          </Link>
          <div className="mt-16 hidden items-center gap-4 text-xs font-medium text-[var(--ink-soft)] md:flex">
            <span>01</span>
            <span className="h-px w-14 bg-black/30" />
            <span>03</span>
          </div>
        </div>

        <div className="relative min-h-[22rem] md:min-h-[34rem]">
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-[var(--surface-strong)]" />
          <img
            alt={copy.heroAlt}
            className="relative z-10 mx-auto h-[23rem] w-full max-w-[42rem] object-contain md:h-[35rem]"
            src="/assets/porcelain-tea-set-photo.jpg"
          />
        </div>
      </div>

      <div className="premium-container relative z-10 grid gap-5 border-y border-[var(--line)] bg-[var(--bg)] py-7 sm:grid-cols-2 lg:grid-cols-4">
        {featureItems.map((item) => {
          const Icon = item.icon;

          return (
            <div key={item.title} className="flex items-start gap-4">
              <Icon className="mt-0.5 shrink-0" size={22} strokeWidth={1.4} />
              <div>
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="mt-1 text-xs text-[var(--ink-soft)]">{item.body}</p>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        aria-label={isCollapsed ? copy.expandHero : copy.collapseHero}
        className="absolute bottom-4 right-4 z-20 flex h-10 items-center gap-2 border border-[var(--line)] bg-white/95 px-4 text-sm font-semibold text-black shadow-lg md:hidden"
        onClick={() => setIsCollapsed((value) => !value)}
      >
        {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        <span>{isCollapsed ? copy.show : copy.hide}</span>
      </button>
      <RegistrationDialog copy={copy.registration} isOpen={isRegistrationOpen} onClose={() => setIsRegistrationOpen(false)} />
    </section>
  );
}
