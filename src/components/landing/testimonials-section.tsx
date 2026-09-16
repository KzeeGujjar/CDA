"use client";

import { Quote } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

const testimonials = [1, 2, 3] as const;

function avatarUrl(seed: string) {
  return `https://i.pravatar.cc/150?u=landing-${seed}`;
}

export function TestimonialsSection() {
  const { t } = useTranslation();

  return (
    <section className="border-y border-border bg-muted/30 py-20">
      <div className="mx-auto w-full max-w-7xl px-4 md:px-8">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            {t("landing.testimonials.title")}
          </h2>
          <p className="text-muted-foreground">{t("landing.testimonials.subtitle")}</p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
          {testimonials.map((n) => {
            const name = t(`landing.testimonials.name${n}`);
            return (
              <Card key={n} className="h-full border-0">
                <CardContent className="flex h-full flex-col gap-4">
                  <Quote className="size-6 text-primary/40" />
                  <p className="flex-1 text-sm leading-relaxed text-foreground">
                    {t(`landing.testimonials.quote${n}`)}
                  </p>
                  <div className="flex items-center gap-2.5 border-t border-border pt-4">
                    <Avatar className="size-9">
                      <AvatarImage src={avatarUrl(String(n))} alt={name} />
                      <AvatarFallback>{name.slice(0, 2)}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col overflow-hidden">
                      <span className="truncate text-sm font-medium text-foreground">{name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {t(`landing.testimonials.role${n}`)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
