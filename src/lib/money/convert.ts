/**
 * Exact currency conversion, shared by the server and the browser (no dependencies).
 *
 * Amounts are integers in the currency's smallest unit (bigint), rates are exact fractions built from the
 * decimal text of the stored rate, and rounding happens ONCE, at the end (half away from zero). No floats:
 * 245000 AED -> USD is the same number on every machine, and A -> B -> A does not drift because the two
 * directions of a pair use the same stored rate.
 *
 * A rate row says: 1 unit of `base` = `rate` units of `quote`, from `effectiveFrom` on. Either direction can
 * be stored (the inverse is derived), and two currencies with no direct rate are joined through a pivot
 * currency (USD) when both have a rate against it.
 */
import { divRound } from "@/lib/profit/money";

export interface CurrencyInfo {
  code: string;
  /** Decimal places of the smallest unit: 2 for AED / USD, 0 for JPY. */
  minorUnits: number;
}

export interface RateRow {
  base: string;
  quote: string;
  /** Decimal text, up to 10 decimals, greater than zero (as stored: NUMERIC(20,10)). */
  rate: string;
  effectiveFrom: Date;
  source?: string;
}

export type CurrencyErrorCode = "invalid_amount" | "invalid_rate" | "no_rate";

export class CurrencyError extends Error {
  constructor(
    public readonly code: CurrencyErrorCode,
    message: string
  ) {
    super(message);
    this.name = "CurrencyError";
  }
}

/** Multiply by num / den. */
export interface Fraction {
  num: bigint;
  den: bigint;
}

export interface RateStep {
  from: string;
  to: string;
  /** The stored rate as text, and whether it was applied inverted. */
  rate: string;
  inverted: boolean;
  source?: string;
  effectiveFrom: Date;
}

export interface ResolvedRate {
  fraction: Fraction;
  /** One step for a direct or inverse pair, two when joined through the pivot currency. */
  steps: RateStep[];
  via?: string;
}

/** Largest amount accepted, in major units (a guard against typos and overflow abuse). */
export const MAX_MAJOR_AMOUNT = 1_000_000_000_000n;
export const RATE_DECIMALS = 10;
const RATE_PATTERN = /^\d{1,10}(\.\d{1,10})?$/;
export const DEFAULT_PIVOT = "USD";

const pow10 = (n: number) => 10n ** BigInt(n);

export function parseRate(text: string): Fraction {
  const value = text.trim();
  if (!RATE_PATTERN.test(value)) throw new CurrencyError("invalid_rate", `"${text}" is not a valid exchange rate.`);
  const [whole, fraction = ""] = value.split(".");
  const num = BigInt(whole) * pow10(RATE_DECIMALS) + BigInt(fraction.padEnd(RATE_DECIMALS, "0"));
  if (num === 0n) throw new CurrencyError("invalid_rate", "An exchange rate must be greater than zero.");
  return { num, den: pow10(RATE_DECIMALS) };
}

const invert = (f: Fraction): Fraction => ({ num: f.den, den: f.num });
const multiply = (a: Fraction, b: Fraction): Fraction => ({ num: a.num * b.num, den: a.den * b.den });

/** The newest rate for the pair (either direction) that is in force at `at`, or null. */
function latest(rows: readonly RateRow[], a: string, b: string, at: Date): { row: RateRow; inverted: boolean } | null {
  let best: { row: RateRow; inverted: boolean } | null = null;
  for (const row of rows) {
    const direct = row.base === a && row.quote === b;
    const inverse = row.base === b && row.quote === a;
    if ((!direct && !inverse) || row.effectiveFrom.getTime() > at.getTime()) continue;
    if (!best || row.effectiveFrom.getTime() > best.row.effectiveFrom.getTime()) best = { row, inverted: inverse };
  }
  return best;
}

const stepOf = (from: string, to: string, hit: { row: RateRow; inverted: boolean }): RateStep => ({
  from,
  to,
  rate: hit.row.rate,
  inverted: hit.inverted,
  source: hit.row.source,
  effectiveFrom: hit.row.effectiveFrom,
});

const fractionOf = (hit: { row: RateRow; inverted: boolean }): Fraction => {
  const f = parseRate(hit.row.rate);
  return hit.inverted ? invert(f) : f;
};

/**
 * The rate to convert `from` -> `to` at time `at`: 1 for the same currency, else a direct or inverse rate,
 * else two rates joined through `pivot`. Returns null when there is none (never guesses).
 */
export function resolveRate(
  rows: readonly RateRow[],
  from: string,
  to: string,
  at: Date,
  pivot: string = DEFAULT_PIVOT
): ResolvedRate | null {
  if (from === to) return { fraction: { num: 1n, den: 1n }, steps: [] };
  const direct = latest(rows, from, to, at);
  if (direct) return { fraction: fractionOf(direct), steps: [stepOf(from, to, direct)] };
  if (from === pivot || to === pivot) return null;
  const first = latest(rows, from, pivot, at);
  const second = latest(rows, pivot, to, at);
  if (!first || !second) return null;
  return {
    fraction: multiply(fractionOf(first), fractionOf(second)),
    steps: [stepOf(from, pivot, first), stepOf(pivot, to, second)],
    via: pivot,
  };
}

/** Parses a non-negative amount with at most `minorUnits` decimals into the smallest unit. */
export function parseAmount(value: unknown, minorUnits: number, path = "amount"): bigint {
  const text =
    typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : null;
  const pattern = minorUnits === 0 ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{1,${minorUnits}})?$`);
  if (text === null || !pattern.test(text)) {
    throw new CurrencyError(
      "invalid_amount",
      `${path} must be a non-negative amount with at most ${minorUnits} decimal place${minorUnits === 1 ? "" : "s"}.`
    );
  }
  const [whole, fraction = ""] = text.split(".");
  if (BigInt(whole) > MAX_MAJOR_AMOUNT) throw new CurrencyError("invalid_amount", `${path} is too large.`);
  return BigInt(whole) * pow10(minorUnits) + (minorUnits === 0 ? 0n : BigInt(fraction.padEnd(minorUnits, "0")));
}

/** Smallest-unit integer -> plain decimal text with exactly `minorUnits` decimals ("1234.50"). */
export function formatAmount(minor: bigint, minorUnits: number): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const digits = abs.toString().padStart(minorUnits + 1, "0");
  const whole = digits.slice(0, digits.length - minorUnits);
  const fraction = digits.slice(digits.length - minorUnits);
  return `${negative ? "-" : ""}${whole}${minorUnits ? `.${fraction}` : ""}`;
}

/** Converts an amount in `from`'s smallest unit into `to`'s smallest unit, rounding once (half away from zero). */
export function convertMinor(minor: bigint, from: CurrencyInfo, to: CurrencyInfo, rate: Fraction): bigint {
  return divRound(minor * pow10(to.minorUnits) * rate.num, pow10(from.minorUnits) * rate.den);
}

/** The rate as text for 1 unit (up to 10 decimals, no trailing zeros), for display next to a converted amount. */
export function rateText(rate: Fraction): string {
  const scaled = divRound(rate.num * pow10(RATE_DECIMALS), rate.den);
  const text = formatAmount(scaled, RATE_DECIMALS);
  return text.replace(/\.?0+$/, "");
}

export interface ConversionResult {
  from: { amount: string; currency: string };
  to: { amount: string; currency: string };
  /** Units of `to` per 1 unit of `from`. */
  rate: string;
  via?: string;
  steps: RateStep[];
}

/** Convenience wrapper: validates the amount, finds the rate, converts. Throws CurrencyError. */
export function convertAmount(args: {
  amount: unknown;
  from: CurrencyInfo;
  to: CurrencyInfo;
  rates: readonly RateRow[];
  at: Date;
  pivot?: string;
}): ConversionResult {
  const { from, to } = args;
  const minor = parseAmount(args.amount, from.minorUnits);
  const resolved = resolveRate(args.rates, from.code, to.code, args.at, args.pivot);
  if (!resolved) {
    throw new CurrencyError("no_rate", `There is no exchange rate between ${from.code} and ${to.code} at this time.`);
  }
  return {
    from: { amount: formatAmount(minor, from.minorUnits), currency: from.code },
    to: { amount: formatAmount(convertMinor(minor, from, to, resolved.fraction), to.minorUnits), currency: to.code },
    rate: rateText(resolved.fraction),
    ...(resolved.via ? { via: resolved.via } : {}),
    steps: resolved.steps,
  };
}
