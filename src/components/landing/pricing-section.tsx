"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { cn } from "@/utils";

const tiers = ["starter", "growth", "enterprise"] as const;

export function PricingSection() {
  const { t } = useTranslation();

  return (
    <section id="pricing" className="mx-auto w-full max-w-7xl px-4 py-20 md:px-8">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">{t("landing.pricing.title")}</h2>
        <p className="text-muted-foreground">{t("landing.pricing.subtitle")}</p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
        {tiers.map((tier, i) => {
          const isPopular = i === 1;
          return (
            <div key={tier} className="relative h-full pt-3">
              {isPopular && (
                <Badge className="absolute top-0 start-1/2 z-10 -translate-x-1/2 border-0 bg-primary text-primary-foreground">
                  {t("landing.pricing.mostPopular")}
                </Badge>
              )}
              <Card className={cn("h-full border-0", isPopular && "ring-2 ring-primary")}>
                <CardContent className="flex h-full flex-col gap-5">
                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-lg font-semibold text-foreground">{t(`landing.pricing.${tier}.name`)}</h3>
                    <p className="text-sm text-muted-foreground">{t(`landing.pricing.${tier}.tagline`)}</p>
                  </div>

                  <div className="text-2xl font-semibold text-foreground">{t("landing.pricing.priceLabel")}</div>

                  <ul className="flex flex-1 flex-col gap-2.5">
                    {[1, 2, 3, 4].map((n) => (
                      <li key={n} className="flex items-start gap-2 text-sm text-foreground">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                        {t(`landing.pricing.${tier}.feature${n}`)}
                      </li>
                    ))}
                  </ul>

                  <Button variant={isPopular ? "default" : "outline"} className="w-full" asChild>
                    <Link href="/dashboard">{t("landing.pricing.cta")}</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>
    </section>
  );
}
