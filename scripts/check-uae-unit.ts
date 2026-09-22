/**
 * Offline check (no database, no server) of the UAE / currency building blocks:
 *   - exact currency conversion (@/lib/money/convert): AED <-> USD, rounding, as-of dates, inverse rates, a
 *     pivot for currencies with no direct rate, 0-decimal currencies, hostile amounts and rates;
 *   - the UAE reference lists (@/lib/uae/reference) against what the frontend already uses, so a drift between
 *     the two fails here (the database enums are compared in check:uae-http).
 *
 *   npm run check:uae
 */
import { readFileSync } from "node:fs";
import {
  convertAmount,
  CurrencyError,
  formatAmount,
  parseAmount,
  parseRate,
  rateText,
  resolveRate,
  type CurrencyInfo,
  type RateRow,
} from "@/lib/money/convert";
import {
  emirateCodes,
  emirates,
  vehicleImportSpecNames,
  vehicleImportSpecs,
  vehicleSourceTypeNames,
  vehicleSourceTypes,
} from "@/lib/uae/reference";
import { emirates as frontendEmirates } from "@/lib/emirates";
import { vehicleSourceTypes as frontendSourceTypes } from "@/lib/vehicle-source-meta";
import { exchangeRatesFromAed, primaryCurrency, supportedCurrencies } from "@/lib/currency";

let passed = 0;
const failures: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ` - ${detail}` : ""}`);
};
const show = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? `${x}n` : x));
const same = (name: string, a: unknown, b: unknown) =>
  ok(name, show(a) === show(b), `got ${show(a)}, expected ${show(b)}`);
const throwsCode = (name: string, code: string, fn: () => unknown) => {
  try {
    fn();
    ok(name, false, "did not throw");
  } catch (e) {
    ok(name, e instanceof CurrencyError && e.code === code, `threw ${(e as Error).message}`);
  }
};

const AED: CurrencyInfo = { code: "AED", minorUnits: 2 };
const USD: CurrencyInfo = { code: "USD", minorUnits: 2 };
const SAR: CurrencyInfo = { code: "SAR", minorUnits: 2 };
const JPY: CurrencyInfo = { code: "JPY", minorUnits: 0 };
const EUR: CurrencyInfo = { code: "EUR", minorUnits: 2 };
const row = (base: string, quote: string, rate: string, from: string): RateRow => ({
  base,
  quote,
  rate,
  effectiveFrom: new Date(from),
  source: "test",
});
const NOW = new Date("2026-09-21T12:00:00Z");
const PEG = row("USD", "AED", "3.6725", "1997-11-01T00:00:00Z");
const conv = (amount: unknown, from: CurrencyInfo, to: CurrencyInfo, rates: RateRow[], at = NOW) =>
  convertAmount({ amount, from, to, rates, at });

// ── AED <-> USD (the peg) ────────────────────────────────────────────────────────────────────────
same("245,000 AED = 66,712.05 USD", conv("245000", AED, USD, [PEG]).to, { amount: "66712.05", currency: "USD" });
same("66,712.05 USD = 245,000.00 AED", conv("66712.05", USD, AED, [PEG]).to, { amount: "245000.00", currency: "AED" });
same("1 USD = 3.67 AED at the peg, exactly 3.6725 -> 3.67", conv(1, USD, AED, [PEG]).to.amount, "3.67");
same("1000 USD = 3,672.50 AED", conv("1000", USD, AED, [PEG]).to.amount, "3672.50");
same("0 stays 0.00", conv("0", AED, USD, [PEG]).to.amount, "0.00");
same("the rate shown for USD->AED is the stored peg", conv(1, USD, AED, [PEG]).rate, "3.6725");
same("the inverse rate is 1/3.6725 to 10 decimals", conv(1, AED, USD, [PEG]).rate, "0.2722940776");
same(
  "a direct pair has one step and no pivot",
  [conv(1, USD, AED, [PEG]).steps.length, conv(1, USD, AED, [PEG]).via],
  [1, undefined]
);
ok("the inverse step is marked inverted", conv(1, AED, USD, [PEG]).steps[0].inverted === true);
ok("the direct step is not", conv(1, USD, AED, [PEG]).steps[0].inverted === false);
same("0.01 USD = 0.04 AED (0.036725 rounds up)", conv("0.01", USD, AED, [PEG]).to.amount, "0.04");
same(
  "a number input works like its text",
  conv(245000.5, AED, USD, [PEG]).to.amount,
  conv("245000.50", AED, USD, [PEG]).to.amount
);
same("the same currency is unchanged with rate 1 and no steps", conv("12.30", AED, AED, [PEG]), {
  from: { amount: "12.30", currency: "AED" },
  to: { amount: "12.30", currency: "AED" },
  rate: "1",
  steps: [],
});
// a pair round trip drifts at most by rounding (a fils or two), never by a rate difference
const there = conv("500000", AED, USD, [PEG]).to.amount;
const back = conv(there, USD, AED, [PEG]).to.amount;
ok(
  "round trip AED -> USD -> AED stays within 1 fils per 100,000",
  Math.abs(Number(back) - 500000) < 0.02,
  `${there} -> ${back}`
);
ok(
  "the largest accepted amount converts without overflow",
  conv("1000000000000", USD, AED, [PEG]).to.amount === "3672500000000.00"
);

// ── rounding is half away from zero, once ────────────────────────────────────────────────────────
const half = [row("USD", "XTS", "0.5", "2000-01-01T00:00:00Z")];
const XTS: CurrencyInfo = { code: "XTS", minorUnits: 2 };
same("0.01 x 0.5 = 0.005 rounds up to 0.01", conv("0.01", USD, XTS, half).to.amount, "0.01");
same("0.03 x 0.5 = 0.015 rounds up to 0.02", conv("0.03", USD, XTS, half).to.amount, "0.02");
same("0.02 x 0.5 = 0.01 exactly", conv("0.02", USD, XTS, half).to.amount, "0.01");

// ── other currencies later: no code change, just rows ────────────────────────────────────────────
const withSar = [PEG, row("USD", "SAR", "3.75", "2000-01-01T00:00:00Z")];
const viaUsd = conv("1000", SAR, AED, withSar);
same("SAR -> AED goes through USD when there is no direct rate", viaUsd.via, "USD");
same("1000 SAR = 979.33 AED (one rounding, not two)", viaUsd.to.amount, "979.33");
ok(
  "two steps are reported",
  viaUsd.steps.length === 2 && viaUsd.steps[0].from === "SAR" && viaUsd.steps[1].to === "AED"
);
same("and the reverse: 979.33 AED -> SAR", conv("979.33", AED, SAR, withSar).to.amount, "1000.00");
same(
  "a direct SAR/AED rate beats the pivot",
  conv("1000", SAR, AED, [...withSar, row("SAR", "AED", "0.98", "2001-01-01T00:00:00Z")]).to.amount,
  "980.00"
);
throwsCode("no rate between AED and EUR", "no_rate", () => conv("10", AED, EUR, withSar));
throwsCode("no rate when only one leg exists", "no_rate", () => conv("10", SAR, EUR, withSar));
ok("resolveRate returns null instead of guessing", resolveRate(withSar, "AED", "EUR", NOW) === null);
throwsCode("no rate at all", "no_rate", () => conv("10", AED, USD, []));

// currencies with no decimals
const withJpy = [PEG, row("USD", "JPY", "149.5", "2020-01-01T00:00:00Z")];
same("12.34 USD = 1,845 JPY", conv("12.34", USD, JPY, withJpy).to.amount, "1845");
same("10,000 JPY = 66.89 USD at 149.5", conv("10000", JPY, USD, withJpy).to.amount, "66.89");
throwsCode("JPY amounts have no decimals", "invalid_amount", () => conv("10000.5", JPY, USD, withJpy));

// ── the rate in force at a date ──────────────────────────────────────────────────────────────────
const history = [PEG, row("USD", "AED", "3.7", "2030-01-01T00:00:00Z")];
same(
  "before the change the old rate applies",
  conv(100, USD, AED, history, new Date("2029-12-31T23:59:59Z")).to.amount,
  "367.25"
);
same(
  "from the change on the new rate applies",
  conv(100, USD, AED, history, new Date("2030-01-01T00:00:00Z")).to.amount,
  "370.00"
);
throwsCode("before any rate existed", "no_rate", () => conv(1, USD, AED, history, new Date("1990-01-01T00:00:00Z")));
const mixed = [PEG, row("AED", "USD", "0.27", "2030-01-01T00:00:00Z")];
const later = conv("100", AED, USD, mixed, new Date("2031-01-01T00:00:00Z"));
same(
  "a newer rate stored the other way round wins (and is used directly)",
  [later.to.amount, later.steps[0].inverted],
  ["27.00", false]
);
same(
  "...and the older one still answers for earlier dates",
  conv("100", AED, USD, mixed, new Date("2029-01-01T00:00:00Z")).to.amount,
  "27.23"
);

// ── hostile amounts and rates ────────────────────────────────────────────────────────────────────
for (const bad of [
  "-5",
  "1e3",
  "12.345",
  "",
  " ",
  "abc",
  "1,000",
  "0x10",
  "1_000",
  ".5",
  "5.",
  "١٢٣",
  NaN,
  Infinity,
  1e21,
  null,
  undefined,
  {},
  [],
  true,
  "1000000000001",
]) {
  throwsCode(`amount ${JSON.stringify(String(bad))} is refused`, "invalid_amount", () =>
    parseAmount(bad as unknown, 2)
  );
}
same(
  "parseAmount accepts 12, 12.5, 12.50 and trims",
  [parseAmount("12", 2), parseAmount("12.5", 2), parseAmount(" 12.50 ", 2)],
  [1200n, 1250n, 1250n]
);
for (const bad of ["0", "0.0", "-1", "1e5", "abc", "", "1.12345678901", "12345678901", "1,5"]) {
  throwsCode(`rate ${JSON.stringify(bad)} is refused`, "invalid_rate", () => parseRate(bad));
}
same("parseRate is exact", parseRate("3.6725"), { num: 36_725_000_000n, den: 10_000_000_000n });
same(
  "formatAmount pads and signs",
  [formatAmount(5n, 2), formatAmount(-5n, 2), formatAmount(12345n, 2), formatAmount(7n, 0)],
  ["0.05", "-0.05", "123.45", "7"]
);
same(
  "rateText trims zeros",
  [rateText({ num: 10_000_000_000n, den: 10_000_000_000n }), rateText(parseRate("100.5000000000"))],
  ["1", "100.5"]
);

// ── UAE lists ────────────────────────────────────────────────────────────────────────────────────
same("seven emirates, in the standard order", emirateCodes, [
  "dubai",
  "abu_dhabi",
  "sharjah",
  "ajman",
  "ras_al_khaimah",
  "fujairah",
  "umm_al_quwain",
]);
same(
  "every emirate has an English and an Arabic name",
  emirates.map((e) => e.code),
  [...emirateCodes]
);
ok(
  "names are filled in",
  emirates.every((e) => e.name.length > 2 && /[؀-ۿ]/.test(e.nameAr))
);
same(
  "the requested vehicle types are all there (GCC, UAE, Imported | Auction, Dealer, Private, Export)",
  [
    ["gcc", "uae", "imported"].every((c) => (vehicleImportSpecs as readonly string[]).includes(c)),
    ["auction", "dealer", "private", "export"].every((c) => (vehicleSourceTypes as readonly string[]).includes(c)),
  ],
  [true, true]
);
ok(
  "every classification has a display name",
  vehicleImportSpecs.every((c) => vehicleImportSpecNames[c]) &&
    vehicleSourceTypes.every((c) => vehicleSourceTypeNames[c])
);

// ── the frontend must agree with the shared lists ────────────────────────────────────────────────
same("frontend emirate list equals the shared one", [...frontendEmirates], [...emirateCodes]);
same(
  "frontend vehicle source list equals the shared one",
  [...frontendSourceTypes].sort(),
  [...vehicleSourceTypes].sort()
);
const types = readFileSync("src/types/vehicle.ts", "utf8");
const union = (name: string) => {
  const m = types.match(new RegExp(`export type ${name} =([^;]+);`, "s"));
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
};
same(
  "frontend ImportSpec union equals the shared specs",
  union("ImportSpec")
    .map((s) => s.toLowerCase())
    .sort(),
  [...vehicleImportSpecs].sort()
);
same("frontend Emirate union equals the shared emirates", union("Emirate"), [...emirateCodes]);
same(
  "frontend VehicleSourceType union equals the shared sources",
  union("VehicleSourceType").sort(),
  [...vehicleSourceTypes].sort()
);
const commonTypes = readFileSync("src/types/common.ts", "utf8");
same(
  "frontend Currency union is AED | USD (the two enabled at launch)",
  (commonTypes.match(/export type Currency =([^;]+);/)?.[1].match(/"(\w+)"/g) ?? []).map((s) => s.replaceAll('"', "")),
  ["AED", "USD"]
);
same(
  "frontend currency list is AED and USD, base AED",
  [supportedCurrencies, primaryCurrency],
  [["AED", "USD"], "AED"]
);
ok(
  "frontend's AED->USD factor equals the peg used by the backend",
  Math.abs(exchangeRatesFromAed.USD - 1 / 3.6725) < 1e-12 && exchangeRatesFromAed.AED === 1
);

if (failures.length) {
  console.error(`\nUAE unit check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
console.log(`UAE unit check OK: ${passed} assertions passed.`);
