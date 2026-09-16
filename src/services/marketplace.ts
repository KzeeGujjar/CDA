import type { MarketplaceListing, MarketplaceSource } from "@/types/marketplace";
import { marketplaceListingsFixture } from "@/mock/marketplace-listings";

const wait = (ms = 900) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getMarketplaceListings(query?: string): Promise<MarketplaceListing[]> {
  await wait();
  if (!query) return marketplaceListingsFixture;

  const lower = query.toLowerCase();
  const matched = marketplaceListingsFixture.filter((listing) =>
    `${listing.make} ${listing.model}`
      .toLowerCase()
      .split(" ")
      .some((word) => word.length > 2 && lower.includes(word))
  );
  return matched.length > 0 ? matched : marketplaceListingsFixture;
}

export async function getMarketplaceListingsBySource(source: MarketplaceSource): Promise<MarketplaceListing[]> {
  await wait();
  return marketplaceListingsFixture.filter((listing) => listing.source === source);
}
