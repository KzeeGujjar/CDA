import type { MarketplaceListing } from "@/types/marketplace";
import type { VehicleInput } from "@/types/vehicle";

export function listingToVehicleInput(listing: MarketplaceListing): VehicleInput {
  const estimatedCost = Math.round(listing.price.amount * 0.88);

  return {
    stockNumber: `STK-DBZ-${listing.id.slice(-4).toUpperCase()}`,
    make: listing.make,
    model: listing.model,
    trim: listing.trim,
    year: listing.year,
    condition: listing.condition,
    status: "under_inspection",
    price: listing.price,
    costPrice: { amount: estimatedCost, currency: listing.price.currency },
    repairCost: { amount: 0, currency: listing.price.currency },
    transportCost: { amount: 0, currency: listing.price.currency },
    expectedSellingPrice: listing.price,
    estimatedMarketValue: listing.price,
    spec: {
      engine: "Not specified",
      horsepower: 0,
      fuelType: "petrol",
      transmission: "automatic",
      mileageKm: listing.mileageKm,
      exteriorColor: "Not specified",
      interiorColor: "Not specified",
      seats: 5,
      bodyType: "Not specified",
      vin: `IMPORTED-${listing.id.toUpperCase()}`,
      importSpec: "GCC",
      accidentHistory: "none",
      serviceHistory: "none",
      owners: 1,
    },
    images: listing.images,
    location: listing.location,
    emirate: "dubai",
    sourceType: "dealer",
    registration: { status: "not_registered" },
    notes: `Imported from Dubizzle listing ${listing.id}. Verify VIN, specification, and pricing before publishing.`,
  };
}
