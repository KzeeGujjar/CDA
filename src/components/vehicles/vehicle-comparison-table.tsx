import { Currency } from "@/components/shared/currency";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { Vehicle } from "@/types/vehicle";

export function VehicleComparisonTable({ vehicles }: { vehicles: Vehicle[] }) {
  const { t } = useTranslation();

  const rows: { label: string; render: (v: Vehicle) => React.ReactNode }[] = [
    {
      label: t("inventory.price"),
      render: (v) => <Currency money={v.price} className="font-mono font-semibold text-foreground" />,
    },
    { label: t("inventory.year"), render: (v) => v.year },
    { label: t("inventory.condition"), render: (v) => v.condition.replace(/_/g, " ") },
    { label: t("inventory.mileage"), render: (v) => `${v.spec.mileageKm.toLocaleString()} km` },
    { label: "Engine", render: (v) => v.spec.engine },
    { label: "Transmission", render: (v) => v.spec.transmission },
    { label: "Fuel", render: (v) => v.spec.fuelType },
    { label: "Seats", render: (v) => v.spec.seats },
    { label: t("inventory.daysInStock"), render: (v) => `${v.daysInStock}d` },
  ];

  const lowestPrice = Math.min(...vehicles.map((v) => v.price.amount));

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="w-40 p-3 text-start text-xs font-medium text-muted-foreground"> </th>
            {vehicles.map((v) => (
              <th key={v.id} className="p-3 text-start">
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">
                    {v.year} {v.make} {v.model}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">{v.trim}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-border last:border-0">
              <td className="p-3 text-xs font-medium text-muted-foreground">{row.label}</td>
              {vehicles.map((v) => (
                <td key={v.id} className="p-3 text-foreground">
                  <span
                    className={
                      row.label === t("inventory.price") && v.price.amount === lowestPrice ? "text-primary" : undefined
                    }
                  >
                    {row.render(v)}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
