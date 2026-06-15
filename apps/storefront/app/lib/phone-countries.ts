export type PhoneCountry = {
  iso2: string;
  nameEn: string;
  nameZh: string;
  dialCode: string;
  flag: string;
};

export const phoneCountries: PhoneCountry[] = [
  { iso2: "US", nameEn: "United States", nameZh: "美国", dialCode: "+1", flag: "🇺🇸" },
  { iso2: "GB", nameEn: "United Kingdom", nameZh: "英国", dialCode: "+44", flag: "🇬🇧" },
  { iso2: "CA", nameEn: "Canada", nameZh: "加拿大", dialCode: "+1", flag: "🇨🇦" },
  { iso2: "AU", nameEn: "Australia", nameZh: "澳大利亚", dialCode: "+61", flag: "🇦🇺" },
  { iso2: "DE", nameEn: "Germany", nameZh: "德国", dialCode: "+49", flag: "🇩🇪" },
  { iso2: "FR", nameEn: "France", nameZh: "法国", dialCode: "+33", flag: "🇫🇷" },
  { iso2: "SG", nameEn: "Singapore", nameZh: "新加坡", dialCode: "+65", flag: "🇸🇬" },
  { iso2: "MY", nameEn: "Malaysia", nameZh: "马来西亚", dialCode: "+60", flag: "🇲🇾" },
  { iso2: "TH", nameEn: "Thailand", nameZh: "泰国", dialCode: "+66", flag: "🇹🇭" },
  { iso2: "CN", nameEn: "China", nameZh: "中国", dialCode: "+86", flag: "🇨🇳" },
  { iso2: "HK", nameEn: "Hong Kong", nameZh: "中国香港", dialCode: "+852", flag: "🇭🇰" },
  { iso2: "JP", nameEn: "Japan", nameZh: "日本", dialCode: "+81", flag: "🇯🇵" },
  { iso2: "KR", nameEn: "South Korea", nameZh: "韩国", dialCode: "+82", flag: "🇰🇷" }
];

export function defaultPhoneCountry(locale: "en" | "zh") {
  return locale === "zh" ? phoneCountries.find((country) => country.iso2 === "CN") ?? phoneCountries[0] : phoneCountries[0];
}
