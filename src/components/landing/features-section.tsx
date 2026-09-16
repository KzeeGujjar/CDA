"use client";

import Link from "next/link";
import { ArrowRight, Bot, Gauge, Globe2, Megaphone, TrendingUp, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

const features: { key: string; icon: LucideIcon; href: string }[] = [
  { key: "aiAgent", icon: Bot, href: "/ai-assistant" },
  { key: "vehicleIntelligence", icon: Gauge, href: "/inventory" },
  { key: "marketIntelligence", icon: Globe2, href: "/market-intelligence" },
  { key: "crm", icon: Users, href: "/leads" },
  { key: "aiMarketing", icon: Megaphone, href: "/ai-marketing" },
  { key: "profitAnalytics", icon: TrendingUp, href: "/reports" },
];

export function FeaturesSection() {
  const { t } = useTranslation();

  return (
    <section id="features" className="mx-auto w-full max-w-7xl px-4 py-20 md:px-8">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">{t("landing.features.title")}</h2>
        <p className="text-muted-foreground">{t("landing.features.subtitle")}</p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <Link key={feature.key} href={feature.href} className="group">
            <Card className="h-full border-0 transition-shadow group-hover:ring-primary/40">
              <CardContent className="flex flex-col gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <feature.icon className="size-5" />
                </div>
                <h3 className="text-base font-semibold text-foreground">{t(`landing.features.${feature.key}.title`)}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t(`landing.features.${feature.key}.description`)}
                </p>
                <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  {t("common.seeDetails")}
                  <ArrowRight className="size-3.5 rtl:-scale-x-100" />
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
