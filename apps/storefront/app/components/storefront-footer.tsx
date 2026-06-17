"use client";

import Link from "next/link";
import type { Route } from "next";
import type { Locale } from "../lib/storefront-content.js";
import { HLArtisanLogo } from "./hl-artisan-logo.js";

const footerColumns = {
  en: [
    {
      title: "Shop",
      links: [
        { label: "All Products", href: "/#products" },
        { label: "Tea Sets", href: "/categories/gift" },
        { label: "Single Cups", href: "/categories/teacup" },
        { label: "Decor Vases", href: "/categories/accessories" },
        { label: "Gift Boxes", href: "/categories/gift" },
        { label: "Best Sellers", href: "/#products" },
        { label: "New Arrivals", href: "/#new-arrivals" }
      ]
    },
    {
      title: "Customer Support",
      links: [
        { label: "Shipping Information", href: "/track-order" },
        { label: "Return & Replacement Policy", href: "/refund-return-policy" },
        { label: "FAQ", href: "/track-order" },
        { label: "Track My Order", href: "/track-order" },
        { label: "Contact Us", href: "/contact-us" }
      ]
    },
    {
      title: "Our Brand",
      links: [
        { label: "Our Craft Story", href: "/#craft" },
        { label: "Jingdezhen Production", href: "/#craft" },
        { label: "Wholesale Cooperation", href: "/contact-us" },
        { label: "Custom Porcelain Service", href: "/regions" }
      ]
    },
    {
      title: "Follow Us",
      links: [
        { label: "Instagram", href: "https://www.instagram.com/" },
        { label: "Pinterest", href: "https://www.pinterest.com/" },
        { label: "Facebook", href: "https://www.facebook.com/" },
        { label: "TikTok", href: "https://www.tiktok.com/" }
      ]
    }
  ],
  zh: [
    {
      title: "商城",
      links: [
        { label: "全部商品", href: "/#products" },
        { label: "整套茶具", href: "/categories/gift" },
        { label: "单杯单品", href: "/categories/teacup" },
        { label: "陶瓷花瓶", href: "/categories/accessories" },
        { label: "礼品礼盒", href: "/categories/gift" },
        { label: "热销爆款", href: "/#products" },
        { label: "新品", href: "/#new-arrivals" }
      ]
    },
    {
      title: "客户支持",
      links: [
        { label: "物流信息", href: "/track-order" },
        { label: "退款退货政策", href: "/refund-return-policy" },
        { label: "常见问题", href: "/track-order" },
        { label: "查询订单", href: "/track-order" },
        { label: "联系我们", href: "/contact-us" }
      ]
    },
    {
      title: "品牌",
      links: [
        { label: "工艺故事", href: "/#craft" },
        { label: "景德镇生产", href: "/#craft" },
        { label: "批发合作", href: "/contact-us" },
        { label: "定制瓷器服务", href: "/regions" }
      ]
    },
    {
      title: "社媒",
      links: [
        { label: "Instagram", href: "https://www.instagram.com/" },
        { label: "Pinterest", href: "https://www.pinterest.com/" },
        { label: "Facebook", href: "https://www.facebook.com/" },
        { label: "TikTok", href: "https://www.tiktok.com/" }
      ]
    }
  ]
} as const;

export function StorefrontFooter({ locale }: { locale: Locale }) {
  const isZh = locale === "zh";

  return (
    <footer className="bg-[var(--ink)] text-white">
      <div className="premium-container grid gap-10 py-12 md:grid-cols-[1.05fr_2.4fr] md:py-16">
        <div>
          <HLArtisanLogo className="h-auto w-52 brightness-0 invert" decorative showSeal={false} variant="wordmark" />
          <p className="mt-5 max-w-xs text-sm leading-7 text-white/66">
            {isZh
              ? "手工景德镇瓷器、整套茶具、礼品瓷器和家居陶瓷，面向海外买家的独立站。"
              : "Handmade Jingdezhen porcelain, teaware, gift ceramics, and home decor for global buyers."}
          </p>
        </div>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {footerColumns[locale].map((column) => (
            <div key={column.title}>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-white">{column.title}</p>
              <nav className="mt-4 grid gap-3 text-sm text-white/66">
                {column.links.map((link) => {
                  const isExternal = link.href.startsWith("http");

                  return isExternal ? (
                    <a key={link.label} className="premium-focus hover:text-white" href={link.href} rel="noreferrer" target="_blank">
                      {link.label}
                    </a>
                  ) : (
                    <Link key={link.label} className="premium-focus hover:text-white" href={link.href as Route}>
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>
      </div>
      <div className="premium-container border-t border-white/15 py-5">
        <div className="flex flex-col gap-3 text-xs text-white/60 md:flex-row md:items-center md:justify-between">
          <p>PayPal · Visa · Mastercard · Stripe</p>
          <p>Copyright © 2026 H&L Artisan Porcelain Store. All Rights Reserved.</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/60">
          <Link className="hover:text-white" href={"/privacy-policy" as Route}>Privacy Policy</Link>
          <Link className="hover:text-white" href={"/terms-of-service" as Route}>Terms of Service</Link>
          <Link className="hover:text-white" href={"/refund-return-policy" as Route}>Return Policy</Link>
          <Link className="hover:text-white" href={"/contact-us" as Route}>Contact Us</Link>
        </div>
      </div>
    </footer>
  );
}
