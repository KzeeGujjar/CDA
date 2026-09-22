import type { Emirate, ImportSpec, VehicleSourceType } from "@/types/vehicle";

/**
 * Translated labels for the vehicle fields that are not always recorded (see types/vehicle.ts): a record created
 * through this app's own forms always has them, but one created another way (the AI agent, a future bulk import,
 * or an older row) may not. "—" beats a blank cell or a crash.
 */
type T = (key: string) => string;

export const emirateLabel = (t: T, emirate: Emirate | undefined): string =>
  emirate ? t(`inventory.emirates.${emirate}`) : "—";

export const importSpecLabel = (t: T, importSpec: ImportSpec | undefined): string =>
  importSpec ? t(`inventory.importSpecs.${importSpec}`) : "—";

export const sourceTypeLabel = (t: T, sourceType: VehicleSourceType | undefined): string =>
  sourceType ? t(`inventory.sourceTypes.${sourceType}`) : "—";
