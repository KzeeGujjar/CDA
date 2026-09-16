"use client";

import { use } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, FileCheck2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { DealStatusBadge } from "@/components/deals/deal-status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { formatMoney } from "@/components/shared/currency";
import { getDealById, updateDealStatus } from "@/services/deals";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { DealStatus } from "@/types/deal";

export default function DealDetailPage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = use(params);
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();

  const {
    data: deal,
    isLoading,
    isError,
    refetch,
  } = useQuery({ queryKey: ["deal", dealId], queryFn: () => getDealById(dealId) });

  const statusMutation = useMutation({
    mutationFn: (status: DealStatus) => updateDealStatus(dealId, status),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["deal", dealId] });
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      toast.success(`Deal ${updated.reference} → ${t(`deals.statuses.${updated.status}`)}`);
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (isError) return <ErrorState onRetry={() => refetch()} />;

  if (!deal) return <EmptyState icon={FileCheck2} title={t("common.noResults")} />;

  const nextAction: Partial<Record<DealStatus, { label: string; status: DealStatus }>> = {
    draft: { label: t("deals.statuses.sent"), status: "sent" },
    sent: { label: t("deals.statuses.accepted"), status: "accepted" },
    accepted: { label: t("deals.convertToContract"), status: "converted_to_contract" },
  };
  const action = nextAction[deal.status];

  return (
    <>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild aria-label={t("common.back")}>
          <Link href="/deals">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <PageHeader
          title={deal.reference}
          actions={
            action && (
              <Button size="sm" onClick={() => statusMutation.mutate(action.status)} disabled={statusMutation.isPending}>
                {action.label}
              </Button>
            )
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">{t("deals.customer")}</span>
                <span className="text-sm font-medium text-foreground">{deal.customerName}</span>
              </div>
              <DealStatusBadge status={deal.status} />
            </div>
            <Separator />
            {deal.lineItems.map((li) => (
              <div key={li.id} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{li.label}</span>
                <span className="font-mono text-foreground">{formatMoney(li.amount)}</span>
              </div>
            ))}
            <Separator />
            <div className="flex flex-col gap-1.5 text-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>{t("deals.subtotal")}</span>
                <span className="font-mono">{formatMoney(deal.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>{t("deals.vat")}</span>
                <span className="font-mono">{formatMoney(deal.vatAmount)}</span>
              </div>
              <div className="flex items-center justify-between text-base font-semibold text-foreground">
                <span>{t("deals.total")}</span>
                <span className="font-mono">{formatMoney(deal.total)}</span>
              </div>
            </div>
            {deal.notes && (
              <>
                <Separator />
                <p className="text-sm text-muted-foreground">{deal.notes}</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("deals.vehicle")}</span>
              <span className="font-medium text-foreground">{deal.vehicleLabel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Created</span>
              <span className="font-medium text-foreground">{new Date(deal.createdAt).toLocaleDateString(locale)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Updated</span>
              <span className="font-medium text-foreground">{new Date(deal.updatedAt).toLocaleDateString(locale)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
