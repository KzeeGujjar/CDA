"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, Plus, Table2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VehicleCard } from "@/components/vehicles/vehicle-card";
import { VehicleTable } from "@/components/vehicles/vehicle-table";
import { Pagination } from "@/components/tables/pagination";
import { FilterPanel } from "@/components/shared/filter-panel";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingState } from "@/components/shared/loading-state";
import { vehicleStatusOrder } from "@/components/vehicles/vehicle-status";
import { getVehiclesPaginated } from "@/services/vehicles";
import { emirates } from "@/lib/emirates";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { cn } from "@/utils";
import type { Emirate, VehicleSortField, VehicleStatus } from "@/types/vehicle";
import type { SortDirection } from "@/types/common";

const PAGE_SIZE = 8;

const sortOptions: { value: string; sortBy: VehicleSortField; sortDirection: SortDirection }[] = [
  { value: "recent", sortBy: "acquiredAt", sortDirection: "desc" },
  { value: "price-desc", sortBy: "price", sortDirection: "desc" },
  { value: "price-asc", sortBy: "price", sortDirection: "asc" },
  { value: "year-desc", sortBy: "year", sortDirection: "desc" },
  { value: "days-desc", sortBy: "daysInStock", sortDirection: "desc" },
];

export default function InventoryPage() {
  const { t } = useTranslation();
  const [view, setView] = useState<"grid" | "table">("grid");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<VehicleStatus | "all">("all");
  const [emirate, setEmirate] = useState<Emirate | "all">("all");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1);

  const activeSort = sortOptions.find((s) => s.value === sort) ?? sortOptions[0];

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["vehicles", "paginated", search, status, emirate, sort, page],
    queryFn: () =>
      getVehiclesPaginated({
        search: search || undefined,
        status: status === "all" ? undefined : status,
        emirate: emirate === "all" ? undefined : emirate,
        sortBy: activeSort.sortBy,
        sortDirection: activeSort.sortDirection,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  function resetToFirstPage() {
    setPage(1);
  }

  const hasActiveFilters = search !== "" || status !== "all" || emirate !== "all" || sort !== "recent";

  function clearFilters() {
    setSearch("");
    setStatus("all");
    setEmirate("all");
    setSort("recent");
    resetToFirstPage();
  }

  return (
    <>
      <PageHeader
        title={t("inventory.title")}
        subtitle={t("inventory.subtitle")}
        actions={
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/inventory/new">
              <Plus className="size-4" />
              {t("inventory.addVehicle")}
            </Link>
          </Button>
        }
      />

      <FilterPanel
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
        end={
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(view === "grid" && "bg-muted text-foreground")}
              onClick={() => setView("grid")}
              aria-label={t("inventory.gridView")}
            >
              <LayoutGrid className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(view === "table" && "bg-muted text-foreground")}
              onClick={() => setView("table")}
              aria-label={t("inventory.tableView")}
            >
              <Table2 className="size-4" />
            </Button>
          </div>
        }
      >
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            resetToFirstPage();
          }}
          placeholder={t("common.searchPlaceholder")}
          className="max-w-xs"
        />
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as VehicleStatus | "all");
            resetToFirstPage();
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder={t("inventory.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.filters")}</SelectItem>
            {vehicleStatusOrder.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`inventory.statuses.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={emirate}
          onValueChange={(v) => {
            setEmirate(v as Emirate | "all");
            resetToFirstPage();
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder={t("inventory.emirate")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("inventory.allEmirates")}</SelectItem>
            {emirates.map((e) => (
              <SelectItem key={e} value={e}>
                {t(`inventory.emirates.${e}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={sort}
          onValueChange={(v) => {
            setSort(v);
            resetToFirstPage();
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t("common.sortBy")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">{t("inventory.sort.recent")}</SelectItem>
            <SelectItem value="price-desc">{t("inventory.sort.priceDesc")}</SelectItem>
            <SelectItem value="price-asc">{t("inventory.sort.priceAsc")}</SelectItem>
            <SelectItem value="year-desc">{t("inventory.sort.yearDesc")}</SelectItem>
            <SelectItem value="days-desc">{t("inventory.sort.daysDesc")}</SelectItem>
          </SelectContent>
        </Select>
      </FilterPanel>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <LoadingState key={i} variant="block" className="h-64" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState icon={LayoutGrid} title={t("common.noResults")} />
      ) : (
        <>
          {view === "grid" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {data.items.map((v) => (
                <VehicleCard key={v.id} vehicle={v} />
              ))}
            </div>
          ) : (
            <VehicleTable vehicles={data.items} />
          )}
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
        </>
      )}
    </>
  );
}
