"use client";

import Link from "next/link";
import type { Route } from "next";
import { Search, ShoppingBag, User } from "lucide-react";
import type { Locale, storefrontCopy } from "../lib/storefront-content.js";
import { useCart } from "../lib/cart.js";
import { useCustomerSession } from "../lib/customer-session.js";
import { LanguageToggle } from "./language-toggle.js";
import { HLArtisanLogo } from "./hl-artisan-logo.js";
import { MobileNavigation } from "./mobile-navigation.js";
import { ProductSearchBox } from "./product-search-box.js";

type PremiumStorefrontHeaderProps = {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  copy: (typeof storefrontCopy)[Locale];
  onRegisterClick: () => void;
  overlay?: boolean;
  productsHref?: string;
  supportHref?: string;
};

export function PremiumCartButton({ ariaLabel }: { ariaLabel: string }) {
  const { count } = useCart();
  const dynamicAriaLabel = ariaLabel.replace("0", String(count));

  return (
    <Link
      href={"/cart" as Route}
      aria-label={dynamicAriaLabel}
      className="premium-focus relative flex size-10 shrink-0 items-center justify-center text-black md:size-11"
    >
      <ShoppingBag size={20} strokeWidth={1.8} />
      <span className="absolute right-0 top-0 flex size-4 items-center justify-center rounded-full bg-black text-[10px] font-semibold text-white">
        {count}
      </span>
    </Link>
  );
}

export function PremiumStorefrontHeader({
  locale,
  onLocaleChange,
  copy,
  onRegisterClick,
  overlay = false,
  productsHref = "/#products",
  supportHref = "/#support"
}: PremiumStorefrontHeaderProps) {
  const customer = useCustomerSession();
  const navItems = [
    { label: "Shop All", zh: "全部商品", href: productsHref },
    { label: "Best Sellers", zh: "热销爆款", href: "/#products" },
    { label: "New Arrivals", zh: "新品", href: "/#new-arrivals" },
    { label: "Gift Sets", zh: "礼品礼盒", href: "/categories/gift" },
    { label: "Our Craft", zh: "工艺故事", href: "/#craft" },
    { label: "FAQ & Shipping", zh: "物流售后", href: "/track-order" },
    { label: "Contact Us", zh: "联系我们", href: supportHref }
  ];

  return (
    <header
      className={[
        "sticky top-0 z-30 border-b border-[var(--line)] backdrop-blur-xl",
        overlay ? "bg-white/80" : "bg-white/95"
      ].join(" ")}
    >
      <div className="premium-container flex h-[60px] items-center gap-3 md:h-20">
        <MobileNavigation
          copy={copy}
          locale={locale}
          onLocaleChange={onLocaleChange}
          onRegisterClick={onRegisterClick}
          productsHref={productsHref}
          supportHref={supportHref}
        />

        <Link
          aria-label={locale === "zh" ? "返回首页" : "Home"}
          className="premium-focus shrink-0 text-black"
          href="/"
        >
          <HLArtisanLogo className="h-8 w-[7.75rem] md:h-11 md:w-[9.75rem]" decorative showSeal={false} variant="wordmark" />
          <span className="sr-only">{locale === "zh" ? "H & L Artisan 北京" : "H & L Artisan Beijing"}</span>
        </Link>

        <nav className="mx-auto hidden items-center gap-6 text-[12px] font-semibold text-[var(--ink)] lg:flex">
          {navItems.map((item) => (
            <Link key={item.label} className="premium-focus hover:text-[var(--ink-soft)]" href={item.href as Route}>
              {locale === "zh" ? item.zh : item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden min-w-[10rem] max-w-[13rem] flex-1 items-center justify-end xl:flex">
          <ProductSearchBox
            className="flex h-10 w-full items-center gap-2 border-b border-black/25 bg-transparent px-0 text-black"
            copy={copy}
            locale={locale}
          />
        </div>

        <div className="ml-auto flex items-center gap-1 md:ml-0 md:gap-2">
          <button aria-label={copy.searchSr} className="premium-focus flex size-10 items-center justify-center text-[var(--ink)] xl:hidden" type="button">
            <Search size={19} strokeWidth={1.8} />
          </button>
          <LanguageToggle
            className="hidden h-10 border border-transparent bg-transparent px-2 shadow-none hover:border-[var(--line)] sm:inline-flex"
            locale={locale}
            onLocaleChange={onLocaleChange}
            variant="compact"
          />
          <span className="hidden text-xs font-semibold text-[var(--ink-soft)] md:inline-flex">USD</span>
          <Link aria-label={copy.account} className="premium-focus flex size-10 items-center justify-center text-black md:size-11" href={"/account" as Route}>
            <User size={19} strokeWidth={1.8} />
            {customer ? <span className="sr-only">{customer.username}</span> : null}
          </Link>
          {customer ? null : (
            <button className="hidden h-10 px-3 text-xs font-semibold uppercase tracking-[0.08em] text-black md:block" onClick={onRegisterClick} type="button">
              {copy.register}
            </button>
          )}
          <PremiumCartButton ariaLabel={copy.cartAria} />
        </div>
      </div>
    </header>
  );
}
