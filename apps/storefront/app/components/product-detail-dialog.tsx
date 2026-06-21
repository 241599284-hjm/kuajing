"use client";

import type { CatalogStorefrontProduct } from "@commerce/contracts";
import { Check, LoaderCircle, ShoppingBag, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { addCartItem } from "../lib/cart.js";
import type { Locale } from "../lib/storefront-content.js";

const apiGatewayUrl = process.env.NEXT_PUBLIC_API_GATEWAY_URL ?? "http://localhost:4000";
const fallbackImage = "/assets/porcelain-tea-set-photo.webp";

function money(amountMinor: number, currency: string, locale: Locale) {
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2
  }).format(amountMinor / 100);
}

export function ProductDetailDialog({ slug, locale, onClose, onLoadingChange }: { slug: string | null; locale: Locale; onClose: () => void; onLoadingChange: (loading: boolean) => void }) {
  const [product, setProduct] = useState<CatalogStorefrontProduct | null>(null);
  const [error, setError] = useState("");
  const [imageUrl, setImageUrl] = useState(fallbackImage);

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    setProduct(null);
    setError("");
    setImageUrl(fallbackImage);
    onLoadingChange(true);

    void fetch(`${apiGatewayUrl}/catalog/products/${encodeURIComponent(slug)}`, {
      cache: "no-store",
      headers: { "x-correlation-id": globalThis.crypto?.randomUUID?.() ?? `product-${Date.now()}` },
      signal: controller.signal
    }).then(async (response) => {
      const payload = await response.json().catch(() => null) as CatalogStorefrontProduct | { message?: string } | null;
      if (!response.ok || !payload || !("slug" in payload)) throw new Error(locale === "zh" ? "商品不存在、已下架或当前不可查看。" : "This item is unavailable or no longer exists.");
      setProduct(payload);
      setImageUrl(payload.imageUrl || fallbackImage);
    }).catch((reason) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : (locale === "zh" ? "商品详情加载失败。" : "Unable to load product details."));
    }).finally(() => {
      if (!controller.signal.aborted) onLoadingChange(false);
    });

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      controller.abort();
      setProduct(null);
      setError("");
      onLoadingChange(false);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [locale, onClose, onLoadingChange, slug]);

  if (!slug || typeof document === "undefined") return null;
  const localized = product ? (product.copy[locale] ?? product.copy.en ?? Object.values(product.copy)[0]) : null;

  return createPortal(
    <div className="ferncliff-product-dialog-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section aria-busy={!product && !error} aria-labelledby="product-dialog-title" aria-modal="true" className="ferncliff-product-dialog" role="dialog">
        <button aria-label={locale === "zh" ? "关闭商品详情" : "Close product details"} className="ferncliff-dialog-close" onClick={onClose} type="button"><X/></button>
        {!product && !error ? <div className="ferncliff-dialog-state" role="status"><LoaderCircle className="animate-spin"/><p>{locale === "zh" ? "正在加载商品详情" : "Loading product details"}</p></div> : null}
        {error ? <div className="ferncliff-dialog-state"><p>{error}</p><button className="ferncliff-primary-button" onClick={onClose} type="button">{locale === "zh" ? "关闭" : "Close"}</button></div> : null}
        {product && localized ? <div className="ferncliff-dialog-grid">
          <div className="ferncliff-dialog-media"><img alt={localized.name} decoding="async" height="900" loading="lazy" onError={() => setImageUrl(fallbackImage)} src={imageUrl} width="1200"/></div>
          <div className="ferncliff-dialog-copy">
            <p className="ferncliff-eyebrow">{localized.tag}</p>
            <h2 id="product-dialog-title">{localized.name}</h2>
            <strong className="ferncliff-dialog-price">{money(product.price.amountMinor, product.price.currency, locale)}</strong>
            <p>{localized.longDescription}</p>
            <ul>{localized.highlights.map((highlight) => <li key={highlight}><Check/>{highlight}</li>)}</ul>
            <dl>
              <div><dt>{locale === "zh" ? "材质" : "Material"}</dt><dd>{localized.details.material}</dd></div>
              <div><dt>{locale === "zh" ? "容量" : "Capacity"}</dt><dd>{localized.details.capacity}</dd></div>
              <div><dt>{locale === "zh" ? "产地" : "Origin"}</dt><dd>{localized.details.origin}</dd></div>
              <div><dt>HS Code</dt><dd>{localized.details.hsCode}</dd></div>
            </dl>
            <div className="ferncliff-dialog-actions"><button className="ferncliff-primary-button" disabled={product.stock <= 0} onClick={() => addCartItem(product.slug)} type="button"><ShoppingBag/>{product.stock <= 0 ? (locale === "zh" ? "已售罄" : "Sold out") : (locale === "zh" ? "加入购物车" : "Add to cart")}</button><span>{product.stock > 0 ? (locale === "zh" ? `仅余 ${product.stock} 件` : `${product.stock} remaining`) : (locale === "zh" ? "补货通知即将开放" : "Restock notice coming soon")}</span></div>
          </div>
        </div> : null}
      </section>
    </div>,
    document.body
  );
}
