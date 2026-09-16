import type { MarketplaceSource } from "@/types/marketplace";

export const marketplaceSourceLabel: Record<MarketplaceSource, string> = {
  dubizzle: "Dubizzle",
  yallamotor: "YallaMotor",
};

export const marketplaceSourceTone: Record<MarketplaceSource, string> = {
  dubizzle: "bg-[#e8352f]/15 text-[#ff6b64]",
  yallamotor: "bg-[#0b5fff]/15 text-[#5c9bff]",
};
