"use client";

import Link from "next/link";
import type { Route } from "next";
import { Heart, ShoppingBag, User } from "lucide-react";
import type { Locale, storefrontCopy } from "../lib/storefront-content.js";
import { useCart } from "../lib/cart.js";
import { useCustomerSession } from "../lib/customer-session.js";
import { LanguageToggle } from "./language-toggle.js";
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
    { label: "Home", zh: "首页", href: "/" },
    { label: "Shop", zh: "商城", href: productsHref },
    { label: "Collections", zh: "系列", href: "/regions" },
    { label: "About", zh: "关于", href: "/#about" },
    { label: "Journal", zh: "内容", href: "#" },
    { label: "Contact", zh: "联系", href: supportHref }
  ];

  return (
    <header
      className={[
        "sticky top-0 z-30 border-b border-[var(--line)]",
        overlay ? "bg-[rgba(251,250,247,0.78)]" : "bg-[rgba(251,250,247,0.96)]"
      ].join(" ")}
    >
      <div className="premium-container flex h-16 items-center gap-3 md:h-20">
        <MobileNavigation
          copy={copy}
          locale={locale}
          onLocaleChange={onLocaleChange}
          onRegisterClick={onRegisterClick}
          productsHref={productsHref}
          supportHref={supportHref}
        />

        <Link
          className="premium-focus premium-display shrink-0 text-xl text-black md:text-2xl"
          href="/"
        >
          {locale === "zh" ? "代茶具" : "CERATEA"}
        </Link>

        <nav className="mx-auto hidden items-center gap-7 text-[12px] font-medium text-black md:flex">
          {navItems.map((item) => (
            <Link key={item.label} className="premium-focus hover:text-[var(--ink-soft)]" href={item.href as Route}>
              {locale === "zh" ? item.zh : item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden min-w-[13rem] max-w-[18rem] flex-1 items-center justify-end lg:flex">
          <ProductSearchBox
            className="flex h-10 w-full items-center gap-2 border-b border-black/25 bg-transparent px-0 text-black"
            copy={copy}
            locale={locale}
          />
        </div>

        <div className="ml-auto flex items-center gap-1 md:ml-0 md:gap-2">
          <LanguageToggle
            className="h-10 border border-transparent bg-transparent px-2 shadow-none hover:border-[var(--line)]"
            locale={locale}
            onLocaleChange={onLocaleChange}
            variant="compact"
          />
          <button aria-label={copy.wishlist} className="premium-focus hidden size-10 items-center justify-center text-black md:flex" type="button">
            <Heart size={19} strokeWidth={1.8} />
          </button>
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
