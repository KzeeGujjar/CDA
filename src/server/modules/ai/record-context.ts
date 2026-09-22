import type { AuthContext } from "@/server/auth/context";
import { can, requirePermission, scopeAllows } from "@/server/auth/authorize";
import type { TenantDb } from "@/server/db/tenant";
import { notFound } from "@/server/lib/errors";

/**
 * Turns a record a conversation is about into text for the model, containing ONLY what the current user is
 * allowed to see: the same permission and scope rules as the API. Contact details are never included, and
 * cost figures only for users who hold profit:read. Text values are stripped of angle brackets so a value
 * cannot close the <record> tag and pose as an instruction.
 */
export type RecordType = "vehicle" | "customer" | "lead" | "deal";

export interface RecordContext {
  label: string;
  text: string;
}

const clean = (value: unknown): string =>
  String(value ?? "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
const money = (v: { toFixed(n: number): string } | null | undefined) => (v ? v.toFixed(2) : "n/a");
const block = (type: RecordType, rows: [string, unknown][]) =>
  `<record type="${type}">\n${rows.map(([k, v]) => `${k}: ${clean(v)}`).join("\n")}\n</record>`;

export async function loadRecordContext(
  ctx: AuthContext,
  db: TenantDb,
  type: RecordType,
  id: string
): Promise<RecordContext> {
  if (type === "vehicle") {
    const scope = requirePermission(ctx, "vehicles", "read");
    const v = await db.vehicle.findFirst({ where: { id } });
    if (!v || !scopeAllows(ctx, scope, { branchField: "branchId" }, v)) throw notFound("Vehicle not found.");
    const rows: [string, unknown][] = [
      ["stock number", v.stockNumber],
      ["vehicle", `${v.year} ${v.make} ${v.model} ${v.trim ?? ""}`],
      ["condition", v.condition.toLowerCase()],
      ["mileage km", v.mileageKm ?? "n/a"],
      ["status", v.status.toLowerCase()],
      ["list price", money(v.listPrice)],
      ["expected selling price", money(v.expectedSellingPrice)],
    ];
    if (can(ctx, "profit", "read")) {
      const total = v.purchasePrice.plus(v.repairCost).plus(v.transportCost).plus(v.otherCost);
      rows.push(
        ["purchase price", money(v.purchasePrice)],
        ["repair cost", money(v.repairCost)],
        ["transport cost", money(v.transportCost)],
        ["total cost", money(total)]
      );
    }
    return { label: `${v.year} ${v.make} ${v.model}`, text: block("vehicle", rows) };
  }
  if (type === "customer") {
    const scope = requirePermission(ctx, "customers", "read");
    const c = await db.customer.findFirst({ where: { id, deletedAt: null } });
    if (!c || !scopeAllows(ctx, scope, {}, c)) throw notFound("Customer not found.");
    return { label: c.name, text: block("customer", [["name", c.name]]) };
  }
  if (type === "lead") {
    const scope = requirePermission(ctx, "leads", "read");
    const l = await db.lead.findFirst({ where: { id }, include: { customer: { select: { name: true } } } });
    if (!l || !scopeAllows(ctx, scope, { ownerField: "assignedToId", branchField: "branchId" }, l))
      throw notFound("Lead not found.");
    const name = can(ctx, "customers", "read") ? l.customer.name : "a customer";
    return {
      label: `Lead: ${name}`,
      text: block("lead", [
        ["customer", name],
        ["stage", l.stage.toLowerCase()],
        ["source", l.source.toLowerCase()],
        ["score", l.score],
        ["budget", money(l.budget)],
      ]),
    };
  }
  const scope = requirePermission(ctx, "deals", "read");
  const d = await db.deal.findFirst({
    where: { id },
    include: { vehicle: { select: { year: true, make: true, model: true } } },
  });
  if (!d || !scopeAllows(ctx, scope, { ownerField: "salespersonId", branchField: "branchId" }, d))
    throw notFound("Deal not found.");
  return {
    label: `Deal ${d.reference}`,
    text: block("deal", [
      ["reference", d.reference],
      ["status", d.status.toLowerCase()],
      ["vehicle", `${d.vehicle.year} ${d.vehicle.make} ${d.vehicle.model}`],
      ["sale price excluding VAT", money(d.salePrice)],
    ]),
  };
}
