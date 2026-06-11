"use client";

import { useEffect, useState } from "react";
import type { Locale } from "../lib/storefront-content.js";

const storageKey = "storefront-locale";

function isLocale(value: string | null): value is Locale {
  return value === "en" || value === "zh";
}

export function useStorefrontLocale() {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    try {
      const storedLocale = window.localStorage.getItem(storageKey);
      if (isLocale(storedLocale)) {
        setLocaleState(storedLocale);
      }
    } catch {
      // Local storage can be unavailable in hardened browser modes.
    }
  }, []);

  function setLocale(nextLocale: Locale) {
    setLocaleState(nextLocale);
    try {
      window.localStorage.setItem(storageKey, nextLocale);
    } catch {
      // Locale switching should still work for the current page.
    }
  }

  return [locale, setLocale] as const;
}
