"use client";

import Link from "next/link";
import type { Route } from "next";
import { Circle, Diamond, Square } from "lucide-react";
import type { Locale, StorefrontProduct } from "../lib/storefront-content.js";
import { CustomerServiceMenu } from "./customer-service-menu.js";
import { StorefrontCatalogProvider, useStorefrontCatalog } from "./storefront-catalog-provider.js";
import { StorefrontFooter } from "./storefront-footer.js";
import { StorefrontHero } from "./storefront-hero.js";
import { useStorefrontLocale } from "./use-storefront-locale.js";
import { storefrontCopy } from "../lib/storefront-content.js";

export function StorefrontShell() {
  return (
    <StorefrontCatalogProvider>
      <StorefrontShellContent />
    </StorefrontCatalogProvider>
  );
}

function StorefrontShellContent() {
  const [locale, setLocale] = useStorefrontLocale();
  const copy = storefrontCopy[locale];
  const catalog = useStorefrontCatalog();
  const isZh = locale === "zh";
  const bestSellers = [...catalog.products].sort((left, right) => right.sales - left.sales).slice(0, 6);
  const newArrivals = catalog.products.slice(-4).reverse();

  return (
    <main className="premium-shell min-h-screen text-[var(--ink)]">
      <StorefrontHero copy={copy} locale={locale} onLocaleChange={setLocale} />
      <ProductRail
        copy={copy}
        eyebrow={isZh ? "热销爆款" : "Best Sellers"}
        id="products"
        locale={locale}
        products={bestSellers}
        title={copy.featuredTitle}
        badge={isZh ? "热销" : "Bestseller"}
      />
      <CategoryShowcase locale={locale} />
      <TrustAndCraft locale={locale} />
      <ProductRail
        copy={copy}
        eyebrow={isZh ? "新品" : "New Arrivals"}
        id="new-arrivals"
        locale={locale}
        products={newArrivals}
        title={isZh ? "新上架手工瓷器" : "Just Launched New Porcelain"}
        badge={isZh ? "新品" : "New Arrival"}
      />
      <ReviewSection locale={locale} />
      <PromoSection locale={locale} />
      <NewsletterSection locale={locale} />
      <CustomerServiceMenu copy={copy.support} locale={locale} />
      <StorefrontFooter locale={locale} />
    </main>
  );
}

function ProductRail({
  badge,
  copy,
  eyebrow,
  id,
  locale,
  products,
  title
}: {
  badge: string;
  copy: (typeof storefrontCopy)[Locale];
  eyebrow: string;
  id: string;
  locale: Locale;
  products: StorefrontProduct[];
  title: string;
}) {
  const isZh = locale === "zh";

  return (
    <section id={id} className="premium-container py-14 md:py-20">
      <div className="mb-8 flex items-end justify-between gap-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--ink-muted)]">{eyebrow}</p>
          <h2 className="premium-display mt-2 max-w-2xl text-4xl leading-tight sm:text-5xl">{title}</h2>
          {id === "products" ? <p className="mt-3 text-sm text-[var(--ink-soft)]">{copy.featuredDescription}</p> : null}
        </div>
        <Link className="hidden text-xs font-bold uppercase tracking-[0.12em] text-[var(--ink-soft)] transition hover:text-[var(--accent)] md:inline-flex" href={"/products" as Route}>
          {isZh ? "查看全部" : "View all products"} →
        </Link>
      </div>

      <div className="grid grid-flow-col auto-cols-[82%] gap-5 overflow-x-auto pb-2 sm:auto-cols-[45%] lg:grid-flow-row lg:grid-cols-4 lg:overflow-visible xl:grid-cols-4">
        {products.map((product) => {
          const productCopy = product.copy[locale];

          return (
            <Link key={product.slug} aria-label={productCopy.name} className="group block" href={`/products/${product.slug}` as Route}>
              <article className="relative">
                <span className="absolute left-3 top-3 z-10 bg-[var(--accent)] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
                  {badge}
                </span>
                <div className="aspect-square overflow-hidden bg-[var(--surface)]">
                  <img
                    alt={productCopy.name}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035] group-hover:saturate-90"
                    loading="lazy"
                    src={product.image}
                  />
                </div>
                <div className="pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold sm:text-base">{productCopy.name}</h3>
                      <p className="mt-1 text-xs text-[var(--ink-muted)]">{productCopy.tag}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold">{product.price}</p>
                      <p className="text-xs text-[var(--ink-muted)] line-through">{product.originalPrice}</p>
                    </div>
                  </div>
                  <span className="mt-4 flex h-11 w-full items-center justify-center border border-[var(--line)] text-xs font-bold uppercase tracking-[0.12em] transition group-hover:border-[var(--accent)] group-hover:bg-[var(--accent)] group-hover:text-white">
                    {copy.detail.addToCart}
                  </span>
                </div>
              </article>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function CategoryShowcase({ locale }: { locale: Locale }) {
  const isZh = locale === "zh";
  const items = [
    {
      title: isZh ? "整套茶具" : "Tea Sets",
      body: isZh ? "适合家庭、办公室和礼品场景的小套到大套茶具" : "Small to large complete tea sets for home & office",
      cta: isZh ? "选购茶具" : "Shop Tea Sets",
      href: "/categories/gift",
      image: "/assets/porcelain-tea-set-photo.jpg"
    },
    {
      title: isZh ? "陶瓷花瓶" : "Decor Vases",
      body: isZh ? "手绘陶瓷花瓶，适合客厅与家居陈列" : "Hand-painted ceramic vases for living space",
      cta: isZh ? "选购花瓶" : "Shop Vases",
      href: "/categories/accessories",
      image: "/assets/region-jiangxi-tengwang.jpg"
    },
    {
      title: isZh ? "礼品礼盒" : "Gift Boxes",
      body: isZh ? "可直接赠送的高端瓷器礼品包装" : "Ready-to-send premium gift packages",
      cta: isZh ? "选购礼品" : "Shop Gifts",
      href: "/categories/gift",
      image: "/assets/hero-teaware-photo.jpg"
    },
    {
      title: isZh ? "单杯单品" : "Single Teacups",
      body: isZh ? "适合日常使用的极简手工茶杯" : "Minimal handmade teacups for daily use",
      cta: isZh ? "选购单杯" : "Shop Cups",
      href: "/categories/teacup",
      image: "/assets/yixing-teapot-photo.jpg"
    }
  ];

  return (
    <section className="premium-container py-8 md:py-14">
      <div className="grid gap-5 md:grid-cols-2">
        {items.map((item) => (
          <Link key={item.title} className="group relative block aspect-[4/3] overflow-hidden bg-[var(--surface)]" href={item.href as Route}>
            <img
              alt={item.title}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035] group-hover:saturate-90"
              loading="lazy"
              src={item.image}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/10 to-black/58" />
            <div className="absolute bottom-0 left-0 right-0 p-6 text-white md:p-8">
              <h2 className="premium-display text-3xl leading-none">{item.title}</h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-white/82">{item.body}</p>
              <span className="mt-5 inline-flex text-xs font-bold uppercase tracking-[0.12em]">{item.cta} →</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function TrustAndCraft({ locale }: { locale: Locale }) {
  const isZh = locale === "zh";
  const items = [
    {
      icon: Circle,
      title: isZh ? "纯手工工艺" : "Pure Handmade Craft",
      body: isZh ? "每件由景德镇匠人手作拉坯、施釉，不做机器流水线感。" : "Every piece hand-thrown & hand-glazed by Jingdezhen artisans, no mass machine production."
    },
    {
      icon: Square,
      title: isZh ? "防碎安全包装" : "Crash-Proof Safe Packaging",
      body: isZh ? "多层泡棉与硬纸箱专为易碎陶瓷设计，破损可售后补发。" : "Multi-layer foam + hard carton specially for fragile ceramics, free replacement for broken items."
    },
    {
      icon: Diamond,
      title: isZh ? "全球门到门配送" : "Global Door-to-Door Shipping",
      body: isZh ? "可追踪跨境配送，工作日 48 小时内快速处理发货。" : "Trackable worldwide delivery, fast dispatch within 48 working hours."
    }
  ];

  return (
    <section id="craft" className="bg-[var(--surface-strong)] py-16 md:py-24">
      <div className="premium-container">
        <h2 className="premium-display text-center text-4xl leading-tight sm:text-5xl">
          {isZh ? "为什么选择我们的瓷器" : "Why Choose Our Porcelain"}
        </h2>
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {items.map((item) => {
            const Icon = item.icon;

            return (
              <div key={item.title} className="border-t border-black/20 pt-6">
                <Icon className="mb-5" size={25} strokeWidth={1.3} />
                <h3 className="text-lg font-bold">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--ink-soft)]">{item.body}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-14 grid gap-8 md:grid-cols-2 md:items-center">
          <div className="aspect-[16/10] overflow-hidden bg-white">
            <img alt={isZh ? "景德镇陶瓷工艺" : "Jingdezhen porcelain craft"} className="h-full w-full object-cover" loading="lazy" src="/assets/hero-teaware-photo.jpg" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--ink-muted)]">
              {isZh ? "品牌工艺故事" : "Our Craft Story"}
            </p>
            <h2 className="premium-display mt-3 text-4xl leading-tight sm:text-5xl">
              {isZh ? "来自景德镇的安静器物。" : "Authentic porcelain, quiet enough for daily life."}
            </h2>
            <p className="mt-5 max-w-xl text-sm leading-8 text-[var(--ink-soft)]">
              {isZh
                ? "我们直接围绕景德镇陶瓷、茶席礼品和家居陈列组织商品内容。每只壶、杯、瓶都要同时讲清楚工艺、材质、包装和跨境履约，让海外买家敢买、愿意送礼。"
                : "We source authentic porcelain directly from Jingdezhen, the hometown of Chinese ceramics. Each teapot, cup and vase carries traditional oriental aesthetics, designed for tea lovers and home decor enthusiasts around the world."}
            </p>
            <Link className="mt-7 inline-flex text-xs font-bold uppercase tracking-[0.12em] transition hover:text-[var(--accent)]" href={"/products" as Route}>
              {isZh ? "查看商品" : "About our products"} →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function ReviewSection({ locale }: { locale: Locale }) {
  const isZh = locale === "zh";
  const reviews = [
    {
      name: "Sarah, UK",
      text: "Love this tea set! The glaze texture is incredible, packaging was super thick, no damage at all.",
      image: "/assets/porcelain-tea-set-photo.jpg"
    },
    {
      name: "Mark, Canada",
      text: "Ordered as a housewarming gift, my friend fell in love with the hand-painted details. Fast shipping too.",
      image: "/assets/yixing-teapot-photo.jpg"
    },
    {
      name: "Mia, Australia",
      text: "Minimalist design fits my kitchen perfectly, the porcelain feels smooth and high quality.",
      image: "/assets/travel-tea-set-photo.jpg"
    }
  ];

  return (
    <section className="premium-container py-16 md:py-20">
      <div className="mb-8 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <h2 className="premium-display text-4xl leading-tight sm:text-5xl">{isZh ? "全球茶具买家的评价" : "What Global Tea Lovers Say"}</h2>
        <p className="text-sm text-[var(--ink-muted)]">{isZh ? "买家实拍标签 @HLArtisan" : "Customer Real Shots Tag @HLArtisan"}</p>
      </div>
      <div className="grid grid-flow-col auto-cols-[86%] gap-5 overflow-x-auto pb-2 md:grid-flow-row md:grid-cols-3 md:overflow-visible">
        {reviews.map((review) => (
          <article key={review.name} className="border border-[var(--line)] bg-white p-5">
            <div className="aspect-[4/3] overflow-hidden bg-[var(--surface)]">
              <img alt={review.name} className="h-full w-full object-cover" loading="lazy" src={review.image} />
            </div>
            <p className="mt-5 text-sm tracking-[0.16em] text-[var(--accent)]">★★★★★</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink-soft)]">{isZh ? "釉面质感很好，包装也非常厚实，到货没有破损。" : review.text}</p>
            <p className="mt-4 text-sm font-bold">{review.name}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function PromoSection({ locale }: { locale: Locale }) {
  const isZh = locale === "zh";

  return (
    <section className="premium-container py-0">
      <div className="grid gap-0 overflow-hidden md:grid-cols-[1fr_auto] md:items-center">
        <div className="bg-[var(--ink)] p-7 text-white md:p-10">
          <h2 className="premium-display text-3xl leading-tight sm:text-4xl">
            {isZh ? "订单满 $85 享标准免邮" : "Free Standard Shipping On All Orders Over $85"}
          </h2>
          <p className="mt-2 text-sm text-white/70">{isZh ? "选购更多高端茶具即可解锁免费配送" : "Shop more premium teaware to unlock free delivery"}</p>
        </div>
        <Link className="flex min-h-16 items-center justify-center bg-[var(--ink)] px-8 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--accent)]" href={"/products" as Route}>
          {isZh ? "继续选购" : "Shop More"}
        </Link>
      </div>
      <div className="grid gap-3 bg-[var(--surface-strong)] px-5 py-5 text-center text-sm font-bold text-[var(--ink)] md:grid-cols-2">
        <span>{isZh ? "结账时可选免费礼品包装" : "Complimentary Gift Wrapping Available At Checkout"}</span>
        <Link href={"/categories/gift" as Route}>{isZh ? "套装组合最高可省 20%" : "Buy Tea Set Bundle & Save Up To 20%"} →</Link>
      </div>
    </section>
  );
}

function NewsletterSection({ locale }: { locale: Locale }) {
  const isZh = locale === "zh";

  return (
    <section className="mt-16 bg-[var(--surface-strong)] py-16 text-center md:py-20">
      <div className="premium-container">
        <h2 className="premium-display text-4xl leading-tight sm:text-5xl">
          {isZh ? "加入我们的瓷器社群" : "Join Our Porcelain Community"}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[var(--ink-soft)]">
          {isZh
            ? "订阅后获取首单 10% 优惠、限量工艺新品预告和茶具养护内容。"
            : "Sign up to get 10% OFF your first order, early access to limited crafts & exclusive tea ware tips."}
        </p>
        <form className="mx-auto mt-7 grid max-w-xl border border-[var(--ink)] bg-white sm:grid-cols-[1fr_auto]">
          <input aria-label={isZh ? "邮箱地址" : "Email address"} className="h-12 min-w-0 bg-transparent px-4 text-sm outline-none" placeholder={isZh ? "输入邮箱地址" : "Enter your email address"} type="email" />
          <button className="h-12 bg-[var(--ink)] px-6 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--accent)]" type="button">
            {isZh ? "立即订阅" : "Subscribe Now"}
          </button>
        </form>
        <p className="mt-4 text-xs text-[var(--ink-muted)]">{isZh ? "我们尊重你的隐私，不发送垃圾邮件。" : "We respect your privacy, no spam emails"}</p>
      </div>
    </section>
  );
}
