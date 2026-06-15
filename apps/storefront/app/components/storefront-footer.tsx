"use client";

import Link from "next/link";
import type { Route } from "next";
import type { Locale } from "../lib/storefront-content.js";

const columns = {
  en: [
    {
      title: "Shop",
      links: [
        { label: "All products", href: "/#products" },
        { label: "Regional collections", href: "/regions" },
        { label: "Track order", href: "/track-order" }
      ]
    },
    {
      title: "Customer Care",
      links: [
        { label: "Contact us", href: "/contact-us" },
        { label: "Refund and returns", href: "/refund-return-policy" },
        { label: "Privacy policy", href: "/privacy-policy" },
        { label: "Terms of service", href: "/terms-of-service" }
      ]
    },
    {
      title: "Subscribe",
      links: [
        { label: "Email: [CONTACT_EMAIL]", href: "/contact-us" },
        { label: "Phone: [CONTACT_PHONE]", href: "/contact-us" }
      ]
    }
  ],
  zh: [
    {
      title: "商城",
      links: [
        { label: "全部商品", href: "/#products" },
        { label: "地域系列", href: "/regions" },
        { label: "物流追踪", href: "/track-order" }
      ]
    },
    {
      title: "客户服务",
      links: [
        { label: "联系我们", href: "/contact-us" },
        { label: "退款退货政策", href: "/refund-return-policy" },
        { label: "隐私政策", href: "/privacy-policy" },
        { label: "服务条款", href: "/terms-of-service" }
      ]
    },
    {
      title: "联系方式",
      links: [
        { label: "邮箱：[CONTACT_EMAIL]", href: "/contact-us" },
        { label: "电话：[CONTACT_PHONE]", href: "/contact-us" }
      ]
    }
  ]
} as const;

export function StorefrontFooter({ locale }: { locale: Locale }) {
  return (
    <footer className="border-t border-[var(--line)] bg-[rgba(251,250,247,0.96)]">
      <div className="premium-container grid gap-10 py-12 md:grid-cols-[1.2fr_2fr] md:py-16">
        <div>
          <h2 className="premium-display text-2xl text-black">{locale === "zh" ? "代茶具" : "CERATEA"}</h2>
          <p className="mt-4 max-w-xs text-sm leading-6 text-[var(--ink-soft)]">
            {locale === "zh"
              ? "用于跨境茶具独立站的自营精品商城底座，后续可替换品牌、政策、支付和物流配置。"
              : "A premium teaware storefront foundation with replaceable brand, policy, payment, and logistics settings."}
          </p>
        </div>
        <div className="grid gap-8 sm:grid-cols-3">
          {columns[locale].map((column) => (
            <div key={column.title}>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-black">{column.title}</p>
              <nav className="mt-4 grid gap-3 text-sm text-[var(--ink-soft)]">
                {column.links.map((link) => (
                  <Link key={link.label} className="premium-focus hover:text-black" href={link.href as Route}>
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
          ))}
        </div>
      </div>
      <div className="premium-container border-t border-[var(--line)] py-5 text-xs text-[var(--ink-soft)]">
        © 2026 [BRAND_NAME]. {locale === "zh" ? "保留所有权利。" : "All rights reserved."}
      </div>
    </footer>
  );
}
