import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { PriceBadge } from "@/components/shared/price-badge";
import { VehicleStatusBadge } from "@/components/vehicles/vehicle-status-badge";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { Vehicle } from "@/types/vehicle";

export function VehicleTable({
  vehicles,
  loading,
  onRowClick,
}: {
  vehicles: Vehicle[];
  loading?: boolean;
  onRowClick?: (vehicle: Vehicle) => void;
}) {
  const { t } = useTranslation();

  const columns: DataTableColumn<Vehicle>[] = [
    {
      key: "vehicle",
      header: t("inventory.make"),
      render: (v) => (
        <Link href={`/inventory/${v.id}`} className="font-medium text-foreground hover:text-primary">
          {v.year} {v.make} {v.model} <span className="text-muted-foreground">{v.trim}</span>
        </Link>
      ),
    },
    {
      key: "price",
      header: t("inventory.price"),
      render: (v) => <PriceBadge price={v.price} marketValue={v.estimatedMarketValue} />,
    },
    { key: "status", header: t("inventory.status"), render: (v) => <VehicleStatusBadge status={v.status} /> },
    { key: "days", header: t("inventory.daysInStock"), render: (v) => `${v.daysInStock}d` },
    { key: "location", header: t("inventory.location"), render: (v) => v.location },
    { key: "emirate", header: t("inventory.emirate"), render: (v) => t(`inventory.emirates.${v.emirate}`) },
  ];

  return (
    <DataTable columns={columns} rows={vehicles} loading={loading} emptyTitle={t("common.noResults")} onRowClick={onRowClick} />
  );
}
