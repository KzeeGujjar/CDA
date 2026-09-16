import { StatusBadge } from "@/components/shared/status-badge";
import { dealStatusTone } from "@/lib/deal-status";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { DealStatus } from "@/types/deal";

export function DealStatusBadge({ status }: { status: DealStatus }) {
  const { t } = useTranslation();
  return <StatusBadge label={t(`deals.statuses.${status}`)} tone={dealStatusTone(status)} />;
}
