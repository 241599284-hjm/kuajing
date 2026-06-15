"use client";

import { useMemo, useState } from "react";
import type { Locale } from "../lib/storefront-content.js";
import { defaultPhoneCountry, phoneCountries } from "../lib/phone-countries.js";

type InternationalPhoneFieldProps = {
  locale: Locale;
  label: string;
  required?: boolean;
};

export function InternationalPhoneField({ locale, label, required = false }: InternationalPhoneFieldProps) {
  const fallbackCountry = useMemo(() => defaultPhoneCountry(locale), [locale]);
  const [countryIso2, setCountryIso2] = useState(fallbackCountry.iso2);
  const selectedCountry = phoneCountries.find((country) => country.iso2 === countryIso2) ?? fallbackCountry;

  return (
    <div className="grid gap-2 text-sm font-medium md:col-span-2">
      <span>{label}</span>
      <div className="grid grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)] gap-2">
        <label className="sr-only" htmlFor="phoneCountry">{locale === "zh" ? "电话国家区号" : "Phone country code"}</label>
        <select
          className="h-11 border border-[var(--line)] bg-white px-3"
          id="phoneCountry"
          name="phoneCountry"
          onChange={(event) => setCountryIso2(event.target.value)}
          value={countryIso2}
        >
          {phoneCountries.map((country) => (
            <option key={country.iso2} value={country.iso2}>
              {country.flag} {country.dialCode} {locale === "zh" ? country.nameZh : country.nameEn}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="phoneNumber">{label}</label>
        <input
          className="h-11 border border-[var(--line)] bg-white px-3"
          id="phoneNumber"
          inputMode="tel"
          name="phoneNumber"
          placeholder={`${selectedCountry.dialCode} ${locale === "zh" ? "电话号码" : "phone number"}`}
          required={required}
          type="tel"
        />
      </div>
      <input name="phoneDialCode" type="hidden" value={selectedCountry.dialCode} />
    </div>
  );
}
