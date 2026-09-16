import { StatusBadge } from "@/components/shared/status-badge";
import { vehicleStatusTone } from "./vehicle-status";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { VehicleStatus } from "@/types/vehicle";

export function VehicleStatusBadge({ status }: { status: VehicleStatus }) {
  const { t } = useTranslation();
  return <StatusBadge label={t(`inventory.statuses.${status}`)} tone={vehicleStatusTone(status)} />;
}
