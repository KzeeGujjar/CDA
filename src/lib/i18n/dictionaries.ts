import en from "@/locales/en.json";
import ar from "@/locales/ar.json";
import ur from "@/locales/ur.json";
import hi from "@/locales/hi.json";
import type { Locale } from "./config";

export type Dictionary = typeof en;

export const dictionaries: Record<Locale, Dictionary> = {
  en,
  ar: ar as Dictionary,
  ur: ur as Dictionary,
  hi: hi as Dictionary,
};
