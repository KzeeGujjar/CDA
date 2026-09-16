import type { StatusTone } from "@/components/shared/status-badge";
import type { VehicleStatus } from "@/types/vehicle";

export function vehicleStatusTone(status: VehicleStatus): StatusTone {
  switch (status) {
    case "available":
      return "success";
    case "reserved":
      return "warning";
    case "sold":
      return "neutral";
    case "purchased":
      return "info";
    case "in_transit":
      return "info";
    case "under_inspection":
      return "warning";
    case "under_repair":
      return "danger";
    case "archived":
      return "neutral";
  }
}

export const vehicleStatusOrder: VehicleStatus[] = [
  "available",
  "reserved",
  "sold",
  "purchased",
  "in_transit",
  "under_inspection",
  "under_repair",
  "archived",
];
