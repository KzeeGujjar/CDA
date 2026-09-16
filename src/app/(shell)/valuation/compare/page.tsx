"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { VehicleComparisonTable } from "@/components/vehicles/vehicle-comparison-table";
import { getVehicles } from "@/services/vehicles";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { GitCompare } from "lucide-react";
import type { Vehicle } from "@/types/vehicle";

export default function CompareVehiclesPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const {
    data: vehicles,
    isLoading,
    isError,
    refetch,
  } = useQuery({ queryKey: ["vehicles", "compare"], queryFn: () => getVehicles() });
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const preselectedVehicleId = searchParams.get("vehicleId");
    return preselectedVehicleId ? [preselectedVehicleId] : [];
  });

  function setSlot(index: number, id: string) {
    setSelectedIds((prev) => {
      const next = [...prev];
      next[index] = id;
      return next.filter(Boolean);
    });
  }

  const selectedVehicles = selectedIds
    .map((id) => vehicles?.find((v) => v.id === id))
    .filter((v): v is Vehicle => Boolean(v));

  return (
    <>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild aria-label={t("common.back")}>
          <Link href="/valuation">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <PageHeader title={t("valuation.compareTitle")} />
      </div>

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((slot) => (
              <Select key={slot} value={selectedIds[slot] ?? ""} onValueChange={(v) => setSlot(slot, v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("valuation.addToCompare")} />
                </SelectTrigger>
                <SelectContent>
                  {(vehicles ?? []).map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.year} {v.make} {v.model} {v.trim}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}
          </div>

          {selectedVehicles.length >= 2 ? (
            <VehicleComparisonTable vehicles={selectedVehicles} />
          ) : (
            <EmptyState icon={GitCompare} title={t("valuation.addToCompare")} description={t("common.noResults")} />
          )}
        </>
      )}
    </>
  );
}
