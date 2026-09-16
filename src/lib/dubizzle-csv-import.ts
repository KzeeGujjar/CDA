import type { VehicleInput } from "@/types/vehicle";

const columnAliases = {
  make: ["make", "brand"],
  model: ["model"],
  trim: ["trim", "variant", "edition", "spectrim"],
  year: ["year", "modelyear"],
  price: ["price", "askingprice", "amount", "aed"],
  mileage: ["mileage", "kilometers", "kilometres", "km", "odometer"],
  location: ["location", "city", "emirate", "area"],
  images: ["images", "photos", "photourls", "imageurls", "pictures", "picture"],
  condition: ["condition"],
  vin: ["vin", "chassisnumber"],
  referenceNumber: ["referencenumber", "adid", "listingid", "refno"],
};

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pick(row: Record<string, string>, aliases: string[]): string | undefined {
  const entries = Object.keys(row).map((key) => ({ key, norm: normalizeKey(key) }));

  for (const alias of aliases) {
    const normalizedAlias = normalizeKey(alias);
    const exact = entries.find((e) => e.norm === normalizedAlias);
    if (exact && row[exact.key]) return row[exact.key];
  }
  // Fall back to a substring match so headers with units/qualifiers
  // (e.g. "Price (AED)", "Mileage (KM)") still resolve.
  for (const alias of aliases) {
    const normalizedAlias = normalizeKey(alias);
    const partial = entries.find((e) => e.norm.includes(normalizedAlias));
    if (partial && row[partial.key]) return row[partial.key];
  }
  return undefined;
}

export interface CsvImportRow {
  raw: Record<string, string>;
  make?: string;
  model?: string;
  trim?: string;
  year?: number;
  price?: number;
  mileageKm?: number;
  location?: string;
  images: string[];
  referenceNumber?: string;
  valid: boolean;
  errors: string[];
}

export function parseDubizzleRow(raw: Record<string, string>): CsvImportRow {
  const make = pick(raw, columnAliases.make);
  const model = pick(raw, columnAliases.model);
  const trim = pick(raw, columnAliases.trim);
  const yearStr = pick(raw, columnAliases.year);
  const priceStr = pick(raw, columnAliases.price);
  const mileageStr = pick(raw, columnAliases.mileage);
  const location = pick(raw, columnAliases.location);
  const imagesStr = pick(raw, columnAliases.images);
  const referenceNumber = pick(raw, columnAliases.referenceNumber);

  const year = yearStr ? parseInt(yearStr, 10) : undefined;
  const price = priceStr ? parseFloat(priceStr.replace(/[^0-9.]/g, "")) : undefined;
  const mileageKm = mileageStr ? parseFloat(mileageStr.replace(/[^0-9.]/g, "")) : undefined;
  const images = imagesStr
    ? imagesStr
        .split(/[|;]/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const errors: string[] = [];
  if (!make) errors.push("Missing make");
  if (!model) errors.push("Missing model");
  if (!year || Number.isNaN(year)) errors.push("Missing or invalid year");
  if (!price || Number.isNaN(price)) errors.push("Missing or invalid price");

  return {
    raw,
    make,
    model,
    trim,
    year,
    price,
    mileageKm,
    location,
    images: images.length > 0 ? images : ["https://picsum.photos/seed/csv-import/640/420"],
    referenceNumber,
    valid: errors.length === 0,
    errors,
  };
}

export function csvRowToVehicleInput(row: CsvImportRow, index: number): VehicleInput {
  const price = { amount: row.price!, currency: "AED" as const };
  const estimatedCost = Math.round(row.price! * 0.88);

  return {
    stockNumber: `STK-CSV-${String(index + 1).padStart(3, "0")}`,
    make: row.make!,
    model: row.model!,
    trim: row.trim ?? "—",
    year: row.year!,
    condition: "used",
    status: "under_inspection",
    price,
    costPrice: { amount: estimatedCost, currency: "AED" },
    repairCost: { amount: 0, currency: "AED" },
    transportCost: { amount: 0, currency: "AED" },
    expectedSellingPrice: price,
    estimatedMarketValue: price,
    spec: {
      engine: "Not specified",
      horsepower: 0,
      fuelType: "petrol",
      transmission: "automatic",
      mileageKm: row.mileageKm ?? 0,
      exteriorColor: "Not specified",
      interiorColor: "Not specified",
      seats: 5,
      bodyType: "Not specified",
      vin: row.referenceNumber ? `DBZ-${row.referenceNumber}` : `IMPORTED-CSV-${index + 1}`,
      importSpec: "GCC",
      accidentHistory: "none",
      serviceHistory: "none",
      owners: 1,
    },
    images: row.images,
    location: row.location ?? "Downtown Dubai Showroom",
    emirate: "dubai",
    sourceType: "dealer",
    registration: { status: "not_registered" },
    notes: "Imported from Dubizzle CSV export. Verify VIN, specification, and pricing before publishing.",
  };
}
