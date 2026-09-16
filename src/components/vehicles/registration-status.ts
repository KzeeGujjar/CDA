import type { StatusTone } from "@/components/shared/status-badge";
import type { RegistrationStatus } from "@/types/vehicle";

export function registrationStatusTone(status: RegistrationStatus): StatusTone {
  switch (status) {
    case "registered":
      return "success";
    case "pending_transfer":
      return "warning";
    case "not_registered":
      return "neutral";
  }
}

export const registrationStatusOrder: RegistrationStatus[] = ["registered", "pending_transfer", "not_registered"];
