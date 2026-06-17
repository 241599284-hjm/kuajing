"use client";

import { ArrowLeft, Minus, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";
import { removeCartItem, setCartItemQuantity, useCart } from "../lib/cart.js";
import { storefrontCopy } from "../lib/storefront-content.js";
import { PremiumStorefrontHeader } from "./premium-storefront-header.js";
import { RegistrationDialog } from "./registration-dialog.js";
import { useStorefrontLocale } from "./use-storefront-locale.js";

function formatMoney(value: number) {
  return `$${value.toFixed(0)}`;
}

export function CartShell() {
  const [locale, setLocale] = useStorefrontLocale();
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);
  const copy = storefrontCopy[locale];
  const isZh = locale === "zh";
  const cart = useCart();
  const discount = Math.max(0, cart.originalSubtotal - cart.subtotal);

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
          {isZh ? "继续购物" : "Continue shopping"}
        </Link>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
              {isZh ? "购物车" : "Cart"}
            </p>
            <h1 className="premium-display mt-2 text-5xl leading-tight sm:text-7xl">{isZh ? "购物车" : "Shopping cart"}</h1>
          </div>
          <p className="text-sm text-[var(--ink-soft)]">
            {isZh ? `共 ${cart.count} 件商品` : `${cart.count} items`}
          </p>
        </div>

        {cart.items.length === 0 ? (
          <div className="mt-8 border border-dashed border-[var(--line)] px-4 py-14 text-center">
            <h2 className="text-xl font-semibold">{isZh ? "购物车还是空的" : "Your cart is empty"}</h2>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              {isZh ? "去商品详情页点击加入购物车，商品会保存在本地购物车里。" : "Open a product detail page and add an item to keep it here."}
            </p>
            <Link className="premium-btn mt-5" href={"/products" as Route}>
              {isZh ? "去选商品" : "Shop products"}
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="grid gap-4">
              {cart.items.map(({ product, quantity }) => {
                const productCopy = product.copy[locale];

                return (
                  <article key={product.slug} className="grid gap-4 border-b border-[var(--line)] pb-5 sm:grid-cols-[8rem_minmax(0,1fr)]">
                    <img alt={productCopy.name} className="aspect-square w-full bg-[var(--surface)] object-cover" src={product.image} />
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="text-lg font-semibold">{productCopy.name}</h2>
                          <p className="mt-1 text-sm text-[var(--ink-soft)]">{productCopy.tag} · {product.sku}</p>
                          <p className="mt-1 text-sm text-[var(--ink-soft)]">
                            {copy.collection.stock.replace("{count}", String(product.stock))}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-semibold">{formatMoney(product.priceValue * quantity)}</p>
                          <p className="text-sm text-[var(--ink-soft)] line-through">{formatMoney(product.originalPriceValue * quantity)}</p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <div className="flex h-10 items-center border border-[var(--line)]">
                          <button
                            aria-label={isZh ? "减少数量" : "Decrease quantity"}
                            className="flex size-10 items-center justify-center disabled:opacity-40"
                            disabled={quantity <= 1}
                            onClick={() => setCartItemQuantity(product.slug, quantity - 1)}
                            type="button"
                          >
                            <Minus size={15} />
                          </button>
                          <span className="w-8 text-center text-sm font-semibold">{quantity}</span>
                          <button
                            aria-label={isZh ? "增加数量" : "Increase quantity"}
                            className="flex size-10 items-center justify-center disabled:opacity-40"
                            disabled={quantity >= product.stock}
                            onClick={() => setCartItemQuantity(product.slug, quantity + 1)}
                            type="button"
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                        <button
                          className="inline-flex h-10 items-center gap-2 border border-[var(--line)] px-4 text-sm font-semibold"
                          onClick={() => removeCartItem(product.slug)}
                          type="button"
                        >
                          <Trash2 size={15} />
                          {isZh ? "删除" : "Remove"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <aside className="h-fit border border-[var(--line)] bg-white/70 p-5">
              <h2 className="text-xl font-semibold">{isZh ? "订单摘要" : "Order summary"}</h2>
              <div className="mt-4 grid gap-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--ink-soft)]">{isZh ? "原价小计" : "Original subtotal"}</span>
                  <span className="line-through">{formatMoney(cart.originalSubtotal)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--ink-soft)]">{isZh ? "折扣" : "Discount"}</span>
                  <span>-{formatMoney(discount)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--ink-soft)]">{isZh ? "运费 / 税费" : "Shipping / tax"}</span>
                  <span>{isZh ? "结算页计算" : "At checkout"}</span>
                </div>
                <div className="flex justify-between gap-4 border-t border-[var(--line)] pt-3 text-base font-semibold">
                  <span>{isZh ? "当前小计" : "Subtotal"}</span>
                  <span>{formatMoney(cart.subtotal)}</span>
                </div>
              </div>
              <Link className="premium-btn mt-5 w-full" href={"/checkout" as Route}>
                {isZh ? "去结算" : "Checkout"}
              </Link>
            </aside>
          </div>
        )}
      </section>
      <RegistrationDialog copy={copy.registration} isOpen={isRegistrationOpen} locale={locale} onClose={() => setIsRegistrationOpen(false)} />
    </main>
  );
}
