import { z } from "zod";
import type { AuthContext } from "@/server/auth/context";
import { can, requirePermission } from "@/server/auth/authorize";
import { withTenant } from "@/server/db/tenant";
import { badRequest } from "@/server/lib/errors";
import type { RequestMeta } from "@/server/http/api-route";
import { providerIds } from "@/server/ai/config";
import { providerStatuses } from "@/server/ai/providers/registry";
import { recordAudit } from "@/server/modules/audit/record";
import { monthStartUtc } from "./ai-runner";

// ── usage ────────────────────────────────────────────────────────────────────────────────────────

export const usageQuerySchema = z.strictObject({ days: z.coerce.number().int().min(1).max(365).default(30) });

const usd = (micros: bigint | null | undefined) =>
  micros === null || micros === undefined ? null : Number(micros) / 1_000_000;

/**
 * Tokens, calls and (only for callers who hold billing:read) cost, from the append-only usage ledger:
 * totals, per provider and model, per day in the organization time zone, and this month against the limits.
 */
export async function getUsageSummary(ctx: AuthContext, query: URLSearchParams) {
  requirePermission(ctx, "ai_activity", "read");
  const { days } = usageQuerySchema.parse(Object.fromEntries(query.entries()));
  const showCost = can(ctx, "billing", "read");
  const since = new Date(Date.now() - days * 86_400_000);
  return withTenant(ctx, async (db) => {
    const org = await db.organization.findFirstOrThrow({ select: { timezone: true } });
    const settings = await db.aiSettings.findFirst();
    const [byModel, blocked, month, daily] = await Promise.all([
      db.aiUsage.groupBy({
        by: ["provider", "model"],
        where: { createdAt: { gte: since }, status: { not: "BLOCKED" } },
        _count: { _all: true },
        _sum: { inputTokens: true, outputTokens: true, costMicros: true },
      }),
      db.aiUsage.count({ where: { createdAt: { gte: since }, status: "BLOCKED" } }),
      db.aiUsage.aggregate({
        where: { createdAt: { gte: monthStartUtc() }, status: { not: "BLOCKED" } },
        _sum: { inputTokens: true, outputTokens: true, costMicros: true },
      }),
      db.$queryRaw<
        { day: Date; requests: number; input_tokens: number; output_tokens: number; cost_micros: bigint | null }[]
      >`
        SELECT date_trunc('day', created_at AT TIME ZONE ${org.timezone})::date AS day,
               count(*)::int AS requests,
               COALESCE(sum(input_tokens), 0)::int AS input_tokens,
               COALESCE(sum(output_tokens), 0)::int AS output_tokens,
               sum(cost_micros) AS cost_micros
        FROM ai_usage
        WHERE created_at >= ${since} AND status <> 'blocked'
        GROUP BY 1 ORDER BY 1`,
    ]);
    const sum = (pick: (g: (typeof byModel)[number]) => number) => byModel.reduce((n, g) => n + pick(g), 0);
    const totalCost = byModel.reduce((n, g) => n + (g._sum.costMicros ?? 0n), 0n);
    const monthTokens = (month._sum.inputTokens ?? 0) + (month._sum.outputTokens ?? 0);
    return {
      days,
      totals: {
        requests: sum((g) => g._count._all),
        blockedRequests: blocked,
        inputTokens: sum((g) => g._sum.inputTokens ?? 0),
        outputTokens: sum((g) => g._sum.outputTokens ?? 0),
        costUsd: showCost ? usd(totalCost) : null,
      },
      byModel: byModel.map((g) => ({
        provider: g.provider.toLowerCase(),
        model: g.model,
        requests: g._count._all,
        inputTokens: g._sum.inputTokens ?? 0,
        outputTokens: g._sum.outputTokens ?? 0,
        costUsd: showCost ? usd(g._sum.costMicros ?? 0n) : null,
      })),
      daily: daily.map((d) => ({
        date: d.day.toISOString().slice(0, 10),
        requests: d.requests,
        inputTokens: d.input_tokens,
        outputTokens: d.output_tokens,
        costUsd: showCost ? usd(d.cost_micros ?? 0n) : null,
      })),
      thisMonth: {
        tokens: monthTokens,
        tokenLimit:
          settings?.monthlyTokenLimit === null || settings?.monthlyTokenLimit === undefined
            ? null
            : Number(settings.monthlyTokenLimit),
        costUsd: showCost ? usd(month._sum.costMicros ?? 0n) : null,
        costLimitUsd: showCost ? usd(settings?.monthlyCostLimitMicros) : null,
      },
    };
  });
}

// ── settings ─────────────────────────────────────────────────────────────────────────────────────

const providerEnum = z.enum(providerIds);
export const updateSettingsSchema = z
  .strictObject({
    enabled: z.boolean().optional(),
    defaultProvider: providerEnum.nullable().optional(),
    allowedProviders: z.array(providerEnum).max(3).optional(),
    monthlyTokenLimit: z.number().int().min(0).max(1_000_000_000_000).nullable().optional(),
    monthlyCostLimitUsd: z.number().min(0).max(1_000_000).nullable().optional(),
    requestsPerUserPerMinute: z.number().int().min(1).max(600).optional(),
    maxOutputTokens: z.number().int().min(16).max(8192).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

async function readSettings(ctx: AuthContext) {
  const row = await withTenant(ctx, (db) => db.aiSettings.findFirst());
  return {
    enabled: row?.enabled ?? true,
    defaultProvider: row?.defaultProvider?.toLowerCase() ?? null,
    allowedProviders: (row?.allowedProviders ?? []).map((p) => p.toLowerCase()),
    monthlyTokenLimit:
      row?.monthlyTokenLimit === null || row?.monthlyTokenLimit === undefined ? null : Number(row.monthlyTokenLimit),
    monthlyCostLimitUsd: usd(row?.monthlyCostLimitMicros),
    requestsPerUserPerMinute: row?.requestsPerUserPerMinute ?? 20,
    maxOutputTokens: row?.maxOutputTokens ?? 1024,
    /** What this server can offer (which providers have a key). Never the key itself. */
    providers: providerStatuses(),
  };
}

export async function getAiSettings(ctx: AuthContext) {
  requirePermission(ctx, "settings", "read");
  return readSettings(ctx);
}

export async function updateAiSettings(
  ctx: AuthContext,
  body: z.infer<typeof updateSettingsSchema>,
  meta?: RequestMeta
) {
  requirePermission(ctx, "settings", "update");
  const current = await readSettings(ctx);
  const allowed = body.allowedProviders ?? (current.allowedProviders as string[]);
  const defaultProvider = body.defaultProvider === undefined ? current.defaultProvider : body.defaultProvider;
  if (defaultProvider && allowed.length > 0 && !allowed.includes(defaultProvider)) {
    throw badRequest("The default provider must be one of the allowed providers.", "invalid_default_provider");
  }
  const data = {
    ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
    ...(body.defaultProvider !== undefined
      ? {
          defaultProvider: body.defaultProvider
            ? (body.defaultProvider.toUpperCase() as "ANTHROPIC" | "OPENAI" | "GOOGLE")
            : null,
        }
      : {}),
    ...(body.allowedProviders !== undefined
      ? {
          allowedProviders: [...new Set(body.allowedProviders)].map(
            (p) => p.toUpperCase() as "ANTHROPIC" | "OPENAI" | "GOOGLE"
          ),
        }
      : {}),
    ...(body.monthlyTokenLimit !== undefined
      ? { monthlyTokenLimit: body.monthlyTokenLimit === null ? null : BigInt(body.monthlyTokenLimit) }
      : {}),
    ...(body.monthlyCostLimitUsd !== undefined
      ? {
          monthlyCostLimitMicros:
            body.monthlyCostLimitUsd === null ? null : BigInt(Math.round(body.monthlyCostLimitUsd * 1_000_000)),
        }
      : {}),
    ...(body.requestsPerUserPerMinute !== undefined ? { requestsPerUserPerMinute: body.requestsPerUserPerMinute } : {}),
    ...(body.maxOutputTokens !== undefined ? { maxOutputTokens: body.maxOutputTokens } : {}),
    updatedById: ctx.userId,
  };
  await withTenant(ctx, async (db) => {
    await db.aiSettings.upsert({
      where: { organizationId: ctx.organizationId },
      create: { organizationId: ctx.organizationId, ...data },
      update: data,
    });
    await recordAudit(db, ctx, {
      action: "ai.settings.updated",
      entityType: "ai_settings",
      entityId: ctx.organizationId,
      metadata: { changed: Object.keys(body).join(",") },
      ...meta,
    });
  });
  return readSettings(ctx);
}
