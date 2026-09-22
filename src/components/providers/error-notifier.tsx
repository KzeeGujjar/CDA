"use client";

import { useEffect } from "react";
import { setErrorTranslator } from "@/lib/errors/notify";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

/** Gives the error notifications the user's language. Renders nothing. */
export function ErrorNotifier() {
  const { t } = useTranslation();
  useEffect(() => {
    setErrorTranslator(t);
    return () => setErrorTranslator(null);
  }, [t]);
  return null;
}
