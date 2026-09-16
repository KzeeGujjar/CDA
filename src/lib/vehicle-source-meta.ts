import { Building2, Gavel, PlaneLanding, PlaneTakeoff, User, type LucideIcon } from "lucide-react";
import type { VehicleSourceType } from "@/types/vehicle";

export const vehicleSourceMeta: Record<VehicleSourceType, { icon: LucideIcon; labelKey: string }> = {
  export: { icon: PlaneTakeoff, labelKey: "export" },
  import: { icon: PlaneLanding, labelKey: "import" },
  auction: { icon: Gavel, labelKey: "auction" },
  dealer: { icon: Building2, labelKey: "dealer" },
  private: { icon: User, labelKey: "private" },
};

export const vehicleSourceTypes: VehicleSourceType[] = ["export", "import", "auction", "dealer", "private"];
