/** Numbers and identifiers derived from the demo data, shared by the seed and by its check. */
import { USD_TO_AED, type VehicleRow } from "./data";

/** Money is stored to 2 decimals; work in cents so 0.1 + 0.2 style errors cannot creep in. */
const round2 = (n: number) => Math.round(n * 100) / 100;

/** What the dealership paid, in AED (USD purchases converted at the fixed peg, to the cent). */
export function purchaseAed(v: VehicleRow): number {
  if (v.buy !== undefined) return v.buy;
  if (v.buyUsd !== undefined) return round2(v.buyUsd * USD_TO_AED);
  throw new Error(`vehicle ${v.key} has no purchase price`);
}

/** Purchase + repair + transport: what the database snapshots as cost of sale. */
export const costOf = (v: VehicleRow) => round2(purchaseAed(v) + v.repair + v.transport);

const nearest = (n: number, step: number) => Math.round(n / step) * step;
export const marketValueOf = (v: VehicleRow) => v.mkt ?? nearest(v.list * 1.02, 1000);
export const expectedPriceOf = (v: VehicleRow) => nearest(v.list * 0.975, 500);
export const salePriceOf = (v: VehicleRow, factor: number) => nearest(v.list * factor, 500);
export const budgetOf = (v: VehicleRow, factor: number) => nearest(v.list * factor, 1000);
/** UAE VAT is 5% of the vehicle price. */
export const vatOf = (price: number) => round2(price * 0.05);

export const aed = (n: number) => `AED ${Math.round(n).toLocaleString("en-US")}`;
export const vehicleName = (v: VehicleRow) => `${v.year} ${v.make} ${v.model} ${v.trim}`;

// ─────────────────────────── VIN ───────────────────────────
// 17 characters, correct ISO 3779 check digit, so format validators accept them. Every one carries the
// visible marker "D3M0X" in the descriptor section and a serial starting with "D", so none is a real car.

const WMI: Record<string, string> = {
  Toyota: "JTM",
  Nissan: "JN8",
  "Mercedes-Benz": "W1N",
  Lexus: "JTJ",
  BMW: "WBA",
  Porsche: "WP1",
  "Range Rover": "SAL",
  "Land Rover": "SAL",
  Ford: "1FT",
  Chevrolet: "1GN",
  Audi: "WA1",
  Kia: "5XY",
  Hyundai: "KM8",
  Tesla: "5YJ",
  Mitsubishi: "JA4",
  GMC: "1GK",
  Bentley: "SJA",
  Honda: "5FN",
  Jeep: "1C4",
  Dodge: "2C3",
  Cadillac: "1GY",
  Lamborghini: "ZPB",
};
const YEAR_CODE: Record<number, string> = { 2021: "M", 2022: "N", 2023: "P", 2024: "R", 2025: "S", 2026: "T" };
const TRANSLITERATION: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
  J: 1,
  K: 2,
  L: 3,
  M: 4,
  N: 5,
  P: 7,
  R: 9,
  S: 2,
  T: 3,
  U: 4,
  V: 5,
  W: 6,
  X: 7,
  Y: 8,
  Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export function checkDigit(vin17WithPlaceholder: string): string {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const c = vin17WithPlaceholder[i];
    const value = /\d/.test(c) ? Number(c) : TRANSLITERATION[c];
    if (value === undefined) throw new Error(`invalid VIN character ${c}`);
    sum += value * WEIGHTS[i];
  }
  const r = sum % 11;
  return r === 10 ? "X" : String(r);
}

export function vinFor(index: number, v: VehicleRow): string {
  const wmi = WMI[v.make];
  const year = YEAR_CODE[v.year];
  if (!wmi || !year) throw new Error(`no VIN prefix or year code for ${v.make} ${v.year}`);
  const serial = `D${String(index + 1).padStart(5, "0")}`;
  const withPlaceholder = `${wmi}D3M0X0${year}X${serial}`;
  return `${wmi}D3M0X${checkDigit(withPlaceholder)}${year}X${serial}`;
}
