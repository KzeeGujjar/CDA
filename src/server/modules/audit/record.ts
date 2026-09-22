import type { AuthContext } from "@/server/auth/context";
import type { TenantDb } from "@/server/db/tenant";

interface AuditEntry {
  action: string;
  entityType?: string;
  entityId?: string;
  outcome?: "SUCCESS" | "DENIED" | "FAILURE";
  /** Redacted before/after. Never put secrets, tokens or full personal documents here. */
  metadata?: Record<string, string | number | boolean | null>;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Appends to the audit log inside the caller's tenant transaction, so the record commits or rolls
 * back together with the change it describes. The organization comes from the context.
 */
export async function recordAudit(db: TenantDb, ctx: AuthContext, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      actorName: ctx.userName,
      actorRole: ctx.roleKey,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      outcome: entry.outcome ?? "SUCCESS",
      metadata: entry.metadata ?? {},
      requestId: entry.requestId,
      ipAddress: entry.ipAddress && /^[0-9a-fA-F:.]+$/.test(entry.ipAddress) ? entry.ipAddress : undefined,
      userAgent: entry.userAgent,
    },
  });
}
