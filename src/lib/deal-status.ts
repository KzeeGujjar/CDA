import type { StatusTone } from "@/components/shared/status-badge";
import type { DealStatus } from "@/types/deal";

export function dealStatusTone(status: DealStatus): StatusTone {
  switch (status) {
    case "draft":
      return "neutral";
    case "sent":
      return "info";
    case "accepted":
      return "success";
    case "converted_to_contract":
      return "success";
    case "declined":
      return "danger";
  }
}
