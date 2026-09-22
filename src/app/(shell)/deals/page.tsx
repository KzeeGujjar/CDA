"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { DealStatusBadge } from "@/components/deals/deal-status-badge";
import { Currency } from "@/components/shared/currency";
import { ErrorState } from "@/components/shared/error-state";
import { getDeals } from "@/services/dealService";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { Deal } from "@/types/deal";

export default function DealsPage() {
  const { t, locale } = useTranslation();
  const {
    data: deals,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({ queryKey: ["deals"], queryFn: getDeals });

  const columns: DataTableColumn<Deal>[] = [
    {
      key: "reference",
      header: "Reference",
      render: (d) => (
        <Link href={`/deals/${d.id}`} className="font-medium text-foreground hover:text-primary">
          {d.reference}
        </Link>
      ),
    },
    { key: "customer", header: t("deals.customer"), render: (d) => d.customerName },
    { key: "vehicle", header: t("deals.vehicle"), render: (d) => d.vehicleLabel },
    { key: "total", header: t("deals.total"), render: (d) => <Currency money={d.total} className="font-mono" /> },
    {
      key: "status",
      header: t("common.status"),
      render: (d) => <DealStatusBadge status={d.status} />,
    },
    { key: "updated", header: "Updated", render: (d) => new Date(d.updatedAt).toLocaleDateString(locale) },
  ];

  return (
    <>
      <PageHeader
        title={t("deals.title")}
        subtitle={t("deals.subtitle")}
        actions={
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/deals/new">
              <Plus className="size-4" />
              {t("deals.newDeal")}
            </Link>
          </Button>
        }
      />
      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <DataTable columns={columns} rows={deals ?? []} loading={isLoading} emptyTitle={t("common.noResults")} />
      )}
    </>
  );
}
