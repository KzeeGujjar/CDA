import { Prisma } from "@/generated/prisma/client";
import { TenancyViolationError } from "@/server/lib/errors";

/**
 * Application-layer tenant isolation. Row-Level Security in Postgres is the backstop; this makes the
 * same rule explicit and testable in code, and fails LOUDLY when a caller tries to cross tenants
 * instead of silently returning nothing.
 *
 * Models that carry `organization_id` -> table name. `check-db` verifies this list equals the set of
 * tables with an organization_id column and that every one has RLS enabled, so a new tenant table
 * that is forgotten here (or in RLS) fails the check.
 */
export const TENANT_MODELS = {
  Branch: "branches",
  User: "users",
  UserBranch: "user_branches",
  Role: "roles",
  RolePermission: "role_permissions",
  Session: "sessions",
  AuthToken: "auth_tokens",
  Invitation: "invitations",
  ApiKey: "api_keys",
  AuditLog: "audit_logs",
  Customer: "customers",
  Vehicle: "vehicles",
  VehicleStatusEvent: "vehicle_status_events",
  Lead: "leads",
  Deal: "deals",
  StoredFile: "files",
  AiSettings: "ai_settings",
  AiConversation: "ai_conversations",
  AiMessage: "ai_messages",
  AiUsage: "ai_usage",
  AiActivity: "ai_activity",
  Task: "tasks",
  PartnerRequest: "partner_requests",
  AiToolCall: "ai_tool_calls",
  Notification: "notifications",
  Conversation: "conversations",
  Message: "messages",
  DocumentTemplate: "document_templates",
  GeneratedDocument: "generated_documents",
} as const;

const TENANT_MODEL_NAMES = new Set<string>(Object.keys(TENANT_MODELS));

/** Global reference tables: the same rows for every organization, readable in a tenant context, never writable. */
export const GLOBAL_READ_ONLY_MODELS = new Set(["Permission", "Currency", "ExchangeRate"]);
const FIELD = "organizationId";

type Args = Record<string, unknown> | undefined;

function and(where: unknown, extra: Record<string, unknown>) {
  return where && Object.keys(where as object).length ? { AND: [where, extra] } : extra;
}

/** Unique-where can only be extended by adding the tenant column next to the unique keys. */
function pinUnique(where: unknown, organizationId: string, key: string): Record<string, unknown> {
  const w = { ...(where as Record<string, unknown>) };
  if (key in w && w[key] !== organizationId) {
    throw new TenancyViolationError(`a query supplied ${key}=${String(w[key])} inside tenant ${organizationId}`);
  }
  w[key] = organizationId;
  return w;
}

function assertNoTenantWrite(data: unknown, model: string, organizationId: string) {
  if (!data || typeof data !== "object") return;
  const d = data as Record<string, unknown>;
  if (FIELD in d && d[FIELD] !== organizationId) {
    throw new TenancyViolationError(
      `${model}: attempted to write organizationId=${String(d[FIELD])} inside tenant ${organizationId}`
    );
  }
  if ("organization" in d)
    throw new TenancyViolationError(`${model}: relation "organization" cannot be written from a tenant context`);
}

function stampCreate(data: unknown, model: string, organizationId: string) {
  assertNoTenantWrite(data, model, organizationId);
  return { ...(data as object), [FIELD]: organizationId };
}

function forbidTenantChange(data: unknown, model: string) {
  if (data && typeof data === "object" && (FIELD in (data as object) || "organization" in (data as object))) {
    throw new TenancyViolationError(`${model}: a record cannot be moved to another organization`);
  }
}

/**
 * Returns a Prisma extension that confines every query to `organizationId`:
 *  - reads/updates/deletes get `organizationId = <tenant>` ANDed into their filter (a caller-supplied
 *    organizationId can never widen it, and a conflicting one throws);
 *  - creates get `organizationId` stamped on, and a different one throws;
 *  - records can never be moved between organizations;
 *  - the global reference tables (`Permission`, `Currency`, `ExchangeRate`) are read-only;
 *  - anything unrecognised is refused (fail closed).
 */
export function tenantExtension(organizationId: string) {
  if (!organizationId) throw new TenancyViolationError("empty organizationId");

  return Prisma.defineExtension({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const a = (args ?? {}) as Exclude<Args, undefined>;
          // Args are rebuilt dynamically for every model; the compiler cannot type that generically.
          const run = (next: unknown) => query(next as never);

          if (GLOBAL_READ_ONLY_MODELS.has(model)) {
            if (
              [
                "findMany",
                "findFirst",
                "findFirstOrThrow",
                "findUnique",
                "findUniqueOrThrow",
                "count",
                "aggregate",
                "groupBy",
              ].includes(operation)
            ) {
              return run(args);
            }
            throw new TenancyViolationError(`${model} is reference data and is read-only at runtime`);
          }

          const isOrganization = model === "Organization";
          if (!isOrganization && !TENANT_MODEL_NAMES.has(model)) {
            throw new TenancyViolationError(`model ${model} is not registered as tenant-scoped or global`);
          }
          const key = isOrganization ? "id" : FIELD;

          switch (operation) {
            case "findMany":
            case "findFirst":
            case "findFirstOrThrow":
            case "count":
            case "aggregate":
            case "groupBy":
            case "updateMany":
            case "updateManyAndReturn":
            case "deleteMany": {
              if (operation.startsWith("update") && !isOrganization) forbidTenantChange(a.data, model);
              return run({ ...a, where: and(a.where, { [key]: organizationId }) });
            }
            case "findUnique":
            case "findUniqueOrThrow":
            case "delete":
              return run({ ...a, where: pinUnique(a.where, organizationId, key) });
            case "update": {
              if (!isOrganization) forbidTenantChange(a.data, model);
              return run({ ...a, where: pinUnique(a.where, organizationId, key) });
            }
            case "create": {
              if (isOrganization)
                throw new TenancyViolationError("organizations are created by the platform client only");
              return run({ ...a, data: stampCreate(a.data, model, organizationId) });
            }
            case "createMany":
            case "createManyAndReturn": {
              if (isOrganization)
                throw new TenancyViolationError("organizations are created by the platform client only");
              const rows = Array.isArray(a.data) ? a.data : [a.data];
              const stamped = rows.map((row) => stampCreate(row, model, organizationId));
              return run({ ...a, data: Array.isArray(a.data) ? stamped : stamped[0] });
            }
            case "upsert": {
              if (isOrganization)
                throw new TenancyViolationError("organizations cannot be upserted from a tenant context");
              forbidTenantChange(a.update, model);
              return run({
                ...a,
                where: pinUnique(a.where, organizationId, key),
                create: stampCreate(a.create, model, organizationId),
              });
            }
            default:
              throw new TenancyViolationError(`operation ${operation} on ${model} is not allowed in a tenant context`);
          }
        },
      },
    },
  });
}
