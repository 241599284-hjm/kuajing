"use client";

import { useEffect, useMemo, useState } from "react";
import { products } from "./storefront-content.js";

export type CartLine = {
  slug: string;
  quantity: number;
};

const storageKey = "demo-teaware-cart";
const cartChangedEvent = "demo-teaware-cart-changed";

function getProductStock(slug: string) {
  return products.find((product) => product.slug === slug)?.stock ?? 0;
}

function normalizeLines(value: unknown): CartLine[] {
  if (!Array.isArray(value)) return [];

  return value.reduce<CartLine[]>((lines, item) => {
    if (!item || typeof item.slug !== "string" || typeof item.quantity !== "number") return lines;

    const stock = getProductStock(item.slug);
    if (stock <= 0) return lines;

    lines.push({
      slug: item.slug,
      quantity: Math.min(stock, Math.max(1, Math.floor(item.quantity)))
    });
    return lines;
  }, []);
}

export function readCart(): CartLine[] {
  try {
    return normalizeLines(JSON.parse(window.localStorage.getItem(storageKey) ?? "[]"));
  } catch {
    return [];
  }
}

function writeCart(lines: CartLine[]) {
  const normalizedLines = normalizeLines(lines);
  window.localStorage.setItem(storageKey, JSON.stringify(normalizedLines));
  window.dispatchEvent(new Event(cartChangedEvent));
}

export function addCartItem(slug: string, quantity = 1) {
  const stock = getProductStock(slug);
  if (stock <= 0) return;

  const lines = readCart();
  const currentLine = lines.find((line) => line.slug === slug);

  if (currentLine) {
    writeCart(lines.map((line) => (
      line.slug === slug ? { ...line, quantity: Math.min(stock, line.quantity + quantity) } : line
    )));
    return;
  }

  writeCart([...lines, { slug, quantity: Math.min(stock, Math.max(1, quantity)) }]);
}

export function setCartItemQuantity(slug: string, quantity: number) {
  if (quantity <= 0) {
    removeCartItem(slug);
    return;
  }

  const stock = getProductStock(slug);
  writeCart(readCart().map((line) => (
    line.slug === slug ? { ...line, quantity: Math.min(stock, Math.floor(quantity)) } : line
  )));
}

export function removeCartItem(slug: string) {
  writeCart(readCart().filter((line) => line.slug !== slug));
}

export function clearCart() {
  writeCart([]);
}

export function useCart() {
  const [lines, setLines] = useState<CartLine[]>([]);

  useEffect(() => {
    function refreshCart() {
      setLines(readCart());
    }

    refreshCart();
    window.addEventListener(cartChangedEvent, refreshCart);
    window.addEventListener("storage", refreshCart);

    return () => {
      window.removeEventListener(cartChangedEvent, refreshCart);
      window.removeEventListener("storage", refreshCart);
    };
  }, []);

  const items = useMemo(() => {
    return lines
      .map((line) => {
        const product = products.find((item) => item.slug === line.slug);
        if (!product) return null;
        return { product, quantity: line.quantity };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [lines]);

  const count = items.reduce((total, item) => total + item.quantity, 0);
  const subtotal = items.reduce((total, item) => total + item.product.priceValue * item.quantity, 0);
  const originalSubtotal = items.reduce((total, item) => total + item.product.originalPriceValue * item.quantity, 0);

  return {
    count,
    items,
    lines,
    originalSubtotal,
    subtotal
  };
}
