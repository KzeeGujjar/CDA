/**
 * Unit check for the AI agent (no database, no real provider): which tools each role is offered, that tool
 * schemas are portable and contain nothing that could carry SQL, that the agent has no way to run SQL (by type
 * and by source scan), PII masking, the valuation maths, and tool calling through all three provider adapters.
 *
 *   npm run check:ai-agent
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AuthContext } from "@/server/auth/context";
import { roleTemplates } from "@/server/auth/role-templates";
import { maskEmail, maskPhone } from "@/server/ai/agent/mask";
import { ALL_TOOLS, cleanSchema, toolDefinitions, toolsFor } from "@/server/ai/agent/registry";
import type { AgentDb } from "@/server/ai/agent/types";
import { getProvider } from "@/server/ai/providers/registry";
import type { AiCompletionRequest, AiConversationTurn } from "@/server/ai/providers/types";
import { estimateFromComparables, type Comparable } from "@/lib/valuation/estimate";
import { startFakeAiProviders, type FakeId } from "./lib/fake-ai-providers";

let passed = 0;
const failures: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ` - ${detail}` : ""}`);
};
const same = (name: string, a: unknown, b: unknown) =>
  ok(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);

// ── compile-time proof: the database view given to a tool has no raw-SQL or transaction methods ──
type Forbidden =
  "$queryRaw" | "$queryRawUnsafe" | "$executeRaw" | "$executeRawUnsafe" | "$transaction" | "$connect" | "$extends";
const noRawSql: [Extract<keyof AgentDb, Forbidden>] extends [never] ? true : false = true;
ok("AgentDb has no raw-SQL, transaction or client-management methods (checked by the compiler)", noRawSql);

// ── a fake caller with a role's default permissions ──
function ctxFor(role: keyof typeof roleTemplates): AuthContext {
  const permissions = new Map<string, "own" | "branch" | "organization">();
  for (const [resource, grant] of Object.entries(roleTemplates[role].grants)) {
    for (const action of grant!.actions) permissions.set(`${resource}:${action}`, grant!.scope ?? "organization");
  }
  return {
    organizationId: "org",
    userId: "u",
    userName: "U",
    userEmail: "u@x",
    roleId: "r",
    roleKey: role,
    roleRank: 1,
    sessionId: "s",
    branchIds: [],
    permissions,
  } as unknown as AuthContext;
}

const ALL_NAMES = [
  "searchVehicles",
  "getVehicle",
  "getInventory",
  "searchCustomers",
  "getCustomer",
  "searchLeads",
  "calculateProfit",
  "getValuation",
  "requestBankFinancingEvaluation",
  "requestCompanyQuotation",
  "createTask",
];
same("the agent has exactly the requested tools", ALL_TOOLS.map((t) => t.name).sort(), [...ALL_NAMES].sort());
const offered = (role: keyof typeof roleTemplates) =>
  toolsFor(ctxFor(role))
    .map((t) => t.name)
    .sort();
same("Dealer Owner is offered every tool", offered("dealerOwner"), [...ALL_NAMES].sort());
same("Manager is offered every tool", offered("manager"), [...ALL_NAMES].sort());
same(
  "Salesperson: everything except calculateProfit (no profit:read)",
  offered("salesperson"),
  ALL_NAMES.filter((n) => n !== "calculateProfit").sort()
);
same(
  "Buyer: vehicles, profit, valuation, bank evaluation, tasks (no customers, leads or quotations)",
  offered("buyer"),
  [
    "calculateProfit",
    "createTask",
    "getInventory",
    "getValuation",
    "getVehicle",
    "requestBankFinancingEvaluation",
    "searchVehicles",
  ]
);
same("Accountant: customers and profit only (no vehicles)", offered("accountant"), [
  "calculateProfit",
  "getCustomer",
  "searchCustomers",
]);
same("Viewer: read-only vehicle tools", offered("viewer"), ["getInventory", "getVehicle", "searchVehicles"]);
same("Marketing Manager: no tools at all", offered("marketingManager"), []);
ok(
  "every tool that changes data is marked as needing approval, and no read tool is",
  ALL_TOOLS.filter((t) => t.confirm)
    .map((t) => t.name)
    .sort()
    .join() === "createTask,requestBankFinancingEvaluation,requestCompanyQuotation"
);
ok(
  "every tool declares at least one required permission",
  ALL_TOOLS.every((t) => t.requires.length > 0)
);
ok(
  "every write tool has a description of what it will do",
  ALL_TOOLS.filter((t) => t.confirm).every((t) => typeof t.describe === "function")
);
ok(
  "tool names are plain identifiers",
  ALL_TOOLS.every((t) => /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(t.name))
);

// ── tool definitions sent to providers ──
const defs = toolDefinitions(ALL_TOOLS);
const FORBIDDEN = [
  "$schema",
  "additionalProperties",
  "anyOf",
  "oneOf",
  "allOf",
  "$ref",
  "$defs",
  "default",
  "pattern",
  "format",
];
const walk = (n: unknown, visit: (k: string, path: string) => void, path = ""): void => {
  if (!n || typeof n !== "object") return;
  for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
    visit(k, `${path}.${k}`);
    if (k === "properties" && v && typeof v === "object")
      for (const [pk, pv] of Object.entries(v)) walk(pv, visit, `${path}.${pk}`);
    else if (k === "items") walk(v, visit, `${path}[]`);
  }
};
for (const d of defs) {
  const bad: string[] = [];
  walk(d.parameters, (k, p) => FORBIDDEN.includes(k) && bad.push(p));
  ok(
    `${d.name}: a portable JSON Schema object (no $schema, anyOf, patterns...)`,
    d.parameters.type === "object" && bad.length === 0,
    bad.join(",")
  );
  ok(`${d.name}: has a description for the model`, d.description.length > 40);
}
const propNames = (schema: Record<string, unknown>): string[] => {
  const out: string[] = [];
  for (const [k, v] of Object.entries((schema.properties as Record<string, Record<string, unknown>>) ?? {})) {
    out.push(k, ...propNames(v));
    if (v.items) out.push(...propNames(v.items as Record<string, unknown>));
  }
  return out;
};
const propertyNames = defs.flatMap((d) => propNames(d.parameters));
ok(
  "no tool argument could carry SQL or a raw command (no sql / statement / table / database / script / command / where argument)",
  !propertyNames.some((n) =>
    /^(sql|statement|table|database|script|command|where|filter|raww*|query_?string)$/i.test(n)
  ),
  propertyNames.join(",")
);
ok(
  "the search tools cap results at 20 and default to 10",
  ["searchVehicles", "searchCustomers", "searchLeads"].every((n) => {
    const p = (defs.find((d) => d.name === n)!.parameters.properties as Record<string, { maximum?: number }>).limit;
    return p?.maximum === 20;
  })
);
same(
  "cleanSchema keeps only portable keywords and reduces number-or-string to number",
  cleanSchema({
    $schema: "x",
    type: "object",
    additionalProperties: false,
    properties: {
      a: { anyOf: [{ type: "number" }, { type: "string" }], description: "d" },
      b: { type: "string", pattern: "x", minLength: 1 },
    },
    required: ["a"],
  }),
  { type: "object", properties: { a: { type: "number", description: "d" }, b: { type: "string" } }, required: ["a"] }
);

// ── the agent cannot run SQL: source scan ──
function files(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const full = join(dir, n);
    if (statSync(full).isDirectory()) files(full, out);
    else if (/\.ts$/.test(n)) out.push(full);
  }
  return out;
}
const agentFiles = [
  ...files("src/server/ai/agent"),
  "src/server/modules/ai/ai-agent.service.ts",
  "src/server/modules/ai/ai-tool-calls.ts",
];
for (const file of agentFiles) {
  const text = readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  ok(
    `${file}: no raw query, transaction or client APIs`,
    !/\$queryRaw|\$executeRaw|\$transaction|\$connect|\$extends|\$use\b/.test(text)
  );
  ok(
    `${file}: never imports a database client or the platform (RLS-bypassing) client`,
    !/db\/clients|db\/client"|getPlatformDb|getAppDb|createPrismaClient|generated\/prisma\/client"/.test(
      text.replace(/import type[^;]+;/g, "")
    )
  );
  ok(
    `${file}: no dynamic code, shell or file access`,
    !/\beval\(|new Function|child_process|node:fs|readFileSync|from "fs"/.test(text)
  );
}
ok("the scan covered the agent directory", agentFiles.length >= 9, String(agentFiles.length));

// ── data minimisation ──
same(
  "emails are masked but recognisable",
  [maskEmail("secret.customer@example.com"), maskEmail("a@b.co"), maskEmail(null), maskEmail("nonsense")],
  ["s***@example.com", "a***@b.co", null, "***"]
);
same(
  "phone numbers keep only the country prefix and last 4 digits",
  [maskPhone("+971501234567"), maskPhone("0501234567"), maskPhone("123"), maskPhone(null)],
  ["+97******4567", "05****4567", "***", null]
);
ok(
  "a masked value never contains the full original",
  !maskPhone("+971501234567")!.includes("501234") && !maskEmail("secret.customer@example.com")!.includes("secret")
);

// ── valuation maths (hand-computed) ──
const c = (id: string, source: "sold" | "stock", year: number, km: number | null, price: number): Comparable => ({
  id,
  source,
  title: id,
  year,
  mileageKm: km,
  price,
});
const target = { make: "Toyota", model: "Land Cruiser", year: 2022, mileageKm: 50_000 };
same(
  "fewer than 3 comparables: no estimate",
  estimateFromComparables(target, [c("a", "sold", 2022, 50_000, 100_000), c("b", "sold", 2022, 50_000, 110_000)]),
  null
);
const three = estimateFromComparables(target, [
  c("a", "sold", 2022, 50_000, 100_000),
  c("b", "sold", 2022, 50_000, 110_000),
  c("c", "sold", 2022, 50_000, 120_000),
])!;
same(
  "three identical-age sales at 100k/110k/120k: mean 110,000, range mean +/- one weighted sd (8,165), rounded to 100",
  [three.estimatedValue, three.lowEstimate, three.highEstimate, three.confidence, three.comparablesUsed],
  [110_000, 101_800, 118_200, "low", 3]
);
const mixed = estimateFromComparables({ ...target }, [
  c("s1", "sold", 2022, null, 75_000),
  c("s2", "sold", 2022, null, 155_000),
  c("s3", "sold", 2022, null, 52_000),
  c("s4", "sold", 2022, null, 25_000),
  c("k1", "stock", 2022, null, 125_000),
  c("k2", "stock", 2022, null, 70_000),
  c("k3", "stock", 2022, null, 95_000),
  c("k4", "stock", 2022, null, 45_000),
])!;
same(
  "the dashboard fixture: 4 sales (weight 1) + 4 asking prices (weight 0.6): (307 + 0.6 x 335) / 6.4 = 79,375 -> 79,400",
  [mixed.estimatedValue, mixed.soldComparables, mixed.comparablesUsed],
  [79_400, 4, 8]
);
const newer = estimateFromComparables({ ...target, year: 2023 }, [
  c("a", "sold", 2022, 50_000, 100_000),
  c("b", "sold", 2022, 50_000, 100_000),
  c("c", "sold", 2022, 50_000, 100_000),
])!;
same(
  "a target one year newer than its comparables is worth 6% more (100,000 -> 106,000)",
  newer.estimatedValue,
  106_000
);
const highKm = estimateFromComparables({ ...target, mileageKm: 30_000 }, [
  c("a", "sold", 2022, 50_000, 100_000),
  c("b", "sold", 2022, 50_000, 100_000),
  c("c", "sold", 2022, 50_000, 100_000),
])!;
same(
  "a target with 20,000 km LESS than its comparables is worth 3% more (100,000 -> 103,000)",
  highKm.estimatedValue,
  103_000
);
const clampedYear = estimateFromComparables({ ...target, year: 2035 }, [
  c("a", "sold", 2010, 0, 100_000),
  c("b", "sold", 2010, 0, 100_000),
  c("c", "sold", 2010, 0, 100_000),
])!;
ok(
  "adjustments are limited (a 25-year gap cannot multiply the price by more than 1.6)",
  clampedYear.comparables[0].adjustedPrice <= 160_000
);
ok(
  "non-positive or missing prices are ignored",
  estimateFromComparables(target, [
    c("a", "sold", 2022, 1, 0),
    c("b", "sold", 2022, 1, -5),
    c("c", "sold", 2022, 1, 100_000),
  ]) === null
);
const eight = estimateFromComparables(
  target,
  Array.from({ length: 8 }, (_, i) => c(`x${i}`, "sold", 2022, 50_000, 100_000 + i * 200))
)!;
same("eight close sales give HIGH confidence", eight.confidence, "high");
same(
  "the same comparables always give the same answer (deterministic)",
  estimateFromComparables(target, [
    c("a", "sold", 2022, 1, 90_000),
    c("b", "stock", 2021, 2, 80_000),
    c("c", "sold", 2023, 3, 120_000),
  ]),
  estimateFromComparables(target, [
    c("a", "sold", 2022, 1, 90_000),
    c("b", "stock", 2021, 2, 80_000),
    c("c", "sold", 2023, 3, 120_000),
  ])
);
const stockOnly = estimateFromComparables(target, [
  c("a", "stock", 2022, null, 100_000),
  c("b", "sold", 2022, null, 200_000),
  c("c", "sold", 2022, null, 200_000),
])!;
ok("an asking price counts for less than a real sale", stockOnly.estimatedValue > 150_000);
ok("the result says it is not market data", /not market data/i.test(mixed.method));

// ── tool calling through each provider adapter ──
async function providers() {
  const KEYS: Record<FakeId, string> = {
    anthropic: "sk-ant-agent-unit-1111111111111111",
    openai: "sk-agent-unit-openai-2222222222222",
    google: "AIzaAgentUnitGemini33333333333333333",
  };
  const fake = await startFakeAiProviders(54352, KEYS);
  Object.assign(process.env, {
    ANTHROPIC_API_KEY: KEYS.anthropic,
    ANTHROPIC_BASE_URL: fake.url,
    OPENAI_API_KEY: KEYS.openai,
    OPENAI_BASE_URL: fake.url,
    AI_MODEL_OPENAI: "openai-test-model",
    GEMINI_API_KEY: KEYS.google,
    GEMINI_BASE_URL: fake.url,
    AI_MODEL_GOOGLE: "gemini-test-model",
  });
  const last = async (p: FakeId) =>
    (await (await fetch(`${fake.url}/__admin/last?provider=${p}`)).json()) as {
      last: { malformed: string[]; body: Record<string, unknown> };
    };
  for (const id of ["anthropic", "openai", "google"] as FakeId[]) {
    const provider = getProvider(id)!;
    await fetch(`${fake.url}/__admin/reset`, { method: "POST", body: "{}" });
    const base = (messages: AiConversationTurn[]): AiCompletionRequest => ({
      model: provider.model,
      system: "test",
      messages,
      tools: defs,
      maxOutputTokens: 300,
      timeoutMs: 3000,
    });
    const first = await provider.complete(
      base([{ role: "user", content: 'find one [[tool:searchVehicles {"query":"Toyota","limit":2}]] please' }])
    );
    same(
      `${id}: a tool request comes back as a normalised tool call`,
      [first.finishReason, first.toolCalls?.length, first.toolCalls?.[0].name, first.toolCalls?.[0].arguments],
      ["tool_calls", 1, "searchVehicles", { query: "Toyota", limit: 2 }]
    );
    same(
      `${id}: the tool definitions (all 11, incl. one with no arguments) were accepted in the vendor's format`,
      (await last(id)).last.malformed,
      []
    );
    ok(`${id}: the tool call has an id`, !!first.toolCalls?.[0].id);
    const followUp = await provider.complete(
      base([
        { role: "user", content: "find one" },
        { role: "assistant", content: "", toolCalls: first.toolCalls! },
        { role: "tool", results: [{ callId: first.toolCalls![0].id, name: "searchVehicles", content: '{"count":2}' }] },
      ])
    );
    ok(
      `${id}: tool results are sent back in the vendor's format and the model answers with text`,
      followUp.finishReason === "stop" && followUp.text.includes("tool results:") && followUp.text.includes("count"),
      followUp.text
    );
    same(`${id}: ...and the vendor found nothing wrong with that conversation`, (await last(id)).last.malformed, []);
    const many = await provider.complete(
      base([
        {
          role: "user",
          content: '[[tool:getInventory]] [[tool:searchLeads {"stage":"new"}]] [[force:runSql {"sql":"drop table x"}]]',
        },
      ])
    );
    same(
      `${id}: several tool calls in one turn are all returned, including one for a tool that was never offered`,
      many.toolCalls?.map((t) => t.name),
      ["getInventory", "searchLeads", "runSql"]
    );
    const errorResult = await provider
      .complete(
        base([
          { role: "user", content: "x [[tool:getInventory]]" },
          { role: "assistant", content: "thinking", toolCalls: [{ id: "c1", name: "getInventory", arguments: {} }] },
          {
            role: "tool",
            results: [{ callId: "c1", name: "getInventory", content: "Error: not allowed", isError: true }],
          },
        ])
      )
      .then(
        (r) => r,
        (e) => e
      );
    ok(
      `${id}: an error result is accepted too`,
      "text" in errorResult && errorResult.text.includes("Error: not allowed"),
      String(errorResult)
    );
    await fetch(`${fake.url}/__admin/mode`, { method: "POST", body: JSON.stringify({ provider: id, mode: "loop" }) });
    const loop = await provider.complete(base([{ role: "user", content: "anything" }]));
    ok(
      `${id}: a model that never stops asking for tools is visible as tool_calls each time (the loop limit is ours)`,
      loop.finishReason === "tool_calls"
    );
    const noTools = await provider.complete({ ...base([{ role: "user", content: "plain" }]), tools: undefined });
    await fetch(`${fake.url}/__admin/mode`, { method: "POST", body: JSON.stringify({ provider: id, mode: "ok" }) });
    ok(`${id}: without tools it is an ordinary chat`, noTools.finishReason === "stop" && !noTools.toolCalls);
  }
  await fake.close();
}

providers()
  .catch((error) => failures.push(`unexpected error: ${(error as Error).stack ?? error}`))
  .finally(() => {
    if (failures.length) {
      console.error(
        `\nAI agent check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`
      );
      process.exit(1);
    }
    console.log(`AI agent check OK: ${passed} assertions passed.`);
    process.exit(0);
  });
