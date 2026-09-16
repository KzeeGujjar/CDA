export const locales = ["en", "ar", "ur", "hi"] as const;
export type Locale = (typeof locales)[number];

export const rtlLocales: Locale[] = ["ar", "ur"];

export const defaultLocale: Locale = "en";

export const localeMeta: Record<Locale, { label: string; nativeLabel: string }> = {
  en: { label: "English", nativeLabel: "English" },
  ar: { label: "Arabic", nativeLabel: "العربية" },
  ur: { label: "Urdu", nativeLabel: "اردو" },
  hi: { label: "Hindi", nativeLabel: "हिन्दी" },
};

export function isRtl(locale: Locale): boolean {
  return rtlLocales.includes(locale);
}

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export const LOCALE_COOKIE = "car-dealer-locale";
