/**
 * Exact money and percentage arithmetic for the profit calculator.
 *
 * Money is handled as an integer count of minor units (1/100, e.g. fils) in a bigint, never as a float,
 * so 0.1 + 0.2 is exactly 0.30 and results cannot drift. Inputs are validated strictly: an amount must be
 * a plain decimal with at most 2 decimal places (a number or a string), so nothing is silently rounded
 * on the way in. This file has no dependencies, so the browser and the server share it.
 */

export interface InputIssue {
  path: string;
  message: string;
}

export class ProfitInputError extends Error {
  constructor(public readonly issues: InputIssue[]) {
    super(`Invalid profit input: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
    this.name = "ProfitInputError";
  }
}

/** Largest amount accepted: 1,000,000,000,000.00 (in minor units). A guard against typos and overflow abuse. */
export const MAX_AMOUNT_MINOR = 100_000_000_000_000n;
/** Percentages carry 2 decimals and are held in basis points (1% = 100). */
export const MAX_PERCENT_BP = 10_000n;
export const MAX_DAYS = 3650;

const DECIMAL = /^\d+(\.\d{1,2})?$/;

function toPlainDecimal(value: unknown): string | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    // String(1e21) or String(1e-7) use exponent notation, which the pattern rejects on purpose.
    return String(value);
  }
  if (typeof value === "string") return value.trim();
  return null;
}

function fail(path: string, message: string): never {
  throw new ProfitInputError([{ path, message }]);
}

function decimalToMinor(text: string): bigint {
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

/** Parses a non-negative amount with at most 2 decimals into minor units. Throws ProfitInputError. */
export function toMinor(value: unknown, path: string): bigint {
  const text = toPlainDecimal(value);
  if (text === null || !DECIMAL.test(text)) {
    fail(path, "must be a non-negative amount with at most 2 decimal places (for example 12500 or 12500.50).");
  }
  const minor = decimalToMinor(text);
  if (minor > MAX_AMOUNT_MINOR) fail(path, "is too large.");
  return minor;
}

/** Parses a percentage between 0 and 100 with at most 2 decimals into basis points. */
export function toBasisPoints(value: unknown, path: string): bigint {
  const text = toPlainDecimal(value);
  if (text === null || !DECIMAL.test(text)) {
    fail(path, "must be a percentage between 0 and 100 with at most 2 decimal places.");
  }
  const bp = decimalToMinor(text);
  if (bp > MAX_PERCENT_BP) fail(path, "must be between 0 and 100.");
  return bp;
}

export function toDays(value: unknown, path: string): bigint {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_DAYS) {
    fail(path, `must be a whole number of days between 0 and ${MAX_DAYS}.`);
  }
  return BigInt(value);
}

/** n / d rounded half away from zero (the usual commercial rounding). d must be positive. */
export function divRound(n: bigint, d: bigint): bigint {
  if (d <= 0n) throw new RangeError("divisor must be positive");
  const half = d / 2n;
  return n >= 0n ? (n + half) / d : -((-n + half) / d);
}

/** n / d rounded up, for non-negative n. d must be positive. */
export function divCeil(n: bigint, d: bigint): bigint {
  if (d <= 0n || n < 0n) throw new RangeError("divCeil needs n >= 0 and d > 0");
  return (n + d - 1n) / d;
}

/** Minor units -> a JS number with 2 decimals. Exact for any amount within MAX_AMOUNT_MINOR. */
export function fromMinor(minor: bigint): number {
  return Number(minor) / 100;
}

/** Basis points -> percent with 2 decimals. */
export function fromBasisPoints(bp: bigint): number {
  return Number(bp) / 100;
}

/** Exact sum of two validated amounts, returned as a 2-decimal string ("15250.50"), for callers that add costs together. */
export function addAmounts(a: unknown, b: unknown, path = "amount"): string {
  const total = toMinor(a, path) + toMinor(b, path);
  if (total > MAX_AMOUNT_MINOR) fail(path, "is too large.");
  const whole = total / 100n;
  const cents = (total % 100n).toString().padStart(2, "0");
  return `${whole}.${cents}`;
}
