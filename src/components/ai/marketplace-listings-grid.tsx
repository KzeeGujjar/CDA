import { MarketplaceListingCard } from "./marketplace-listing-card";
import type { MarketplaceListing } from "@/types/marketplace";

export function MarketplaceListingsGrid({ listings }: { listings: MarketplaceListing[] }) {
  if (listings.length === 0) return null;

  return (
    <div className="flex gap-3 overflow-x-auto pb-1 ps-9">
      {listings.map((listing) => (
        <MarketplaceListingCard key={listing.id} listing={listing} />
      ))}
    </div>
  );
}
