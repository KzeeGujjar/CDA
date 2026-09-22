import {
  divCeil,
  divRound,
  fromBasisPoints,
  fromMinor,
  type InputIssue,
  ProfitInputError,
  toBasisPoints,
  toDays,
  toMinor,
} from "./money";

/**
 * Vehicle profit calculator. Pure and dependency-free: it does no I/O, reads no clock and holds no state,
 * so the same function serves the API, the database-backed vehicle view and (later) the browser form,
 * and gives the same answer everywhere. All arithmetic is exact (bigint minor units, see money.ts).
 *
 * DEFINITIONS (also documented in docs/BACKEND_ARCHITECTURE.md)
 *   revenue           the selling price excluding VAT. If the price you enter already includes VAT
 *                     (vat.included), VAT is stripped: revenue = price / (1 + rate).
 *   totalCost         what the vehicle cost to acquire and prepare: purchase price + import duty + transport +
 *                     inspection + repair + registration + other. (The dashboard's cost_of_sale is the
 *                     purchase + repair + transport + other subset of this.)
 *   grossProfit       revenue - totalCost
 *   sellingExpenses   costs of selling it: commission (a % of revenue and/or a fixed amount), marketing,
 *                     warranty, other, and the cost of holding it (finance charge on totalCost + daily overhead)
 *   netProfit         grossProfit - sellingExpenses
 *   profitPercent     netProfit / revenue          (net margin; the headline "Profit %")
 *   grossMarginPercent grossProfit / revenue
 *   markupPercent     netProfit / totalCost
 *   roiPercent        netProfit / (totalCost + sellingExpenses): return on all the money put in
 *   breakEvenPrice    the LOWEST price, in the same terms as the price you entered (VAT-inclusive if you entered it
 *                     that way), at which netProfit >= 0. Commission % scales with the price, so this solves
 *                     price = (totalCost + fixed selling expenses) / (1 - commission%). null when commission is
 *                     100% (no price can cover it).
 *
 * Percent results are null when their denominator is 0 (no revenue, no cost), never 0 and never NaN.
 * Rounding: every money figure is rounded half away from zero to 2 decimals at the step where it arises.
 */

/** A money value: a number or a decimal string, non-negative, at most 2 decimal places. */
export type Amount = number | string;

export interface ProfitCostsInput {
  purchasePrice: Amount;
  importDuty?: Amount;
  transport?: Amount;
  inspection?: Amount;
  repair?: Amount;
  registration?: Amount;
  other?: Amount;
}

export interface SellingExpensesInput {
  /** Commission as a percentage of revenue (0-100, 2 decimals). */
  commissionPercent?: Amount;
  /** Fixed commission or referral fee. */
  commission?: Amount;
  marketing?: Amount;
  warranty?: Amount;
  other?: Amount;
  /** The cost of the vehicle sitting unsold. */
  holding?: {
    days: number;
    /** Annual finance rate charged on totalCost, in percent. */
    annualRatePercent?: Amount;
    /** Yard, insurance and other overhead per day. */
    dailyOverhead?: Amount;
  };
}

export interface ProfitInput {
  /** The agreed or target selling price. */
  sellingPrice: Amount;
  vat?: { included: boolean; ratePercent: Amount };
  costs: ProfitCostsInput;
  sellingExpenses?: SellingExpensesInput;
}

export interface ProfitResult {
  /** Selling price excluding VAT. */
  revenue: number;
  vatAmount: number;
  /** What the customer pays: revenue + VAT. */
  priceIncludingVat: number;
  costBreakdown: {
    purchasePrice: number;
    importDuty: number;
    transport: number;
    inspection: number;
    repair: number;
    registration: number;
    other: number;
  };
  totalCost: number;
  grossProfit: number;
  sellingExpenses: {
    commission: number;
    marketing: number;
    warranty: number;
    holding: number;
    other: number;
    total: number;
  };
  netProfit: number;
  profitPercent: number | null;
  grossMarginPercent: number | null;
  markupPercent: number | null;
  roiPercent: number | null;
  /** In the same terms as the input price (VAT-inclusive when the input was). null when no price can break even. */
  breakEvenPrice: number | null;
  /** Break-even revenue excluding VAT. */
  breakEvenRevenue: number | null;
}

const COST_KEYS = [
  "purchasePrice",
  "importDuty",
  "transport",
  "inspection",
  "repair",
  "registration",
  "other",
] as const;

/** Collects every problem instead of stopping at the first, so a form can show them all. */
function collect<T>(issues: InputIssue[], fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof ProfitInputError) {
      issues.push(...error.issues);
      return fallback;
    }
    throw error;
  }
}

export function calculateProfit(input: ProfitInput): ProfitResult {
  const issues: InputIssue[] = [];
  const amount = (value: unknown, path: string, required = false): bigint => {
    if (value === undefined || value === null) {
      if (required) issues.push({ path, message: "is required." });
      return 0n;
    }
    return collect(issues, () => toMinor(value, path), 0n);
  };
  const percent = (value: unknown, path: string): bigint =>
    value === undefined || value === null ? 0n : collect(issues, () => toBasisPoints(value, path), 0n);

  // ── inputs, validated and converted to exact integers
  const price = amount(input.sellingPrice, "sellingPrice", true);
  const vatIncluded = input.vat?.included === true;
  const vatBp = input.vat ? percent(input.vat.ratePercent, "vat.ratePercent") : 0n;

  const costs = {} as Record<(typeof COST_KEYS)[number], bigint>;
  for (const key of COST_KEYS) costs[key] = amount(input.costs?.[key], `costs.${key}`, key === "purchasePrice");

  const se = input.sellingExpenses ?? {};
  const commissionBp = percent(se.commissionPercent, "sellingExpenses.commissionPercent");
  const fixedCommission = amount(se.commission, "sellingExpenses.commission");
  const marketing = amount(se.marketing, "sellingExpenses.marketing");
  const warranty = amount(se.warranty, "sellingExpenses.warranty");
  const otherSelling = amount(se.other, "sellingExpenses.other");
  const holdingDays = se.holding
    ? collect(issues, () => toDays(se.holding!.days, "sellingExpenses.holding.days"), 0n)
    : 0n;
  const financeBp = se.holding
    ? percent(se.holding.annualRatePercent, "sellingExpenses.holding.annualRatePercent")
    : 0n;
  const dailyOverhead = se.holding ? amount(se.holding.dailyOverhead, "sellingExpenses.holding.dailyOverhead") : 0n;

  if (issues.length) throw new ProfitInputError(issues);

  // ── revenue and VAT
  const revenue = vatIncluded ? divRound(price * 10_000n, 10_000n + vatBp) : price;
  const vatAmount = vatIncluded ? price - revenue : divRound(revenue * vatBp, 10_000n);

  // ── cost and gross profit
  const totalCost = COST_KEYS.reduce((sum, key) => sum + costs[key], 0n);
  const grossProfit = revenue - totalCost;

  // ── selling expenses
  const percentCommission = divRound(revenue * commissionBp, 10_000n);
  const commission = percentCommission + fixedCommission;
  const financing = divRound(totalCost * financeBp * holdingDays, 10_000n * 365n);
  const holding = financing + dailyOverhead * holdingDays;
  const sellingTotal = commission + marketing + warranty + holding + otherSelling;

  // ── net profit and ratios
  const netProfit = grossProfit - sellingTotal;
  const investment = totalCost + sellingTotal;
  const pct = (numerator: bigint, denominator: bigint): number | null =>
    denominator > 0n ? fromBasisPoints(divRound(numerator * 10_000n, denominator)) : null;

  // ── break-even: the lowest revenue R with R - totalCost - fixedSelling - commission% * R >= 0
  const fixedSelling = totalCost + (sellingTotal - percentCommission);
  const denominator = 10_000n - commissionBp;
  let breakEvenRevenue: bigint | null = null;
  let breakEvenPrice: bigint | null = null;
  if (denominator > 0n) {
    breakEvenRevenue = divCeil(fixedSelling * 10_000n, denominator);
    breakEvenPrice = vatIncluded ? divCeil(breakEvenRevenue * (10_000n + vatBp), 10_000n) : breakEvenRevenue;
  }

  return {
    revenue: fromMinor(revenue),
    vatAmount: fromMinor(vatAmount),
    priceIncludingVat: fromMinor(revenue + vatAmount),
    costBreakdown: {
      purchasePrice: fromMinor(costs.purchasePrice),
      importDuty: fromMinor(costs.importDuty),
      transport: fromMinor(costs.transport),
      inspection: fromMinor(costs.inspection),
      repair: fromMinor(costs.repair),
      registration: fromMinor(costs.registration),
      other: fromMinor(costs.other),
    },
    totalCost: fromMinor(totalCost),
    grossProfit: fromMinor(grossProfit),
    sellingExpenses: {
      commission: fromMinor(commission),
      marketing: fromMinor(marketing),
      warranty: fromMinor(warranty),
      holding: fromMinor(holding),
      other: fromMinor(otherSelling),
      total: fromMinor(sellingTotal),
    },
    netProfit: fromMinor(netProfit),
    profitPercent: pct(netProfit, revenue),
    grossMarginPercent: pct(grossProfit, revenue),
    markupPercent: pct(netProfit, totalCost),
    roiPercent: pct(netProfit, investment),
    breakEvenPrice: breakEvenPrice === null ? null : fromMinor(breakEvenPrice),
    breakEvenRevenue: breakEvenRevenue === null ? null : fromMinor(breakEvenRevenue),
  };
}
