"use client";

import { useEffect, useState } from "react";
import type { Locale } from "../lib/storefront-content.js";

const storageKey = "cookie-consent-v1";

export function CookieConsentBanner({ locale }: { locale: Locale }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(storageKey) !== "accepted");
    } catch {
      setVisible(true);
    }
  }, []);

  function accept() {
    try {
      window.localStorage.setItem(storageKey, "accepted");
    } catch {
      // Consent UI should still close for the current page.
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <aside
      aria-label={locale === "zh" ? "Cookie 同意提示" : "Cookie consent"}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--line)] bg-[var(--bg)] px-4 py-4 shadow-[0_-8px_30px_rgba(0,0,0,0.06)]"
      role="region"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-black">
            {locale === "zh" ? "关于本站 Cookie" : "About cookies"}
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
            {locale === "zh"
              ? "我们使用必要 Cookie 维持购物车、登录和结账体验；经同意后，可使用统计与偏好 Cookie 改善网站体验。"
              : "We use essential cookies for cart, login, and checkout. With consent, analytics and preference cookies help improve the store experience."}
          </p>
        </div>
        <div className="flex shrink-0 gap-3">
          <a className="premium-btn-outline h-11" href="/privacy-policy">
            {locale === "zh" ? "隐私政策" : "Privacy"}
          </a>
          <button className="premium-btn h-11" onClick={accept} type="button">
            {locale === "zh" ? "接受" : "Accept"}
          </button>
        </div>
      </div>
    </aside>
  );
}
