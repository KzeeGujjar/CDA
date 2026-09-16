import type { StatusTone } from "@/components/shared/status-badge";
import type { DocumentStatus } from "@/types/document";

export function documentStatusTone(status: DocumentStatus): StatusTone {
  switch (status) {
    case "draft":
      return "neutral";
    case "pending_signature":
      return "warning";
    case "signed":
      return "success";
    case "completed":
      return "info";
  }
}

export const documentStatusOrder: DocumentStatus[] = ["draft", "pending_signature", "signed", "completed"];
