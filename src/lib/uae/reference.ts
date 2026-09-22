/**
 * UAE reference data: the seven emirates and the vehicle classifications the market uses.
 *
 * Plain data with no dependencies, so the server, the AI agent and the browser share one list. The codes are
 * the same strings the database enums store (`emirate`, `vehicle_import_spec`, `vehicle_source_type`) and the
 * frontend unions use; `npm run check:uae` fails if any of them drifts apart.
 */

export const emirateCodes = [
  "dubai",
  "abu_dhabi",
  "sharjah",
  "ajman",
  "ras_al_khaimah",
  "fujairah",
  "umm_al_quwain",
] as const;
export type EmirateCode = (typeof emirateCodes)[number];

export const emirates: ReadonlyArray<{ code: EmirateCode; name: string; nameAr: string }> = [
  { code: "dubai", name: "Dubai", nameAr: "دبي" },
  { code: "abu_dhabi", name: "Abu Dhabi", nameAr: "أبوظبي" },
  { code: "sharjah", name: "Sharjah", nameAr: "الشارقة" },
  { code: "ajman", name: "Ajman", nameAr: "عجمان" },
  { code: "ras_al_khaimah", name: "Ras Al Khaimah", nameAr: "رأس الخيمة" },
  { code: "fujairah", name: "Fujairah", nameAr: "الفجيرة" },
  { code: "umm_al_quwain", name: "Umm Al Quwain", nameAr: "أم القيوين" },
];

/** The specification a car was built for: GCC (Gulf) spec, UAE spec, or any other (imported) specification. */
export const vehicleImportSpecs = ["gcc", "uae", "imported"] as const;
export type VehicleImportSpecCode = (typeof vehicleImportSpecs)[number];

/** Where the car came from (`export`: it is being sold for export). */
export const vehicleSourceTypes = ["auction", "dealer", "private", "export", "import"] as const;
export type VehicleSourceTypeCode = (typeof vehicleSourceTypes)[number];

/** Human-readable English names for the classifications (the UI translates them with its own dictionaries). */
export const vehicleImportSpecNames: Record<VehicleImportSpecCode, string> = {
  gcc: "GCC",
  uae: "UAE",
  imported: "Imported",
};
export const vehicleSourceTypeNames: Record<VehicleSourceTypeCode, string> = {
  auction: "Auction",
  dealer: "Dealer",
  private: "Private",
  export: "Export",
  import: "Import",
};
