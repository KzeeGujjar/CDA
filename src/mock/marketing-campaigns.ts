import type { MarketingCampaign } from "@/types/marketing";
import { vehiclesFixture } from "./vehicles";

function vehicle(id: string) {
  const v = vehiclesFixture.find((x) => x.id === id)!;
  return { vehicleId: v.id, vehicleLabel: `${v.year} ${v.make} ${v.model} ${v.trim}` };
}

export const marketingCampaignsFixture: MarketingCampaign[] = [
  {
    id: "camp-001",
    name: "G63 AMG — Social Push",
    ...vehicle("veh-003"),
    channels: ["instagram", "facebook", "whatsapp"],
    status: "published",
    createdAt: "2026-09-08",
  },
  {
    id: "camp-002",
    name: "Land Cruiser GXR — Listing Refresh",
    ...vehicle("veh-001"),
    channels: ["listing", "seo", "email"],
    status: "scheduled",
    createdAt: "2026-09-11",
  },
];
