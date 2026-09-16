"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Megaphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getActiveDashboardAds } from "@/services/dashboard-ads";

export function DashboardAdBanner() {
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const { data: ads } = useQuery({ queryKey: ["dashboard-ads-active"], queryFn: getActiveDashboardAds });

  const visibleAds = (ads ?? []).filter((ad) => !dismissedIds.includes(ad.id));
  if (visibleAds.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {visibleAds.map((ad) => (
        <div
          key={ad.id}
          className="flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/[0.06] px-4 py-3.5 sm:items-center"
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Megaphone className="size-4" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-sm font-medium text-foreground">{ad.title}</span>
              {ad.badge && (
                <Badge variant="default" className="shrink-0">
                  {ad.badge}
                </Badge>
              )}
            </div>
            <span className="min-w-0 truncate text-sm text-muted-foreground">{ad.description}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="outline" size="sm" asChild>
              <Link href={ad.ctaUrl}>{ad.ctaLabel}</Link>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Dismiss"
              onClick={() => setDismissedIds((prev) => [...prev, ad.id])}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
