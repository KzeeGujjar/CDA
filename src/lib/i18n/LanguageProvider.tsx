"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { defaultLocale, isRtl, LOCALE_COOKIE, type Locale } from "./config";
import { dictionaries } from "./dictionaries";

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  dir: "ltr" | "rtl";
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function applyDocumentLocale(locale: Locale) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.dir = isRtl(locale) ? "rtl" : "ltr";
}

export function LanguageProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    applyDocumentLocale(next);
    if (typeof document !== "undefined") {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}`;
    }
  }, []);

  useEffect(() => {
    applyDocumentLocale(locale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({ locale, setLocale, dir: isRtl(locale) ? "rtl" : "ltr" }),
    [locale, setLocale]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}

function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function useTranslation() {
  const { locale, setLocale, dir } = useLanguage();

  const t = useCallback(
    (key: string): string => {
      const dict = dictionaries[locale];
      const fallback = dictionaries[defaultLocale];
      const value = getByPath(dict, key) ?? getByPath(fallback, key);
      return typeof value === "string" ? value : key;
    },
    [locale]
  );

  const tList = useCallback(
    (key: string): string[] => {
      const dict = dictionaries[locale];
      const fallback = dictionaries[defaultLocale];
      const value = getByPath(dict, key) ?? getByPath(fallback, key);
      return Array.isArray(value) ? (value as string[]) : [];
    },
    [locale]
  );

  return { t, tList, locale, setLocale, dir };
}
