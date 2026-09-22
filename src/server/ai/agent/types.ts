import type { z } from "zod";
import type { AiActionType } from "@/generated/prisma/client";
import type { AuthContext } from "@/server/auth/context";
import type { PermissionAction, PermissionResource } from "@/server/auth/permission-catalog";
import type { TenantDb } from "@/server/db/tenant";

/**
 * What a tool is allowed to touch. It is a NARROW view of the tenant database: a handful of model accessors
 * and nothing else. There is deliberately no $queryRaw / $executeRaw / $transaction here, so a tool cannot run
 * SQL even by mistake (the type does not have the method, ESLint forbids the syntax in this directory, and
 * `npm run check:ai-agent` scans for it). The underlying client is the tenant client: it is confined to the
 * caller's organization by the tenant extension AND by Postgres row-level security.
 */
export type AgentDb = Pick<TenantDb, "vehicle" | "customer" | "lead" | "deal" | "organization">;

export type PermissionPair = readonly [PermissionResource, PermissionAction];

export interface AgentTool<S extends z.ZodType = z.ZodType> {
  /** The name the model calls it by. Letters, digits and underscore only. */
  name: string;
  /** Tells the model what the tool is for and its limits. Written for the model, not for people. */
  description: string;
  /** Strict schema of the arguments. Anything not in it is rejected, never passed on. */
  schema: S;
  /** EVERY listed permission must be held for the tool to be offered to the model AND to run. */
  requires: readonly PermissionPair[];
  /**
   * true = the tool changes something. The model can only PROPOSE it: a person must approve the proposal
   * before it runs, and it runs with that person's permissions at that moment.
   */
  confirm: boolean;
  /** false = the tool calls a service that opens its own transaction, so no database handle is passed in. */
  needsDb?: boolean;
  /** Records an AI activity entry when the tool succeeds. */
  activity?: AiActionType;
  /** For tools that need approval: what will happen, in plain words, shown to the person deciding. */
  describe?(args: z.infer<S>): string;
  /** A short outcome with no personal data, kept in the audit trail. */
  summarize(result: unknown): string;
  execute(ctx: AuthContext, db: AgentDb, args: z.infer<S>): Promise<unknown>;
}

/** Keeps the concrete argument type inside each tool definition while letting the registry hold them together. */
export function defineTool<S extends z.ZodType>(tool: AgentTool<S>): AgentTool {
  return tool as unknown as AgentTool;
}
