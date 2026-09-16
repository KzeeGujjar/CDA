"use client";

import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { locales, localeMeta } from "@/lib/i18n/config";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { cn } from "@/utils";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t("common.language")} className="gap-1.5 px-2">
          <Languages className="size-4" />
          <span className="text-xs font-medium uppercase">{locale}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {locales.map((l) => (
          <DropdownMenuItem key={l} onClick={() => setLocale(l)} className={cn(locale === l && "text-primary")}>
            <span className="flex-1">{localeMeta[l].nativeLabel}</span>
            <span className="text-xs text-muted-foreground uppercase">{l}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
