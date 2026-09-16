"use client";

import { useState } from "react";
import { Languages, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { translationTargetLanguages, type TranslationTargetLanguage } from "@/lib/marketing-generator";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function TranslateAdvertisementCard({
  disabled,
  isGenerating,
  onTranslate,
}: {
  disabled: boolean;
  isGenerating: boolean;
  onTranslate: (target: TranslationTargetLanguage) => void;
}) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<TranslationTargetLanguage>("ar");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Languages className="size-4" /> {t("aiMarketing.types.translatedAd")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-2">
        <Select value={target} onValueChange={(v) => setTarget(v as TranslationTargetLanguage)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {translationTargetLanguages.map((l) => (
              <SelectItem key={l.value} value={l.value}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" className="shrink-0 gap-1.5" disabled={disabled} onClick={() => onTranslate(target)}>
          {isGenerating ? <Loader2 className="size-3.5 animate-spin" /> : <Languages className="size-3.5" />}
          {t("aiMarketing.translate")}
        </Button>
      </CardContent>
    </Card>
  );
}
