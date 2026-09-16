import Link from "next/link";
import Image from "next/image";
import { Gauge, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PriceBadge } from "@/components/shared/price-badge";
import { VehicleStatusBadge } from "@/components/vehicles/vehicle-status-badge";
import type { Vehicle } from "@/types/vehicle";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const { t } = useTranslation();
  return (
    <Link href={`/inventory/${vehicle.id}`}>
      <Card className="overflow-hidden border-0 py-0 transition-colors hover:ring-1 hover:ring-primary/40">
        <div className="relative aspect-video w-full overflow-hidden bg-muted">
          <Image src={vehicle.images[0]} alt={`${vehicle.make} ${vehicle.model}`} fill className="object-cover" unoptimized />
          <div className="absolute top-2 start-2">
            <VehicleStatusBadge status={vehicle.status} />
          </div>
        </div>
        <CardContent className="flex flex-col gap-1.5 py-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-sm font-medium text-foreground">
                {vehicle.year} {vehicle.make} {vehicle.model}
              </span>
              <span className="truncate text-xs text-muted-foreground">{vehicle.trim}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" />
              {t(`inventory.emirates.${vehicle.emirate}`)}
            </span>
            <span className="text-muted-foreground/50">•</span>
            <span>{t(`inventory.importSpecs.${vehicle.spec.importSpec}`)}</span>
          </div>
          <div className="flex items-center justify-between pt-1">
            <PriceBadge price={vehicle.price} className="text-sm" />
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Gauge className="size-3.5" />
              {vehicle.spec.mileageKm.toLocaleString()} km
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
