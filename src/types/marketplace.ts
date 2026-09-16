import type { ID, Money } from "./common";

export type MarketplaceSource = "dubizzle" | "yallamotor";

export interface MarketplaceListing {
  id: ID;
  source: MarketplaceSource;
  make: string;
  model: string;
  trim: string;
  year: number;
  price: Money;
  mileageKm: number;
  location: string;
  condition: "new" | "used";
  images: string[];
  postedAt: string;
}

export interface MarketplaceConnection {
  source: MarketplaceSource;
  connected: boolean;
  accountUrl: string | null;
  connectedAt: string | null;
}
