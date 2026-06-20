"use client";

import { ArrowLeft, ShieldCheck, Truck } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useState, type CSSProperties } from "react";
import { addCartItem } from "../lib/cart.js";
import type { ProductContent, StorefrontProduct, StorefrontProductMediaAsset } from "../lib/storefront-content.js";
import { storefrontCopy } from "../lib/storefront-content.js";
import { PremiumStorefrontHeader } from "./premium-storefront-header.js";
import { ProductReviews } from "./product-reviews.js";
import { RegistrationDialog } from "./registration-dialog.js";
import { StorefrontCatalogProvider, useStorefrontCatalog } from "./storefront-catalog-provider.js";
import { useStorefrontLocale } from "./use-storefront-locale.js";

type ProductDetailShellProps = {
  product: StorefrontProduct;
};

type StoryBlock = NonNullable<ProductContent["storyBlocks"]>[number];

function mediaKind(block: StoryBlock) {
  if (block.mediaKind) return block.mediaKind;
  return block.image.toLowerCase().endsWith(".gif") ? "gif" : "image";
}

function mediaStyle(block: StoryBlock): CSSProperties | undefined {
  if (!block.width || !block.height) return undefined;
  return { aspectRatio: `${block.width} / ${block.height}` };
}

function ProductStoryMedia({
  block,
  className,
  fallbackImage,
  priority = false
}: {
  block: StoryBlock;
  className?: string;
  fallbackImage: string;
  priority?: boolean;
}) {
  const kind = mediaKind(block);
  const poster = block.poster ?? (kind === "video" ? fallbackImage : block.image);
  const mediaClassName = [
    "w-full bg-[var(--surface)] object-cover",
    className ?? ""
  ].join(" ");

  if (kind === "video") {
    return (
      <video
        aria-label={block.imageAlt}
        className={mediaClassName}
        controls
        playsInline
        poster={poster}
        preload="metadata"
        style={mediaStyle(block)}
      >
        <source src={block.image} type={block.mimeType ?? "video/mp4"} />
      </video>
    );
  }

  return (
    <img
      alt={block.imageAlt}
      className={mediaClassName}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      src={block.image}
      style={mediaStyle(block)}
    />
  );
}

function ProductGalleryMedia({
  asset,
  alt,
  className,
  priority = false
}: {
  asset: StorefrontProductMediaAsset;
  alt: string;
  className: string;
  priority?: boolean;
}) {
  const style = asset.width && asset.height ? { aspectRatio: `${asset.width} / ${asset.height}` } : undefined;

  if (asset.kind === "video") {
    return (
      <video
        aria-label={alt}
        className={className}
        controls
        playsInline
        poster={asset.poster ?? undefined}
        preload="metadata"
        style={style}
      >
        <source src={asset.url} type={asset.mimeType || "video/mp4"} />
      </video>
    );
  }

  const srcSet = asset.responsiveSources
    .slice()
    .sort((left, right) => left.width - right.width)
    .map((source) => `${source.url} ${source.width}w`)
    .join(", ");

  return (
    <img
      alt={alt}
      className={className}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      sizes="(min-width: 768px) 45vw, 100vw"
      src={asset.url}
      srcSet={srcSet || undefined}
      style={style}
    />
  );
}

export function ProductDetailShell({ product }: ProductDetailShellProps) {
  return (
    <StorefrontCatalogProvider>
      <ProductDetailContent fallbackProduct={product} />
    </StorefrontCatalogProvider>
  );
}

function ProductDetailContent({ fallbackProduct }: { fallbackProduct: StorefrontProduct }) {
  const catalog = useStorefrontCatalog();
  const product = catalog.products.find((item) => item.slug === fallbackProduct.slug) ?? fallbackProduct;
  const [locale, setLocale] = useStorefrontLocale();
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);
  const [cartMessage, setCartMessage] = useState("");
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);
  const copy = storefrontCopy[locale];
  const productCopy = product.copy[locale];
  const storyBlocks = productCopy.storyBlocks ?? [
    {
      title: locale === "zh" ? "商品图文介绍" : "Product story",
      body: productCopy.longDescription,
      mediaKind: "image",
      image: product.image,
      imageAlt: productCopy.name
    }
  ];
  const gallery = product.mediaAssets?.length ? product.mediaAssets : [{
    assetId: "primary-image",
    kind: "image" as const,
    url: product.image,
    poster: null,
    width: null,
    height: null,
    mimeType: "image/webp",
    responsiveSources: [],
    alt: { en: product.copy.en.name, zh: product.copy.zh.name },
    sortOrder: 0
  }];
  const selectedMedia = gallery[Math.min(selectedMediaIndex, gallery.length - 1)];

  function handleAddToCart() {
    addCartItem(product.slug, 1);
    setCartMessage(locale === "zh" ? "已加入购物车" : "Added to cart");
  }

  return (
    <main className="premium-shell min-h-screen text-[var(--ink)]">
      <PremiumStorefrontHeader
        copy={copy}
        locale={locale}
        onLocaleChange={setLocale}
        onRegisterClick={() => setIsRegistrationOpen(true)}
      />

      <section className="premium-container grid gap-8 py-6 sm:py-10 md:grid-cols-[8rem_minmax(0,1.05fr)_minmax(20rem,0.8fr)] lg:gap-10">
        <div>
          <Link className="inline-flex items-center gap-2 text-sm font-semibold" href={"/products" as Route}>
            <ArrowLeft size={16} />
            {copy.detail.back}
          </Link>
          <div className="mt-5 hidden gap-3 md:grid">
            {gallery.slice(0, 6).map((asset, index) => (
              <button
                aria-label={locale === "zh" ? `查看${asset.alt.zh}` : `View ${asset.alt.en}`}
                className={`aspect-square overflow-hidden border bg-[var(--surface)] ${index === selectedMediaIndex ? "border-black" : "border-[var(--line)]"}`}
                key={asset.assetId}
                onClick={() => setSelectedMediaIndex(index)}
                type="button"
              >
                <img alt="" className="h-full w-full object-cover" src={asset.kind === "video" ? asset.poster ?? product.image : asset.url} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <ProductGalleryMedia
            alt={selectedMedia.alt[locale]}
            asset={selectedMedia}
            className="aspect-[4/5] w-full bg-[var(--surface)] object-cover md:aspect-square"
            priority
          />
          {gallery.length > 1 ? (
            <div className="mt-3 flex gap-3 overflow-x-auto pb-1 md:hidden">
              {gallery.map((asset, index) => (
                <button
                  aria-label={locale === "zh" ? `查看${asset.alt.zh}` : `View ${asset.alt.en}`}
                  className={`h-16 w-16 shrink-0 overflow-hidden border bg-[var(--surface)] ${index === selectedMediaIndex ? "border-black" : "border-[var(--line)]"}`}
                  key={asset.assetId}
                  onClick={() => setSelectedMediaIndex(index)}
                  type="button"
                >
                  <img alt="" className="h-full w-full object-cover" src={asset.kind === "video" ? asset.poster ?? product.image : asset.url} />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <article className="md:pt-9">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-soft)]">{copy.detail.selected}</p>
          <div className="mt-4">
            <div>
              <h1 className="premium-display text-4xl leading-tight sm:text-5xl">{productCopy.name}</h1>
              <p className="mt-3 text-sm font-semibold text-[var(--ink-soft)]">{productCopy.tag} · {product.sku}</p>
            </div>
            <div className="mt-5">
              <p className="text-2xl font-semibold">{product.price}</p>
              <p className="text-sm text-[var(--ink-soft)] line-through">{product.originalPrice}</p>
            </div>
          </div>

          <p className="mt-5 text-base leading-7 text-[var(--ink-soft)] sm:text-lg">{productCopy.shortDescription}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <p className="border border-[var(--line)] px-3 py-2">
              {copy.collection.monthlySales.replace("{count}", String(product.monthlySales))}
            </p>
            <p className="border border-[var(--line)] px-3 py-2">
              {copy.collection.stock.replace("{count}", String(product.stock))}
            </p>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <button className="premium-btn w-full" onClick={handleAddToCart} type="button">
              {copy.detail.addToCart}
            </button>
            <Link className="premium-btn-outline w-full" href={`/checkout?buyNow=${product.slug}` as Route}>
              {copy.detail.buyNow}
            </Link>
          </div>
          {cartMessage ? (
            <p className="mt-3 text-sm font-medium text-[var(--ink-soft)]" role="status">
              {cartMessage} · <Link className="underline" href={"/cart" as Route}>{copy.cart}</Link>
            </p>
          ) : null}

          <section className="mt-9 border-t border-[var(--line)] pt-6">
            <h2 className="text-lg font-semibold">{copy.detail.overview}</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--ink-soft)]">{productCopy.longDescription}</p>
            <ul className="mt-4 grid gap-3">
              {productCopy.highlights.map((highlight) => (
                <li key={highlight} className="flex items-start gap-3 text-sm leading-6">
                  <ShieldCheck className="mt-0.5 shrink-0" size={17} />
                  <span>{highlight}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-8 border-t border-[var(--line)] pt-6">
            <h2 className="text-lg font-semibold">{locale === "zh" ? "图文介绍" : "Image and text story"}</h2>
            <div className="mt-4 grid gap-5">
              {storyBlocks.map((block, index) => (
                <article
                  key={`${block.title}-${index}`}
                  className="grid gap-4 border border-[var(--line)] p-4 [contain-intrinsic-block-size:460px] [content-visibility:auto] md:grid-cols-2 md:items-center"
                >
                  <ProductStoryMedia
                    block={block}
                    className={[
                      "aspect-[4/3]",
                      index % 2 === 1 ? "md:order-2" : ""
                    ].join(" ")}
                    fallbackImage={product.image}
                  />
                  <div>
                    <h3 className="text-base font-semibold">{block.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-[var(--ink-soft)]">{block.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-8 border-t border-[var(--line)] pt-6">
            <h2 className="text-lg font-semibold">{copy.detail.specifications}</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div className="flex justify-between gap-4 border-b border-[var(--line)] pb-3">
                <dt className="text-[var(--ink-soft)]">{copy.detail.material}</dt>
                <dd className="text-right font-medium">{productCopy.details.material}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-[var(--line)] pb-3">
                <dt className="text-[var(--ink-soft)]">{copy.detail.capacity}</dt>
                <dd className="text-right font-medium">{productCopy.details.capacity}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-[var(--line)] pb-3">
                <dt className="text-[var(--ink-soft)]">{copy.detail.origin}</dt>
                <dd className="text-right font-medium">{productCopy.details.origin}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-[var(--line)] pb-3">
                <dt className="text-[var(--ink-soft)]">{copy.detail.hsCode}</dt>
                <dd className="text-right font-medium">{productCopy.details.hsCode}</dd>
              </div>
              {productCopy.details.packageDimensionsMm ? (
                <div className="flex justify-between gap-4 border-b border-[var(--line)] pb-3">
                  <dt className="text-[var(--ink-soft)]">{copy.detail.packageDimensions}</dt>
                  <dd className="text-right font-medium">
                    {productCopy.details.packageDimensionsMm.length} x {productCopy.details.packageDimensionsMm.width} x{" "}
                    {productCopy.details.packageDimensionsMm.height} mm
                  </dd>
                </div>
              ) : null}
              {typeof productCopy.details.weightGrams === "number" ? (
                <div className="flex justify-between gap-4 border-b border-[var(--line)] pb-3">
                  <dt className="text-[var(--ink-soft)]">{copy.detail.weight}</dt>
                  <dd className="text-right font-medium">{productCopy.details.weightGrams} g</dd>
                </div>
              ) : null}
              {productCopy.details.customsDeclaration ? (
                <div className="flex justify-between gap-4 border-b border-[var(--line)] pb-3">
                  <dt className="text-[var(--ink-soft)]">{copy.detail.customsDeclaration}</dt>
                  <dd className="max-w-[16rem] text-right font-medium">{productCopy.details.customsDeclaration}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <div className="mt-8 grid gap-3 text-sm leading-6 text-[var(--ink-soft)]">
            <p className="flex items-start gap-3">
              <Truck className="mt-0.5 shrink-0" size={17} />
              <span>{copy.detail.shipping}</span>
            </p>
            <p className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 shrink-0" size={17} />
              <span>{copy.detail.aftersales}</span>
            </p>
          </div>

          <ProductReviews locale={locale} productSlug={product.slug} />
        </article>
      </section>

      <RegistrationDialog copy={copy.registration} isOpen={isRegistrationOpen} locale={locale} onClose={() => setIsRegistrationOpen(false)} />
    </main>
  );
}
