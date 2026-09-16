"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Car, Handshake, ShoppingBag, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatMoney } from "@/components/shared/currency";
import { EmptyState } from "@/components/shared/empty-state";
import { leadStageTone } from "@/components/leads/lead-stage";
import { getLeadsByCustomerId } from "@/services/leads";
import { getDealsByCustomerId } from "@/services/deals";
import { getVehicles } from "@/services/vehicles";
import { getProfitMarginPct } from "@/lib/vehicle-finance";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { DealStatus } from "@/types/deal";

const negotiationStatuses: DealStatus[] = ["draft", "sent", "accepted"];

export function CustomerOverviewPanel({ customerId }: { customerId: string }) {
  const { t, locale } = useTranslation();
  const { data: leads = [] } = useQuery({
    queryKey: ["leads", "by-customer", customerId],
    queryFn: () => getLeadsByCustomerId(customerId),
  });
  const { data: deals = [] } = useQuery({
    queryKey: ["deals", "by-customer", customerId],
    queryFn: () => getDealsByCustomerId(customerId),
  });
  const { data: vehicles = [] } = useQuery({ queryKey: ["vehicles"], queryFn: () => getVehicles() });

  const purchases = deals.filter((d) => d.status === "converted_to_contract");
  const negotiations = deals.filter((d) => negotiationStatuses.includes(d.status));

  const recommendations = useMemo(
    () =>
      [...vehicles]
        .filter((v) => v.status === "available")
        .sort((a, b) => getProfitMarginPct(b) - getProfitMarginPct(a))
        .slice(0, 3),
    [vehicles]
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Car className="size-4" /> {t("customers.interestedVehicles")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {leads.length === 0 ? (
            <EmptyState icon={Car} title={t("common.noResults")} />
          ) : (
            leads.map((lead) => (
              <Link
                key={lead.id}
                href={`/leads/${lead.id}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <span className="truncate text-foreground">{lead.interestedVehicleLabel ?? "—"}</span>
                <StatusBadge label={t(`leads.stages.${lead.stage}`)} tone={leadStageTone(lead.stage)} />
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShoppingBag className="size-4" /> {t("customers.previousPurchases")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {purchases.length === 0 ? (
            <EmptyState icon={ShoppingBag} title={t("common.noResults")} />
          ) : (
            purchases.map((deal) => (
              <div key={deal.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                <div className="flex flex-col overflow-hidden">
                  <span className="truncate text-foreground">{deal.vehicleLabel}</span>
                  <span className="text-xs text-muted-foreground">{new Date(deal.updatedAt).toLocaleDateString(locale)}</span>
                </div>
                <span className="shrink-0 font-mono text-foreground">{formatMoney(deal.total)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Handshake className="size-4" /> {t("customers.currentNegotiations")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {negotiations.length === 0 ? (
            <EmptyState icon={Handshake} title={t("common.noResults")} />
          ) : (
            negotiations.map((deal) => (
              <Link
                key={deal.id}
                href={`/deals/${deal.id}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="flex flex-col overflow-hidden">
                  <span className="truncate text-foreground">{deal.vehicleLabel}</span>
                  <span className="text-xs text-muted-foreground">{deal.reference}</span>
                </div>
                <span className="shrink-0 font-mono text-foreground">{formatMoney(deal.total)}</span>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="size-4" /> {t("customers.aiRecommendations")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {recommendations.map((v) => (
            <Link
              key={v.id}
              href={`/inventory/${v.id}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <span className="truncate text-foreground">
                {v.year} {v.make} {v.model}
              </span>
              <span className="shrink-0 font-mono font-medium text-primary">{formatMoney(v.price)}</span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
