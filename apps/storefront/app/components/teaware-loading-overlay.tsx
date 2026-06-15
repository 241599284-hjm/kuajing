"use client";

import type { Locale } from "../lib/storefront-content.js";
import { HLArtisanLogo } from "./hl-artisan-logo.js";

export function TeawareLoadingOverlay({ isOpen, locale }: { isOpen: boolean; locale: Locale }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 px-4 backdrop-blur-sm" role="status" aria-live="polite">
      <div className="grid w-full max-w-xs place-items-center border border-white/30 bg-[var(--bg)] px-8 py-9 text-center shadow-2xl">
        <HLArtisanLogo animated className="h-28 w-36" variant="mark" />
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-black">
          {locale === "zh" ? "正在处理" : "Processing"}
        </p>
        <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
          {locale === "zh" ? "正在为你确认订单，请稍候。" : "Preparing your order confirmation. Please wait."}
        </p>
      </div>
    </div>
  );
}
