"use client";

import { Car, LineChart, Sparkles, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

const steps: { key: string; icon: LucideIcon }[] = [
  { key: "step1", icon: Car },
  { key: "step2", icon: Sparkles },
  { key: "step3", icon: Workflow },
  { key: "step4", icon: LineChart },
];

export function HowItWorksSection() {
  const { t } = useTranslation();

  return (
    <section id="how-it-works" className="border-y border-border bg-muted/30 py-20">
      <div className="mx-auto w-full max-w-7xl px-4 md:px-8">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            {t("landing.howItWorks.title")}
          </h2>
          <p className="text-muted-foreground">{t("landing.howItWorks.subtitle")}</p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <div key={step.key} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <step.icon className="size-4.5" />
                </div>
                <span className="font-mono text-sm text-muted-foreground">0{i + 1}</span>
              </div>
              <h3 className="text-base font-semibold text-foreground">{t(`landing.howItWorks.${step.key}Title`)}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t(`landing.howItWorks.${step.key}Description`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
