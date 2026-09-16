"use client";

import { Loader2 } from "lucide-react";
import { marketingContentMeta, marketingContentTypes } from "@/lib/marketing-content-meta";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { cn } from "@/utils";
import type { MarketingContentType, MarketingGeneratedType } from "@/types/marketing";

export function MarketingFunctionGrid({
  disabled,
  generatingType,
  onGenerate,
}: {
  disabled: boolean;
  generatingType: MarketingGeneratedType | null;
  onGenerate: (type: MarketingContentType) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {marketingContentTypes.map((type) => {
        const meta = marketingContentMeta[type];
        const Icon = meta.icon;
        const isGenerating = generatingType === type;
        return (
          <button
            key={type}
            type="button"
            disabled={disabled || generatingType !== null}
            onClick={() => onGenerate(type)}
            className={cn(
              "flex flex-col items-start gap-2 rounded-xl border border-border p-3 text-start transition-colors",
              "hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {isGenerating ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
            </div>
            <span className="text-sm font-medium text-foreground">{t(`aiMarketing.types.${meta.labelKey}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
