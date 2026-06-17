"use client";

import { useEffect, useState } from "react";
import type { Locale } from "../lib/storefront-content.js";
import { readMarketPreference, saveMarketPreference, supportedMarkets } from "../lib/market-preferences.js";

type MarketPreferenceSelectorProps = {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
};

export function MarketPreferenceSelector({ locale, onLocaleChange }: MarketPreferenceSelectorProps) {
  const [countryIso2, setCountryIso2] = useState(() => readMarketPreference(locale).countryIso2);
  const currentMarket = supportedMarkets.find((market) => market.iso2 === countryIso2) ?? supportedMarkets[0];

  useEffect(() => {
    saveMarketPreference({
      countryIso2,
      currency: currentMarket.currency,
      language: locale
    });
  }, [countryIso2, currentMarket.currency, locale]);

  return (
    <div className="grid gap-4 bg-white">
      <label className="grid gap-2 text-sm font-medium">
        {locale === "zh" ? "运送到" : "Ship to"}
        <select
          className="h-11 border-b border-black/25 bg-white px-0 outline-none"
          onChange={(event) => setCountryIso2(event.target.value)}
          value={countryIso2}
        >
          {supportedMarkets.map((market) => (
            <option key={market.iso2} value={market.iso2}>
              {locale === "zh" ? market.nameZh : market.nameEn}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-2 text-sm font-medium">
        {locale === "zh" ? "语言" : "Language"}
        <select
          className="h-11 border-b border-black/25 bg-white px-0 outline-none"
          onChange={(event) => onLocaleChange(event.target.value === "zh" ? "zh" : "en")}
          value={locale}
        >
          <option value="en">English</option>
          <option value="zh">中文</option>
        </select>
      </label>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]">
        {locale === "zh" ? "货币" : "Currency"}: {currentMarket.currency}
      </p>
    </div>
  );
}
