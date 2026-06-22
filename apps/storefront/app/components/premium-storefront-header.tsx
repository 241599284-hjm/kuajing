"use client";

import { ChevronRight, Menu, Search, ShoppingBag, UserRound, X } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";
import type { Locale, storefrontCopy } from "../lib/storefront-content.js";
import { useCart } from "../lib/cart.js";
import { useCustomerSession } from "../lib/customer-session.js";
import { MarketPreferenceSelector } from "./market-preference-selector.js";
import { ProductSearchBox } from "./product-search-box.js";

type NavLink = { href: string; label: { en: string; zh: string } };
type PremiumStorefrontHeaderProps = {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  copy: (typeof storefrontCopy)[Locale];
  onRegisterClick: () => void;
  overlay?: boolean;
  productsHref?: string;
  supportHref?: string;
  navLinks?: NavLink[];
};

const defaultNavLinks = (productsHref: string, supportHref: string): NavLink[] => [
  { href: productsHref, label: { en: "Shop", zh: "商店" } },
  { href: "/#limited-collection", label: { en: "Collections", zh: "系列" } },
  { href: "/#artisan-story", label: { en: "Artisans", zh: "匠人" } },
  { href: "/regions", label: { en: "Origins", zh: "产地" } },
  { href: supportHref, label: { en: "Contact", zh: "联系" } }
];

export function PremiumCartButton({ ariaLabel }: { ariaLabel: string }) {
  const { count } = useCart();
  return <Link className="ferncliff-icon-button relative" aria-label={ariaLabel.replace("0", String(count))} href={"/cart" as Route}><ShoppingBag/><span className="ferncliff-cart-count">{count}</span></Link>;
}

export function PremiumStorefrontHeader({
  locale,
  onLocaleChange,
  copy,
  onRegisterClick,
  productsHref = "/products",
  supportHref = "/contact-us",
  navLinks
}: PremiumStorefrontHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const customer = useCustomerSession();
  const links = navLinks ?? defaultNavLinks(productsHref, supportHref);

  return <header className="ferncliff-header">
    <button className="ferncliff-icon-button ferncliff-menu-button" aria-label={locale === "zh" ? "打开菜单" : "Open menu"} onClick={() => setMenuOpen(true)} type="button"><Menu/></button>
    <Link className="ferncliff-wordmark" href="/">FERNCLIFF<span>ARTISAN OBJECTS</span></Link>
    <nav className="ferncliff-desktop-nav">{links.map((link) => <Link key={link.href} href={link.href as Route}>{link.label[locale]}</Link>)}</nav>
    <ProductSearchBox className="ferncliff-header-search" copy={copy} locale={locale}/>
    <div className="ferncliff-header-actions">
      <button className="ferncliff-icon-button" aria-label={copy.searchSr} onClick={() => setSearchOpen((value) => !value)} type="button"><Search/></button>
      <details className="ferncliff-market"><summary>{locale === "zh" ? "CN / USD" : "US / USD"}</summary><div><MarketPreferenceSelector locale={locale} onLocaleChange={onLocaleChange}/></div></details>
      <Link className="ferncliff-icon-button ferncliff-account-button" aria-label={copy.account} href="/account"><UserRound/>{customer ? <span className="sr-only">{customer.username}</span> : null}</Link>
      <PremiumCartButton ariaLabel={copy.cartAria}/>
    </div>
    {searchOpen ? <div className="ferncliff-search-panel"><ProductSearchBox className="mx-auto flex h-12 max-w-2xl items-center gap-3 border-b border-[var(--ferncliff-ink)]" copy={copy} locale={locale}/></div> : null}
    {menuOpen ? <div className="ferncliff-mobile-drawer">
      <button className="ferncliff-icon-button ml-auto" aria-label={locale === "zh" ? "关闭菜单" : "Close menu"} onClick={() => setMenuOpen(false)} type="button"><X/></button>
      <nav>{links.map((link) => <Link key={link.href} href={link.href as Route} onClick={() => setMenuOpen(false)}>{link.label[locale]}<ChevronRight/></Link>)}</nav>
      <div className="mt-6 flex items-center justify-between gap-4">
        <button className="ferncliff-language" type="button" onClick={() => onLocaleChange(locale === "zh" ? "en" : "zh")}>{locale === "zh" ? "English" : "中文"}</button>
        {!customer ? <button className="ferncliff-language" type="button" onClick={() => { setMenuOpen(false); onRegisterClick(); }}>{copy.register}</button> : null}
      </div>
    </div> : null}
  </header>;
}
