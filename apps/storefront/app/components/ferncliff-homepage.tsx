"use client";

import type { HomepageLocalizedText, HomepageModule } from "@commerce/contracts";
import { ArrowRight, Check, ChevronRight, Menu, Search, ShoppingBag, UserRound, X } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useCallback, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { addCartItem, useCart } from "../lib/cart.js";
import type { Locale, StorefrontCategory, StorefrontProduct } from "../lib/storefront-content.js";
import { storefrontCopy } from "../lib/storefront-content.js";
import { resolveHomepageModules, type ResolvedHomepageModule } from "../lib/homepage-layout.js";
import { MarketPreferenceSelector } from "./market-preference-selector.js";
import { ProductSearchBox } from "./product-search-box.js";
import { ProductDetailDialog } from "./product-detail-dialog.js";
import { useHomepageLayout } from "./homepage-layout-provider.js";
import { useStorefrontCatalog } from "./storefront-catalog-provider.js";
import { useStorefrontLocale } from "./use-storefront-locale.js";

const apiGatewayUrl = process.env.NEXT_PUBLIC_API_GATEWAY_URL ?? "http://localhost:4000";

function copy(value: HomepageLocalizedText | undefined, locale: Locale) {
  return value?.[locale] ?? value?.en ?? "";
}

function moduleAnchor(type: HomepageModule["type"]) {
  return type.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export function FerncliffHomepage() {
  const layout = useHomepageLayout();
  const catalog = useStorefrontCatalog();
  const [locale, setLocale] = useStorefrontLocale();
  const [selectedProductSlug, setSelectedProductSlug] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const modules = useMemo(() => resolveHomepageModules(layout, catalog.products, catalog.productCategories), [catalog.productCategories, catalog.products, layout]);
  const closeProductDetail = useCallback(() => setSelectedProductSlug(null), []);
  const updateDetailLoading = useCallback((loading: boolean) => setDetailLoading(loading), []);

  return (
    <main className="ferncliff-shell min-h-screen">
      {modules.map((module) => <HomepageModuleRenderer detailLoading={detailLoading} key={module.id} module={module} locale={locale} onLocaleChange={setLocale} onViewProduct={setSelectedProductSlug}/>) }
      <ProductDetailDialog locale={locale} onClose={closeProductDetail} onLoadingChange={updateDetailLoading} slug={selectedProductSlug}/>
    </main>
  );
}

function HomepageModuleRenderer({ module, locale, onLocaleChange, onViewProduct, detailLoading }: { module: ResolvedHomepageModule; locale: Locale; onLocaleChange: (locale: Locale) => void; onViewProduct: (slug: string) => void; detailLoading: boolean }) {
  switch (module.type) {
    case "announcement": return <Announcement module={module} locale={locale}/>;
    case "header": return <Header module={module} locale={locale} onLocaleChange={onLocaleChange}/>;
    case "hero": return <Hero module={module} locale={locale}/>;
    case "artisanStory": return <ArtisanStory module={module} locale={locale}/>;
    case "categoryGrid": return <CategoryGrid module={module} locale={locale} categories={module.categories ?? []}/>;
    case "limitedCollection": return <LimitedCollection detailLoading={detailLoading} module={module} locale={locale} onViewProduct={onViewProduct} products={module.products ?? []}/>;
    case "materialDetails": return <MaterialDetails module={module} locale={locale}/>;
    case "testimonials": return <Testimonials module={module} locale={locale}/>;
    case "newsletter": return <Newsletter module={module} locale={locale}/>;
    case "footer": return <Footer module={module} locale={locale}/>;
  }
}

function Announcement({ module, locale }: { module: HomepageModule; locale: Locale }) {
  return <div className="ferncliff-announcement"><span>{copy(module.content.title, locale)}</span>{module.content.ctaHref ? <Link href={module.content.ctaHref as Route}>{copy(module.content.ctaLabel, locale)}</Link> : null}</div>;
}

function Header({ module, locale, onLocaleChange }: { module: HomepageModule; locale: Locale; onLocaleChange: (locale: Locale) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { count } = useCart();
  const siteCopy = storefrontCopy[locale];

  return (
    <header className="ferncliff-header">
      <button className="ferncliff-icon-button ferncliff-menu-button" aria-label={locale === "zh" ? "打开菜单" : "Open menu"} onClick={() => setMenuOpen(true)} type="button"><Menu/></button>
      <Link className="ferncliff-wordmark" href="/">FERNCLIFF<span>ARTISAN OBJECTS</span></Link>
      <nav className="ferncliff-desktop-nav">{(module.content.links ?? []).map((link) => <Link key={link.href} href={link.href as Route}>{copy(link.label, locale)}</Link>)}</nav>
      <ProductSearchBox className="ferncliff-header-search" copy={siteCopy} locale={locale}/>
      <div className="ferncliff-header-actions">
        <button className="ferncliff-icon-button" aria-label={siteCopy.searchSr} onClick={() => setSearchOpen((value) => !value)} type="button"><Search/></button>
        <details className="ferncliff-market"><summary>{locale === "zh" ? "CN / USD" : "US / USD"}</summary><div><MarketPreferenceSelector locale={locale} onLocaleChange={onLocaleChange}/></div></details>
        <Link className="ferncliff-icon-button ferncliff-account-button" aria-label={siteCopy.account} href="/account"><UserRound/></Link>
        <Link className="ferncliff-icon-button relative" aria-label={siteCopy.cartAria.replace("0", String(count))} href="/cart"><ShoppingBag/><span className="ferncliff-cart-count">{count}</span></Link>
      </div>
      {searchOpen ? <div className="ferncliff-search-panel"><ProductSearchBox className="mx-auto flex h-12 max-w-2xl items-center gap-3 border-b border-[var(--ferncliff-ink)]" copy={siteCopy} locale={locale}/></div> : null}
      {menuOpen ? <div className="ferncliff-mobile-drawer"><button className="ferncliff-icon-button ml-auto" aria-label={locale === "zh" ? "关闭菜单" : "Close menu"} onClick={() => setMenuOpen(false)} type="button"><X/></button><nav>{(module.content.links ?? []).map((link) => <Link key={link.href} href={link.href as Route} onClick={() => setMenuOpen(false)}>{copy(link.label, locale)}<ChevronRight/></Link>)}</nav><button className="ferncliff-language" type="button" onClick={() => onLocaleChange(locale === "zh" ? "en" : "zh")}>{locale === "zh" ? "English" : "中文"}</button></div> : null}
    </header>
  );
}

function Hero({ module, locale }: { module: HomepageModule; locale: Locale }) {
  const style = { backgroundImage: `url(${module.content.imageUrl})`, "--ferncliff-mobile-hero": `url(${module.content.mobileImageUrl ?? module.content.imageUrl})` } as CSSProperties;
  return <section className="ferncliff-hero" style={style}><div className="ferncliff-hero-content"><p className="ferncliff-eyebrow">{copy(module.content.eyebrow, locale)}</p><h1>{copy(module.content.title, locale)}</h1><p>{copy(module.content.body, locale)}</p>{module.content.ctaHref ? <Link className="ferncliff-primary-button" href={module.content.ctaHref as Route}>{copy(module.content.ctaLabel, locale)}</Link> : null}</div></section>;
}

function ArtisanStory({ module, locale }: { module: HomepageModule; locale: Locale }) {
  return <section id={moduleAnchor(module.type)} className="ferncliff-section ferncliff-story"><div className="ferncliff-story-copy"><p className="ferncliff-eyebrow">{copy(module.content.eyebrow, locale)}</p><h2>{copy(module.content.title, locale)}</h2><p>{copy(module.content.body, locale)}</p><p>{copy(module.content.secondaryBody, locale)}</p>{module.content.ctaHref ? <Link className="ferncliff-text-link" href={module.content.ctaHref as Route}>{copy(module.content.ctaLabel, locale)}<ArrowRight/></Link> : null}</div><img src={module.content.imageUrl} alt={copy(module.content.title, locale)} decoding="async" height="900" loading="lazy" width="1200"/></section>;
}

const categoryDescriptions: Record<string, { en: string; zh: string }> = {
  teacup: { en: "Quiet forms for daily tea rituals.", zh: "为日常茶席而作的轻盈杯型。" },
  gift: { en: "Presentation-ready sets for meaningful occasions.", zh: "适合重要时刻的成套礼赠选择。" },
  teapot: { en: "Collector pots shaped for controlled pouring.", zh: "兼顾收藏质感与稳定出汤的壶器。" },
  travel: { en: "Compact sets made for tea beyond home.", zh: "为差旅与户外冲泡设计的便携套装。" }
};

function CategoryGrid({ module, locale, categories }: { module: HomepageModule; locale: Locale; categories: StorefrontCategory[] }) {
  return <section className="ferncliff-section ferncliff-categories"><h2>{copy(module.content.title, locale)}</h2><div className="ferncliff-category-grid">{categories.map((category) => <Link key={category.slug} href={`/categories/${category.slug}` as Route}><img src={category.image} alt={`${category.copy[locale].name} ${locale === "zh" ? "分类作品" : "collection"}`} decoding="async" height="600" loading="lazy" width="800"/><span><strong>{category.copy[locale].name}</strong><small>{categoryDescriptions[category.slug]?.[locale] ?? (locale === "zh" ? "查看手工作品" : "Explore handmade pieces")}</small></span><ChevronRight/></Link>)}</div><div className="ferncliff-section-cta"><Link className="ferncliff-text-link" href="/products">{locale === "zh" ? "浏览全部分类" : "Shop all categories"}<ArrowRight/></Link></div></section>;
}

function LimitedCollection({ module, locale, products, onViewProduct, detailLoading }: { module: HomepageModule; locale: Locale; products: StorefrontProduct[]; onViewProduct: (slug: string) => void; detailLoading: boolean }) {
  return <section id="limited-collection" className="ferncliff-section ferncliff-collection"><div className="ferncliff-section-heading"><div><p className="ferncliff-eyebrow">{copy(module.content.eyebrow, locale)}</p><h2>{copy(module.content.title, locale)}</h2></div>{module.content.ctaHref ? <Link className="ferncliff-text-link" href={module.content.ctaHref as Route}>{copy(module.content.ctaLabel, locale)}<ArrowRight/></Link> : null}</div><div className="ferncliff-product-grid">{products.map((product) => <article key={product.slug}><div className="ferncliff-product-image"><img src={product.image} alt={product.copy[locale].name} decoding="async" height="600" loading="lazy" width="800"/><span>{product.stock <= 0 ? (locale === "zh" ? "售罄" : "SOLD OUT") : product.stock <= 15 ? (locale === "zh" ? `仅余 ${product.stock} 件` : `ONLY ${product.stock} LEFT`) : (locale === "zh" ? "限量" : "LIMITED EDITION")}</span><button className="ferncliff-view-button" disabled={detailLoading} onClick={() => onViewProduct(product.slug)} type="button">{detailLoading ? (locale === "zh" ? "加载中" : "Loading") : (locale === "zh" ? "查看详情" : "View details")}</button></div><div className="ferncliff-product-meta"><div><h3>{product.copy[locale].name}</h3><p>{product.copy[locale].shortDescription}</p><strong>{new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(product.priceValue)}</strong></div><button aria-label={locale === "zh" ? `将${product.copy[locale].name}加入购物车` : `Add ${product.copy[locale].name} to cart`} disabled={product.stock <= 0} onClick={() => addCartItem(product.slug)} type="button"><ShoppingBag/></button></div></article>)}</div><div className="ferncliff-section-cta"><Link className="ferncliff-primary-button" href="/products">{locale === "zh" ? "查看全部限量作品" : "Shop all limited pieces"}<ArrowRight/></Link></div></section>;
}

function MaterialDetails({ module, locale }: { module: HomepageModule; locale: Locale }) {
  return <section id={moduleAnchor(module.type)} className="ferncliff-material"><img src={module.content.imageUrl} alt={copy(module.content.title, locale)} decoding="async" height="900" loading="lazy" width="1200"/><div><p className="ferncliff-eyebrow">{copy(module.content.eyebrow, locale)}</p><h2>{copy(module.content.title, locale)}</h2><p>{copy(module.content.body, locale)}</p><ul><li><Check/>{locale === "zh" ? "天然材料" : "Natural materials"}</li><li><Check/>{locale === "zh" ? "小批量制作" : "Small-batch making"}</li><li><Check/>{locale === "zh" ? "适合长期使用" : "Made for lasting use"}</li></ul><Link className="ferncliff-text-link" href="/products">{locale === "zh" ? "探索材质系列" : "Explore material-led pieces"}<ArrowRight/></Link></div></section>;
}

function Testimonials({ module, locale }: { module: HomepageModule; locale: Locale }) {
  return <section className="ferncliff-section ferncliff-testimonials"><h2>{copy(module.content.title, locale)}</h2><div className="ferncliff-testimonial-track">{(module.content.items ?? []).map((item, index) => <blockquote key={`${item.author}-${index}`}><span aria-label={locale === "zh" ? "五星评价" : "Five star review"}>★★★★★</span><h3>{copy(item.title, locale)}</h3><p>{copy(item.body, locale)}</p><cite>{item.author}</cite></blockquote>)}</div><div className="ferncliff-section-cta"><Link className="ferncliff-text-link" href="/products">{locale === "zh" ? "找到你的日常器物" : "Find your everyday piece"}<ArrowRight/></Link></div></section>;
}

function Newsletter({ module, locale }: { module: HomepageModule; locale: Locale }) {
  const [status, setStatus] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = new FormData(form).get("email");
    if (typeof email !== "string") return;
    setStatus(locale === "zh" ? "正在订阅" : "Subscribing");
    try {
      const response = await fetch(`${apiGatewayUrl}/storefront/newsletter-subscriptions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, locale, consent: true }) });
      if (!response.ok) throw new Error();
      setStatus(locale === "zh" ? "订阅成功，请检查邮箱。" : "You are on the list. Check your inbox.");
      form.reset();
    } catch {
      setStatus(locale === "zh" ? "暂时无法订阅，请稍后重试。" : "Subscription is unavailable. Please try again.");
    }
  }
  return <section className="ferncliff-newsletter" style={{ backgroundImage: `url(${module.content.imageUrl})` }}><div><p className="ferncliff-eyebrow">{copy(module.content.eyebrow, locale)}</p><h2>{copy(module.content.title, locale)}</h2><p>{copy(module.content.body, locale)}</p><p className="ferncliff-newsletter-benefit">{locale === "zh" ? "订阅可优先选购限量批次，并获得工作室新品预告。" : "Subscribers receive early access to limited batches and private studio releases."}</p><form onSubmit={submit}><input aria-label={locale === "zh" ? "邮箱" : "Email address"} name="email" required type="email" placeholder={locale === "zh" ? "输入邮箱" : "Email address"}/><button type="submit">{copy(module.content.ctaLabel, locale)}<ArrowRight/></button></form><small aria-live="polite">{status}</small></div></section>;
}

function Footer({ module, locale }: { module: HomepageModule; locale: Locale }) {
  return <footer className="ferncliff-footer"><div><Link className="ferncliff-wordmark" href="/">FERNCLIFF<span>ARTISAN OBJECTS</span></Link><p>{copy(module.content.body, locale)}</p></div><nav>{(module.content.links ?? []).map((link) => <Link key={link.href} href={link.href as Route}>{copy(link.label, locale)}</Link>)}</nav><div className="ferncliff-partners" aria-label={locale === "zh" ? "支付与物流合作方" : "Payment and delivery partners"}><span>PayPal</span><span>VISA</span><span>Mastercard</span><span>DHL</span><span>UPS</span></div><p>© {new Date().getFullYear()} FERNCLIFF</p></footer>;
}
