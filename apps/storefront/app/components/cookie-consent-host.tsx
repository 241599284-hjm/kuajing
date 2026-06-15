"use client";

import { CookieConsentBanner } from "./cookie-consent-banner.js";
import { useStorefrontLocale } from "./use-storefront-locale.js";

export function CookieConsentHost() {
  const [locale] = useStorefrontLocale();
  return <CookieConsentBanner locale={locale} />;
}
