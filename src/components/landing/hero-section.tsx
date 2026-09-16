"use client";

import Link from "next/link";
import { ArrowRight, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function HeroSection() {
  const { t } = useTranslation();

  const stats = [
    { value: t("landing.hero.stat1Value"), label: t("landing.hero.stat1Label") },
    { value: t("landing.hero.stat2Value"), label: t("landing.hero.stat2Label") },
    { value: t("landing.hero.stat3Value"), label: t("landing.hero.stat3Label") },
  ];

  const tiles = [
    { label: t("dashboard.kpi.totalVehicles"), value: "20", delta: "11.1%" },
    { label: t("dashboard.kpi.grossProfit"), value: "AED 617K", delta: "6.2%" },
    { label: t("dashboard.kpi.newLeads"), value: "8", delta: "14.3%" },
    { label: t("dashboard.kpi.conversionRate"), value: "24.5%", delta: "2.1%" },
  ];

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col items-center gap-10 px-4 pt-16 pb-20 text-center md:px-8 md:pt-24 md:pb-28">
      <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
        <Sparkles className="size-3.5" />
        {t("landing.hero.badge")}
      </div>

      <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl md:text-6xl">
        {t("landing.hero.headline")}
      </h1>

      <p className="max-w-xl text-lg text-muted-foreground md:text-xl">{t("landing.hero.subheading")}</p>

      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <Button size="lg" className="h-11 gap-2 px-6" asChild>
          <Link href="/dashboard">
            {t("landing.hero.ctaPrimary")}
            <ArrowRight className="size-4 rtl:-scale-x-100" />
          </Link>
        </Button>
        <Button size="lg" variant="outline" className="h-11 px-6" asChild>
          <a href="#how-it-works">{t("landing.hero.ctaSecondary")}</a>
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 pt-2">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col items-center">
            <span className="font-mono text-2xl font-semibold text-foreground">{stat.value}</span>
            <span className="text-xs text-muted-foreground">{stat.label}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-card ring-1 ring-foreground/10">
        <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-destructive/60" />
          <span className="size-2.5 rounded-full bg-accent/60" />
          <span className="size-2.5 rounded-full bg-primary/60" />
        </div>
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className="flex flex-col gap-1 rounded-xl border border-border p-3.5 text-start">
              <span className="truncate text-xs text-muted-foreground">{tile.label}</span>
              <span className="font-mono text-lg font-semibold text-foreground">{tile.value}</span>
              <span className="inline-flex w-fit items-center gap-1 text-xs font-medium text-primary">
                <TrendingUp className="size-3" />
                {tile.delta}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
