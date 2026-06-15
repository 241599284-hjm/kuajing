"use client";

import type { Locale } from "../lib/storefront-content.js";

type LanguageToggleProps = {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  variant?: "compact" | "full";
  className?: string;
};

export function LanguageToggle({ locale, onLocaleChange, variant = "full", className = "" }: LanguageToggleProps) {
  const nextLocale = locale === "en" ? "zh" : "en";
  const label = locale === "en" ? "中文" : "EN";
  const fullLabel = locale === "en" ? "EN / 中文" : "中文 / EN";

  return (
    <button
      type="button"
      aria-label={locale === "en" ? "Switch language to Chinese" : "Switch language to English"}
      className={[
        "premium-focus flex h-10 shrink-0 items-center justify-center bg-transparent text-sm font-semibold text-black",
        variant === "compact" ? "w-10 px-0" : "px-3 md:px-4",
        className
      ].join(" ")}
      onClick={() => onLocaleChange(nextLocale)}
    >
      {variant === "compact" ? label : fullLabel}
    </button>
  );
}
