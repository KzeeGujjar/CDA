import { z } from "zod";
import type { AuthContext } from "@/server/auth/context";
import { withTenant, type TenantDb } from "@/server/db/tenant";
import { AppError } from "@/server/lib/errors";
import {
  convertAmount,
  CurrencyError,
  rateText,
  parseRate,
  type ConversionResult,
  type CurrencyInfo,
  type RateRow,
} from "@/lib/money/convert";
import {
  emirates,
  vehicleImportSpecNames,
  vehicleImportSpecs,
  vehicleSourceTypeNames,
  vehicleSourceTypes,
} from "@/lib/uae/reference";

/**
 * Reference data every signed-in user may read: the UAE lists (emirates, vehicle specification and source),
 * the enabled currencies with their current exchange rates, and a conversion between two of them. None of
 * this is tenant data, so it needs no permission beyond being signed in. Currencies and rates are read from
 * the database (global read-only tables), so adding one later is a data change, not a code change.
 */

export interface CurrencyDto {
  code: string;
  name: string;
  symbol: string;
  minorUnits: number;
}

export interface ExchangeRateDto {
  base: string;
  quote: string;
  /** 1 unit of base = rate units of quote. */
  rate: string;
  source: string;
  effectiveFrom: string;
}

async function enabledCurrencies(db: TenantDb): Promise<CurrencyDto[]> {
  const rows = await db.currency.findMany({ where: { isEnabled: true }, orderBy: { code: "asc" } });
  return rows.map((c) => ({ code: c.code, name: c.name, symbol: c.symbol, minorUnits: c.minorUnits }));
}

async function allRates(db: TenantDb): Promise<RateRow[]> {
  const rows = await db.exchangeRate.findMany({ orderBy: { effectiveFrom: "asc" } });
  return rows.map((r) => ({
    base: r.baseCurrency,
    quote: r.quoteCurrency,
    rate: r.rate.toFixed(10),
    effectiveFrom: r.effectiveFrom,
    source: r.source,
  }));
}

/** The rate now in force for every stored pair (newest row per pair, either direction). */
function currentRates(rows: readonly RateRow[], at: Date): ExchangeRateDto[] {
  const newest = new Map<string, RateRow>();
  for (const row of rows) {
    if (row.effectiveFrom.getTime() > at.getTime()) continue;
    const key = [row.base, row.quote].sort().join(">");
    const held = newest.get(key);
    if (!held || row.effectiveFrom.getTime() > held.effectiveFrom.getTime()) newest.set(key, row);
  }
  return [...newest.values()]
    .map((r) => ({
      base: r.base,
      quote: r.quote,
      rate: rateText(parseRate(r.rate)),
      source: r.source ?? "",
      effectiveFrom: r.effectiveFrom.toISOString(),
    }))
    .sort((a, b) => `${a.base}${a.quote}`.localeCompare(`${b.base}${b.quote}`));
}

export async function listCurrencies(ctx: AuthContext) {
  return withTenant(ctx, async (db) => {
    const [org, currencies, rates] = await Promise.all([
      db.organization.findFirstOrThrow({ select: { currency: true } }),
      enabledCurrencies(db),
      allRates(db),
    ]);
    return { baseCurrency: org.currency, currencies, rates: currentRates(rates, new Date()) };
  });
}

/** Static UAE lists plus the enabled currencies: everything a form needs to render its dropdowns. */
export async function getUaeReference(ctx: AuthContext) {
  const { org, currencies } = await withTenant(ctx, async (db) => ({
    org: await db.organization.findFirstOrThrow({ select: { currency: true, country: true, timezone: true } }),
    currencies: await enabledCurrencies(db),
  }));
  return {
    country: "AE",
    timezone: "Asia/Dubai",
    emirates: emirates.map((e) => ({ ...e })),
    vehicleImportSpecs: vehicleImportSpecs.map((code) => ({ code, name: vehicleImportSpecNames[code] })),
    vehicleSourceTypes: vehicleSourceTypes.map((code) => ({ code, name: vehicleSourceTypeNames[code] })),
    currencies,
    organization: { country: org.country, baseCurrency: org.currency, timezone: org.timezone },
  };
}

const currencyCode = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, "must be a 3-letter currency code such as AED or USD")
  .transform((c) => c.toUpperCase());

export const convertQuerySchema = z.strictObject({
  amount: z.string().trim().min(1).max(40),
  from: currencyCode,
  to: currencyCode,
  /** Rate in force at this time (default: now). */
  at: z.iso.datetime({ offset: true }).optional(),
});
export type ConvertQuery = z.infer<typeof convertQuerySchema>;

export async function convertCurrency(ctx: AuthContext, query: ConvertQuery): Promise<ConversionResult> {
  const { catalog, rates } = await withTenant(ctx, async (db) => ({
    catalog: await enabledCurrencies(db),
    rates: await allRates(db),
  }));
  const info = (code: string): CurrencyInfo => {
    const found = catalog.find((c) => c.code === code);
    if (!found) {
      throw new AppError(400, "unsupported_currency", `${code} is not a supported currency.`, {}, [
        { path: code === query.from ? "from" : "to", message: "unsupported currency" },
      ]);
    }
    return { code: found.code, minorUnits: found.minorUnits };
  };
  const from = info(query.from);
  const to = info(query.to);
  try {
    return convertAmount({ amount: query.amount, from, to, rates, at: query.at ? new Date(query.at) : new Date() });
  } catch (error) {
    if (error instanceof CurrencyError) {
      if (error.code === "no_rate") throw new AppError(422, "no_exchange_rate", error.message);
      throw new AppError(400, "validation_error", "Invalid request.", {}, [{ path: "amount", message: error.message }]);
    }
    throw error;
  }
}
