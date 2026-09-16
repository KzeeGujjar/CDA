"use client";

import { Globe } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function LanguageSection() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="size-4" /> {t("settings.nav.language")}
        </CardTitle>
        <CardDescription>{t("settings.language.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <LanguageSwitcher />
      </CardContent>
    </Card>
  );
}
