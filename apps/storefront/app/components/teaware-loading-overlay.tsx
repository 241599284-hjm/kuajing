"use client";

import type { Locale } from "../lib/storefront-content.js";

export function TeawareLoadingOverlay({ isOpen, locale }: { isOpen: boolean; locale: Locale }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 px-4 backdrop-blur-sm" role="status" aria-live="polite">
      <div className="grid w-full max-w-xs place-items-center border border-white/30 bg-[var(--bg)] px-8 py-9 text-center shadow-2xl">
        <svg className="teaware-loader" viewBox="0 0 180 120" aria-hidden="true">
          <path className="teaware-loader__pot" d="M44 54c12-19 49-19 62 0 8 12 4 30-12 38H55c-16-8-20-26-11-38Z" />
          <path className="teaware-loader__pot" d="M101 59c21-6 33 4 36 15-15-2-25 4-36 12" />
          <path className="teaware-loader__pot" d="M52 51c-4-13 6-22 19-22h12c13 0 23 9 19 22" />
          <path className="teaware-loader__cup" d="M112 91h36c-1 15-8 22-18 22s-17-7-18-22Z" />
          <path className="teaware-loader__cup" d="M108 113h44" />
          <path className="teaware-loader__water" d="M132 77c2 7-7 10-4 17" />
          <path className="teaware-loader__steam" d="M124 35c-8-8 7-12 0-21" />
          <path className="teaware-loader__steam teaware-loader__steam--slow" d="M141 38c-7-7 6-11 0-19" />
        </svg>
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
