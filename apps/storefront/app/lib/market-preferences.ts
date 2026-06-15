import type { Locale } from "./storefront-content.js";

export type MarketPreference = {
  countryIso2: string;
  language: Locale;
  currency: string;
};

const storageKey = "market-preferences";

export const supportedMarkets = [
  { iso2: "US", nameEn: "United States", nameZh: "美国", currency: "USD", language: "en" as Locale },
  { iso2: "GB", nameEn: "United Kingdom", nameZh: "英国", currency: "GBP", language: "en" as Locale },
  { iso2: "DE", nameEn: "Germany", nameZh: "德国", currency: "EUR", language: "en" as Locale },
  { iso2: "FR", nameEn: "France", nameZh: "法国", currency: "EUR", language: "en" as Locale },
  { iso2: "SG", nameEn: "Singapore", nameZh: "新加坡", currency: "SGD", language: "en" as Locale },
  { iso2: "CN", nameEn: "China", nameZh: "中国", currency: "CNY", language: "zh" as Locale }
];

export function inferMarketPreference(locale: Locale): MarketPreference {
  const language = locale;
  const fallback = language === "zh" ? supportedMarkets[supportedMarkets.length - 1] : supportedMarkets[0];

  return {
    countryIso2: fallback.iso2,
    language,
    currency: fallback.currency
  };
}

export function readMarketPreference(locale: Locale): MarketPreference {
  if (typeof window === "undefined") return inferMarketPreference(locale);

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return inferMarketPreference(locale);
    const parsed = JSON.parse(stored) as Partial<MarketPreference>;
    if (parsed.countryIso2 && parsed.currency && (parsed.language === "en" || parsed.language === "zh")) {
      return {
        countryIso2: parsed.countryIso2,
        currency: parsed.currency,
        language: parsed.language
      };
    }
  } catch {
    // Preference reading should not block rendering.
  }

  return inferMarketPreference(locale);
}

export function saveMarketPreference(preference: MarketPreference) {
  window.localStorage.setItem(storageKey, JSON.stringify(preference));
}
