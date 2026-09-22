import { z } from "zod";
import { can } from "@/server/auth/authorize";
import type { AuthContext } from "@/server/auth/context";
import type { AiToolDefinition } from "../providers/types";
import type { AgentTool } from "./types";
import {
  calculateProfitTool,
  createTaskTool,
  requestBankFinancingEvaluation,
  requestCompanyQuotationTool,
} from "./tools/actions";
import { getCustomer, searchCustomers, searchLeads } from "./tools/people";
import { getInventory, getValuation, getVehicle, searchVehicles } from "./tools/vehicles";

/**
 * Every tool the agent has. There is no generic "run a query" or "call an API" tool, and none takes SQL: each
 * tool is a fixed, reviewed function with a strict argument schema, run with the signed-in user's permissions.
 */
export const ALL_TOOLS: readonly AgentTool[] = [
  searchVehicles,
  getVehicle,
  getInventory,
  searchCustomers,
  getCustomer,
  searchLeads,
  calculateProfitTool,
  getValuation,
  requestBankFinancingEvaluation,
  requestCompanyQuotationTool,
  createTaskTool,
];

export const findTool = (name: string): AgentTool | undefined => ALL_TOOLS.find((t) => t.name === name);

/** Tools this user may use: every permission the tool requires must be held. */
export function toolsFor(ctx: AuthContext): AgentTool[] {
  return ALL_TOOLS.filter((t) => t.requires.every(([resource, action]) => can(ctx, resource, action)));
}

/** True when the user holds every permission the tool requires (re-checked at execution time). */
export const mayUse = (ctx: AuthContext, tool: AgentTool): boolean =>
  tool.requires.every(([resource, action]) => can(ctx, resource, action));

const KEEP = new Set(["type", "properties", "required", "description", "enum", "items", "minimum", "maximum"]);

/**
 * A plain, portable JSON Schema for the providers: only the keywords all three understand. Constraints that
 * are dropped here (patterns, lengths, formats) are still enforced by the strict zod schema when the call
 * arrives, so a model that ignores them just gets an error result to correct itself.
 */
export function cleanSchema(node: unknown): Record<string, unknown> {
  if (!node || typeof node !== "object" || Array.isArray(node)) return {};
  let n = node as Record<string, unknown>;
  const union = (n.anyOf ?? n.oneOf) as unknown[] | undefined;
  if (Array.isArray(union) && union.length) {
    const preferred = union.find((u) => (u as { type?: string }).type === "number") ?? union[0];
    n = { ...(preferred as object), ...(typeof n.description === "string" ? { description: n.description } : {}) };
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(n)) {
    if (!KEEP.has(k)) continue;
    if (k === "properties" && v && typeof v === "object") {
      out.properties = Object.fromEntries(Object.entries(v as object).map(([pk, pv]) => [pk, cleanSchema(pv)]));
    } else if (k === "items") {
      out.items = cleanSchema(v);
    } else {
      out[k] = v;
    }
  }
  if (out.type === "object" && !out.properties) out.properties = {};
  return out;
}

export function toolDefinitions(tools: readonly AgentTool[]): AiToolDefinition[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: cleanSchema(z.toJSONSchema(t.schema, { unrepresentable: "any" })),
  }));
}
