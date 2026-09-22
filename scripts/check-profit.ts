/**
 * Unit check for the profit calculator (src/lib/profit). No database or server needed:
 *
 *   npm run check:profit
 *
 * Part 1 worked examples computed by hand. Part 2 exact arithmetic and rounding. Part 3 strict input
 * validation. Part 4 randomized property tests of the accounting identities and the break-even guarantee.
 */
import { calculateProfit, type ProfitInput, type ProfitResult } from "@/lib/profit/calculate";
import { addAmounts, divCeil, divRound, ProfitInputError } from "@/lib/profit/money";
import { amountSchema, percentSchema, profitInputSchema } from "@/lib/profit/schema";

let passed = 0;
const failures: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ` - ${detail}` : ""}`);
};
const show = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? `${x}n` : x));
const same = (name: string, actual: unknown, expected: unknown) =>
  ok(name, show(actual) === show(expected), `got ${show(actual)}, expected ${show(expected)}`);
const minor = (n: number | null) => (n === null ? null : Math.round(n * 100));
const rejects = (input: unknown): ProfitInputError | null => {
  try {
    calculateProfit(input as ProfitInput);
    return null;
  } catch (error) {
    if (error instanceof ProfitInputError) return error;
    throw error;
  }
};

// ═══════════ 1. worked examples (every number below was computed by hand) ═══════════
// A. Simple: sells at 125,000; costs 90k + 5k + 3k + 2k = 100,000; nothing else.
const a = calculateProfit({
  sellingPrice: 125_000,
  costs: { purchasePrice: 90_000, repair: 5_000, transport: 3_000, other: 2_000 },
});
same("A: total cost", a.totalCost, 100_000);
same("A: gross profit", a.grossProfit, 25_000);
same("A: net profit equals gross when there are no selling expenses", a.netProfit, 25_000);
same("A: profit % is the margin on revenue (25,000 / 125,000)", a.profitPercent, 20);
same("A: gross margin %", a.grossMarginPercent, 20);
same("A: markup % is on cost (25,000 / 100,000)", a.markupPercent, 25);
same("A: ROI (25,000 / 100,000)", a.roiPercent, 25);
same("A: break-even price is the total cost", a.breakEvenPrice, 100_000);
same("A: no VAT unless asked", [a.vatAmount, a.priceIncludingVat, a.revenue], [0, 125_000, 125_000]);

// B. Full: VAT-inclusive price, every cost line, commission % + fixed, marketing, warranty, 45 days of holding.
const b = calculateProfit({
  sellingPrice: 131_250,
  vat: { included: true, ratePercent: 5 },
  costs: {
    purchasePrice: 100_000,
    importDuty: 2_000,
    transport: 1_500,
    inspection: 500,
    repair: 4_000,
    registration: 1_000,
    other: 1_000,
  },
  sellingExpenses: {
    commissionPercent: 1.5,
    commission: 500,
    marketing: 1_000,
    warranty: 800,
    other: 200,
    holding: { days: 45, annualRatePercent: 8, dailyOverhead: 20 },
  },
});
same(
  "B: VAT is stripped from a VAT-inclusive price (131,250 = 125,000 + 6,250)",
  [b.revenue, b.vatAmount, b.priceIncludingVat],
  [125_000, 6_250, 131_250]
);
same("B: total cost is all seven lines", b.totalCost, 110_000);
same("B: gross profit", b.grossProfit, 15_000);
same("B: commission = 1.5% of 125,000 + 500", b.sellingExpenses.commission, 2_375);
same("B: holding = 110,000 x 8% x 45/365 (1,084.93) + 20 x 45 (900)", b.sellingExpenses.holding, 1_984.93);
same("B: selling expenses total", b.sellingExpenses.total, 6_359.93);
same("B: net profit", b.netProfit, 8_640.07);
same("B: profit % (8,640.07 / 125,000)", b.profitPercent, 6.91);
same("B: gross margin %", b.grossMarginPercent, 12);
same("B: markup % (8,640.07 / 110,000)", b.markupPercent, 7.85);
same("B: ROI (8,640.07 / (110,000 + 6,359.93))", b.roiPercent, 7.43);
same("B: break-even revenue = (110,000 + 4,484.93 fixed) / (1 - 1.5%), rounded up", b.breakEvenRevenue, 116_228.36);
same("B: break-even price is quoted VAT-inclusive, like the input", b.breakEvenPrice, 122_039.78);
const bAtBreakEven = calculateProfit({ ...b0(), sellingPrice: b.breakEvenPrice! });
same("B: selling at the break-even price gives exactly 0.00 net profit", bAtBreakEven.netProfit, 0);
function b0(): ProfitInput {
  return {
    sellingPrice: 131_250,
    vat: { included: true, ratePercent: 5 },
    costs: {
      purchasePrice: 100_000,
      importDuty: 2_000,
      transport: 1_500,
      inspection: 500,
      repair: 4_000,
      registration: 1_000,
      other: 1_000,
    },
    sellingExpenses: {
      commissionPercent: 1.5,
      commission: 500,
      marketing: 1_000,
      warranty: 800,
      other: 200,
      holding: { days: 45, annualRatePercent: 8, dailyOverhead: 20 },
    },
  };
}
same(
  "B: one fils below break-even is a loss or zero, never a profit",
  calculateProfit({ ...b0(), sellingPrice: b.breakEvenPrice! - 0.02 }).netProfit <= 0,
  true
);

// C. A loss.
const c = calculateProfit({ sellingPrice: 90_000, costs: { purchasePrice: 100_000 } });
same(
  "C: loss figures",
  [c.grossProfit, c.netProfit, c.profitPercent, c.roiPercent, c.markupPercent],
  [-10_000, -10_000, -11.11, -10, -10]
);
same("C: break-even is the cost", c.breakEvenPrice, 100_000);

// D. Zero denominators are null, never 0 / NaN / Infinity.
const d = calculateProfit({ sellingPrice: 0, costs: { purchasePrice: 0 } });
same(
  "D: nothing at all: every ratio is null",
  [d.profitPercent, d.grossMarginPercent, d.markupPercent, d.roiPercent],
  [null, null, null, null]
);
same("D: ...and break-even is 0", d.breakEvenPrice, 0);
const d2 = calculateProfit({ sellingPrice: 0, costs: { purchasePrice: 5_000 } });
same(
  "D2: no revenue: margin % is null but markup and ROI are -100%",
  [d2.profitPercent, d2.markupPercent, d2.roiPercent],
  [null, -100, -100]
);
const d3 = calculateProfit({ sellingPrice: 10_000, costs: { purchasePrice: 0 } });
same(
  "D3: free vehicle: markup and ROI are null, margin is 100%",
  [d3.markupPercent, d3.roiPercent, d3.profitPercent],
  [null, null, 100]
);

// E. Commission of 100% can never break even; 99.99% can (at a very high price).
same(
  "E: 100% commission: no break-even price exists",
  calculateProfit({
    sellingPrice: 10_000,
    costs: { purchasePrice: 1_000 },
    sellingExpenses: { commissionPercent: 100 },
  }).breakEvenPrice,
  null
);
same(
  "E: 99.99% commission: break-even = cost / 0.0001",
  calculateProfit({
    sellingPrice: 10_000,
    costs: { purchasePrice: 1_000 },
    sellingExpenses: { commissionPercent: 99.99 },
  }).breakEvenPrice,
  10_000_000
);

// F. VAT added on top (price excludes VAT).
const f = calculateProfit({
  sellingPrice: 50_000,
  vat: { included: false, ratePercent: 5 },
  costs: { purchasePrice: 40_000 },
});
same(
  "F: VAT-exclusive price: revenue is the price, VAT is on top",
  [f.revenue, f.vatAmount, f.priceIncludingVat, f.grossProfit],
  [50_000, 2_500, 52_500, 10_000]
);
same("F: break-even is not VAT-adjusted when the price excludes VAT", f.breakEvenPrice, 40_000);

// G. Parity with the dashboard's definition (cost_of_sale = purchase + repair + transport + other).
const g = calculateProfit({ sellingPrice: 52_000, costs: { purchasePrice: 40_000 } });
same("G: matches the dashboard fixture sale (V6: 52,000 - 40,000 = 12,000)", g.grossProfit, 12_000);
same(
  "G: V1's cost breakdown from the dashboard fixture sums to 100,000",
  calculateProfit({
    sellingPrice: 125_000,
    costs: { purchasePrice: 90_000, repair: 5_000, transport: 3_000, other: 2_000 },
  }).totalCost,
  100_000
);

// ═══════════ 2. exact arithmetic and rounding ═══════════
same(
  "0.1 + 0.2 is exactly 0.3 (no float error)",
  calculateProfit({ sellingPrice: 1, costs: { purchasePrice: 0.1, repair: 0.2 } }).totalCost,
  0.3
);
same(
  "a long chain of 0.10 costs adds exactly",
  calculateProfit({
    sellingPrice: 100,
    costs: {
      purchasePrice: 0.1,
      repair: 0.1,
      transport: 0.1,
      inspection: 0.1,
      registration: 0.1,
      importDuty: 0.1,
      other: 0.1,
    },
  }).totalCost,
  0.7
);
same(
  "string amounts work like numbers",
  calculateProfit({ sellingPrice: "1000.50", costs: { purchasePrice: "400.25" } }).grossProfit,
  600.25
);
same(
  "10.5 and 10.50 are the same amount",
  [
    calculateProfit({ sellingPrice: 10.5, costs: { purchasePrice: 0 } }).revenue,
    calculateProfit({ sellingPrice: "10.50", costs: { purchasePrice: 0 } }).revenue,
  ],
  [10.5, 10.5]
);
same(
  "divRound rounds half away from zero (positive)",
  [divRound(5n, 2n), divRound(4n, 3n), divRound(1n, 3n), divRound(3n, 2n)],
  [3n, 1n, 0n, 2n]
);
same(
  "divRound rounds half away from zero (negative)",
  [divRound(-5n, 2n), divRound(-4n, 3n), divRound(-1n, 3n)],
  [-3n, -1n, 0n]
);
same("divCeil rounds up", [divCeil(7n, 2n), divCeil(6n, 2n), divCeil(0n, 5n), divCeil(1n, 100n)], [4n, 3n, 0n, 1n]);
const vatRound = calculateProfit({
  sellingPrice: 100,
  vat: { included: true, ratePercent: 5 },
  costs: { purchasePrice: 0 },
});
same(
  "VAT-inclusive 100.00 at 5%: revenue 95.24 + VAT 4.76 (rounded, and they add back to 100.00)",
  [vatRound.revenue, vatRound.vatAmount, vatRound.priceIncludingVat],
  [95.24, 4.76, 100]
);
same(
  "addAmounts is exact",
  [addAmounts("0.10", "0.20"), addAmounts(1000, "0.5"), addAmounts(0, 0)],
  ["0.30", "1000.50", "0.00"]
);
const big = calculateProfit({
  sellingPrice: "1000000000000.00",
  costs: { purchasePrice: "999999999999.99" },
  sellingExpenses: { holding: { days: 3650, annualRatePercent: 100, dailyOverhead: 1000 } },
});
ok(
  "the largest accepted amounts do not overflow or lose precision",
  Number.isFinite(big.netProfit) && big.totalCost === 999_999_999_999.99
);
const frozen = Object.freeze({ sellingPrice: 100, costs: Object.freeze({ purchasePrice: 50 }) });
ok("the input is never mutated (works on frozen objects)", calculateProfit(frozen as ProfitInput).netProfit === 50);
same("the calculator is deterministic", calculateProfit(b0()), calculateProfit(b0()));

// ═══════════ 3. strict input validation ═══════════
const badAmounts: [string, unknown][] = [
  ["negative", -1],
  ["NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
  ["three decimals", 1.005],
  ["exponent notation (number)", 1e21],
  ["tiny exponent", 1e-7],
  ["text", "abc"],
  ["exponent (string)", "1e3"],
  ["thousands separator", "1,000"],
  ["leading dot", ".5"],
  ["trailing dot", "5."],
  ["empty string", ""],
  ["over the maximum", "1000000000000.01"],
  ["a boolean", true],
  ["an object", {}],
];
for (const [name, value] of badAmounts) {
  ok(`rejects a ${name} price`, rejects({ sellingPrice: value, costs: { purchasePrice: 1 } }) !== null);
  ok(`rejects a ${name} cost`, rejects({ sellingPrice: 1, costs: { purchasePrice: value } }) !== null);
  ok(`the API schema rejects a ${name} amount the same way`, !amountSchema.safeParse(value).success);
}
ok(
  "a whitespace-padded string is accepted (trimmed)",
  rejects({ sellingPrice: " 500 ", costs: { purchasePrice: 1 } }) === null
);
ok("a negative zero is fine", rejects({ sellingPrice: -0, costs: { purchasePrice: 0 } }) === null);
const missing = rejects({ sellingPrice: undefined, costs: {} });
ok(
  "missing selling price and purchase price are both reported",
  !!missing &&
    missing.issues.some((i) => i.path === "sellingPrice") &&
    missing.issues.some((i) => i.path === "costs.purchasePrice")
);
const many = rejects({
  sellingPrice: -5,
  vat: { included: true, ratePercent: 101 },
  costs: { purchasePrice: "x", repair: 1.234 },
  sellingExpenses: { commissionPercent: 100.01, marketing: -1, holding: { days: 1.5, annualRatePercent: "abc" } },
});
ok(
  "every problem is reported at once, each with its field path",
  !!many && many.issues.length >= 8,
  `got ${many?.issues.length}`
);
ok(
  "...including nested paths",
  !!many &&
    ["vat.ratePercent", "costs.repair", "sellingExpenses.commissionPercent", "sellingExpenses.holding.days"].every(
      (p) => many.issues.some((i) => i.path === p)
    )
);
for (const days of [1.5, -1, 3651, "10", Number.NaN])
  ok(
    `rejects holding days = ${String(days)}`,
    rejects({ sellingPrice: 1, costs: { purchasePrice: 1 }, sellingExpenses: { holding: { days } } }) !== null
  );
for (const pct of [100.01, -1, "abc", 5.005]) {
  ok(
    `rejects a percentage of ${String(pct)}`,
    rejects({ sellingPrice: 1, costs: { purchasePrice: 1 }, sellingExpenses: { commissionPercent: pct } }) !== null
  );
  ok(`the API schema rejects a percentage of ${String(pct)}`, !percentSchema.safeParse(pct).success);
}
ok(
  "0% and 100% are valid percentages",
  rejects({ sellingPrice: 1, costs: { purchasePrice: 1 }, sellingExpenses: { commissionPercent: 0 } }) === null &&
    rejects({ sellingPrice: 1, costs: { purchasePrice: 1 }, sellingExpenses: { commissionPercent: 100 } }) === null
);
ok(
  "the API schema refuses unknown keys (a client cannot smuggle fields in)",
  !profitInputSchema.safeParse({ sellingPrice: 1, costs: { purchasePrice: 1 }, hackedTotal: 1 }).success
);
ok(
  "...including inside costs and selling expenses",
  !profitInputSchema.safeParse({ sellingPrice: 1, costs: { purchasePrice: 1, totalCost: 0 } }).success &&
    !profitInputSchema.safeParse({ sellingPrice: 1, costs: { purchasePrice: 1 }, sellingExpenses: { bonus: 1 } })
      .success
);
ok("the API schema accepts a complete valid body", profitInputSchema.safeParse(b0()).success);

// ═══════════ 4. property tests (seeded, so a failure is reproducible) ═══════════
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260919);
const money = (max: number) => Math.round(rand() * max * 100) / 100;
const maybe = <T>(p: number, v: () => T): T | undefined => (rand() < p ? v() : undefined);

let checked = 0;
let propertyFailure = "";
for (let i = 0; i < 3000 && !propertyFailure; i++) {
  const input: ProfitInput = {
    sellingPrice: money(rand() < 0.1 ? 5_000_000 : 300_000),
    vat: maybe(0.5, () => ({ included: rand() < 0.5, ratePercent: Math.round(rand() * 2000) / 100 })),
    costs: {
      purchasePrice: money(250_000),
      importDuty: maybe(0.4, () => money(20_000)),
      transport: maybe(0.6, () => money(8_000)),
      inspection: maybe(0.5, () => money(1_500)),
      repair: maybe(0.7, () => money(30_000)),
      registration: maybe(0.5, () => money(3_000)),
      other: maybe(0.3, () => money(5_000)),
    },
    sellingExpenses: maybe(0.8, () => ({
      commissionPercent: maybe(0.7, () => Math.round(rand() * 1500) / 100),
      commission: maybe(0.4, () => money(3_000)),
      marketing: maybe(0.5, () => money(4_000)),
      warranty: maybe(0.5, () => money(3_000)),
      other: maybe(0.3, () => money(2_000)),
      holding: maybe(0.6, () => ({
        days: Math.floor(rand() * 400),
        annualRatePercent: Math.round(rand() * 1500) / 100,
        dailyOverhead: maybe(0.5, () => money(80)),
      })),
    })),
  };
  const r: ProfitResult = calculateProfit(input);
  const cb = r.costBreakdown;
  const se = r.sellingExpenses;
  const fail = (what: string) => (propertyFailure = `${what}: ${JSON.stringify(input)} => ${JSON.stringify(r)}`);

  const costSum =
    minor(cb.purchasePrice)! +
    minor(cb.importDuty)! +
    minor(cb.transport)! +
    minor(cb.inspection)! +
    minor(cb.repair)! +
    minor(cb.registration)! +
    minor(cb.other)!;
  if (costSum !== minor(r.totalCost)) fail("total cost is the sum of its lines");
  if (minor(r.grossProfit) !== minor(r.revenue)! - minor(r.totalCost)!) fail("gross = revenue - cost");
  const sellSum =
    minor(se.commission)! + minor(se.marketing)! + minor(se.warranty)! + minor(se.holding)! + minor(se.other)!;
  if (sellSum !== minor(se.total)) fail("selling expenses total is the sum of its lines");
  if (minor(r.netProfit) !== minor(r.grossProfit)! - minor(se.total)!) fail("net = gross - selling expenses");
  if (minor(r.revenue)! + minor(r.vatAmount)! !== minor(r.priceIncludingVat)) fail("revenue + VAT = price incl. VAT");
  if (input.vat?.included && minor(r.priceIncludingVat) !== minor(input.sellingPrice as number))
    fail("a VAT-inclusive price is preserved exactly");
  if (!input.vat?.included && minor(r.revenue) !== minor(input.sellingPrice as number))
    fail("without VAT-inclusive pricing, revenue is the price");
  for (const v of [r.profitPercent, r.grossMarginPercent, r.markupPercent, r.roiPercent])
    if (v !== null && !Number.isFinite(v)) fail("a percentage is never NaN or Infinity");
  if (r.roiPercent !== null && Math.sign(r.roiPercent) !== Math.sign(r.netProfit) && Math.abs(r.roiPercent) >= 0.01)
    fail("ROI has the sign of net profit");
  if (
    r.profitPercent !== null &&
    Math.sign(r.profitPercent) !== Math.sign(r.netProfit) &&
    Math.abs(r.profitPercent) >= 0.01
  )
    fail("profit % has the sign of net profit");

  if (r.breakEvenPrice !== null) {
    const at = calculateProfit({ ...input, sellingPrice: r.breakEvenPrice });
    if (at.netProfit < 0) fail("at the break-even price the net profit is never negative");
    if (r.breakEvenPrice >= 0.02) {
      const below = calculateProfit({ ...input, sellingPrice: Math.round((r.breakEvenPrice - 0.02) * 100) / 100 });
      if (below.netProfit > 0) fail("just below the break-even price there is no profit");
    }
    const inputPrice = minor(input.sellingPrice as number)!;
    if (r.netProfit < 0 && inputPrice >= minor(r.breakEvenPrice)!) fail("a loss implies the price is below break-even");
    if (r.netProfit > 0 && inputPrice < minor(r.breakEvenPrice)!)
      fail("a profit implies the price is at or above break-even");
    // monotonic: a higher price never lowers net profit
    const higher = calculateProfit({
      ...input,
      sellingPrice: Math.min(1_000_000_000, (input.sellingPrice as number) + 1),
    });
    if (higher.netProfit < r.netProfit) fail("raising the price never lowers net profit");
  }
  checked++;
}
ok(
  `3000 random inputs satisfy every accounting identity and the break-even guarantee`,
  propertyFailure === "" && checked === 3000,
  propertyFailure.slice(0, 600)
);

if (failures.length) {
  console.error(`\nProfit check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
console.log(`Profit check OK: ${passed} assertions passed.`);
