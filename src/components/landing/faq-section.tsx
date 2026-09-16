"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { cn } from "@/utils";

const questions = [1, 2, 3, 4, 5, 6] as const;

export function FaqSection() {
  const { t } = useTranslation();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="mx-auto w-full max-w-3xl px-4 py-20 md:px-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">{t("landing.faq.title")}</h2>
        <p className="text-muted-foreground">{t("landing.faq.subtitle")}</p>
      </div>

      <div className="mt-10 flex flex-col divide-y divide-border rounded-xl border border-border">
        {questions.map((n) => {
          const isOpen = openIndex === n - 1;
          return (
            <div key={n}>
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : n - 1)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-start text-sm font-medium text-foreground hover:bg-muted/40"
              >
                {t(`landing.faq.q${n}`)}
                <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <div className="px-5 pb-4 text-sm leading-relaxed text-muted-foreground">{t(`landing.faq.a${n}`)}</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
