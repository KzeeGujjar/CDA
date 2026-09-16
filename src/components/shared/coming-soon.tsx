"use client";

import type { LucideIcon } from "lucide-react";
import { Check, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function ComingSoon({ icon: Icon, moduleKey }: { icon: LucideIcon; moduleKey: string }) {
  const { t, tList } = useTranslation();
  const title = t(`placeholder.${moduleKey}.title`);
  const description = t(`placeholder.${moduleKey}.description`);
  const capabilities = tList(`placeholder.${moduleKey}.capabilities`);

  return (
    <div className="flex flex-1 items-center justify-center py-10">
      <Card className="w-full max-w-lg border-0">
        <CardContent className="flex flex-col items-center gap-6 py-10 text-center">
          <div className="relative flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="size-7" />
            <span className="absolute -top-1.5 -end-1.5 flex size-6 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Sparkles className="size-3.5" />
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <span className="mx-auto inline-flex w-fit items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {t("common.comingSoon")}
            </span>
            <h2 className="text-xl font-semibold text-foreground">{title}</h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          {capabilities.length > 0 && (
            <div className="flex w-full flex-col gap-2.5 border-t border-border pt-6 text-start">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("common.whatItWillDo")}
              </span>
              <ul className="flex flex-col gap-2">
                {capabilities.map((cap) => (
                  <li key={cap} className="flex items-start gap-2 text-sm text-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{cap}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
