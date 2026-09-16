"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function CtaSection() {
  const { t } = useTranslation();

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-20 md:px-8">
      <div className="flex flex-col items-center gap-6 rounded-2xl border border-primary/25 bg-primary/5 px-6 py-14 text-center">
        <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          {t("landing.cta.title")}
        </h2>
        <p className="max-w-md text-muted-foreground">{t("landing.cta.subtitle")}</p>
        <Button size="lg" className="h-11 gap-2 px-6" asChild>
          <Link href="/dashboard">
            {t("landing.cta.button")}
            <ArrowRight className="size-4 rtl:-scale-x-100" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
