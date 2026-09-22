import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import type { RequestMeta } from "@/server/http/api-route";

/** Normalised (trimmed, lower-cased) and validated email. Emails are stored lower-case (DB CHECK). */
export const emailSchema = z.string().max(320).trim().toLowerCase().pipe(z.email().max(254));

/** Bounded so a huge body cannot be used to burn hashing time; policy rules run after validation. */
export const passwordInputSchema = z.string().min(1).max(200);

export const nameSchema = z.string().trim().min(2).max(120);

export const rateLimitIp = (meta: RequestMeta) => meta.ipAddress ?? "unknown";

export const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password.";

interface AuthAuditInput {
  organizationId: string;
  userId?: string | null;
  userName?: string | null;
  action: string;
  outcome?: "SUCCESS" | "DENIED" | "FAILURE";
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, string | number | boolean | null>;
  meta?: RequestMeta;
}

/**
 * Audit entry for events that happen before a tenant context exists (login, registration, reset).
 * Uses the platform client because there is no session yet. Never put secrets or tokens in metadata.
 */
export async function auditAuth(platformDb: PrismaClient, input: AuthAuditInput): Promise<void> {
  const ip = input.meta?.ipAddress;
  await platformDb.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.userId ?? undefined,
      actorName: input.userName ?? undefined,
      action: input.action,
      outcome: input.outcome ?? "SUCCESS",
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata ?? {},
      requestId: input.meta?.requestId,
      ipAddress: ip && /^[0-9a-fA-F:.]+$/.test(ip) ? ip : undefined,
      userAgent: input.meta?.userAgent?.slice(0, 300),
    },
  });
}

/** Human label for the Settings > Security session list, from the User-Agent (best effort). */
export function describeDevice(userAgent: string | null | undefined): string {
  if (!userAgent) return "Unknown device";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Firefox\//.test(userAgent)
          ? "Firefox"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Browser";
  const os = /Windows/.test(userAgent)
    ? "Windows"
    : /Android/.test(userAgent)
      ? "Android"
      : /iPhone|iPad|iOS/.test(userAgent)
        ? "iOS"
        : /Mac OS X|Macintosh/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "Unknown OS";
  return `${browser} on ${os}`;
}
