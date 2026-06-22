"use client";

import Link from "next/link";
import type { Locale } from "../lib/storefront-content.js";

export function StorefrontFooter({ locale }: { locale: Locale }) {
  return <footer className="ferncliff-footer">
    <div><Link className="ferncliff-wordmark" href="/">FERNCLIFF<span>ARTISAN OBJECTS</span></Link><p>{locale === "zh" ? "面向从容空间的手工陶瓷与雕塑器物。" : "Handmade ceramics and sculptural objects for considered interiors."}</p></div>
    <nav>
      <Link href="/products">{locale === "zh" ? "全部作品" : "All objects"}</Link>
      <Link href="/regions">{locale === "zh" ? "产地系列" : "Origins"}</Link>
      <Link href="/refund-return-policy">{locale === "zh" ? "物流与退换" : "Shipping & returns"}</Link>
      <Link href="/track-order">{locale === "zh" ? "查询订单" : "Track order"}</Link>
      <Link href="/contact-us">{locale === "zh" ? "联系我们" : "Contact"}</Link>
      <Link href="/privacy-policy">{locale === "zh" ? "隐私政策" : "Privacy"}</Link>
    </nav>
    <div className="ferncliff-partners" aria-label={locale === "zh" ? "支付与物流合作方" : "Payment and delivery partners"}><span>PayPal</span><span>VISA</span><span>Mastercard</span><span>DHL</span><span>UPS</span></div>
    <p>© {new Date().getFullYear()} FERNCLIFF</p>
  </footer>;
}
