import { z } from "zod";
import { getPlatformDb } from "@/server/db/clients";
import { AppError, weakPassword } from "@/server/lib/errors";
import { emirateCodes } from "@/lib/uae/reference";
import { defer } from "@/server/lib/defer";
import { sendEmail } from "@/server/email/transport";
import { accountAlreadyExistsMessage, verifyEmailMessage } from "@/server/email/templates";
import type { RequestMeta } from "@/server/http/api-route";
import { provisionOrganizationRoles } from "@/server/modules/rbac/apply-role-template";
import { assertAcceptablePassword, hashPassword } from "../password";
import { enforce, LIMITS } from "../rate-limit";
import { EMAIL_VERIFICATION_TTL_MS, issueAuthToken } from "../tokens";
import { auditAuth, emailSchema, nameSchema, passwordInputSchema, rateLimitIp } from "./common";

/**
 * Self-service sign-up creates a NEW organization owned by the registrant. It never joins an existing
 * one (staff join by invitation), and it accepts no organization id from the client.
 */
export const registerSchema = z
  .strictObject({
    organizationName: z.string().trim().min(2).max(120),
    organizationType: z.enum(["dealership", "trader", "sales_team"]).default("dealership"),
    name: nameSchema,
    email: emailSchema,
    password: passwordInputSchema,
    country: z
      .string()
      .trim()
      .length(2)
      .transform((c) => c.toUpperCase())
      .optional(),
    emirate: z.enum(emirateCodes).optional(),
    /** Base currency of the dealership (default AED). Must be an enabled currency in the catalog. */
    currency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/)
      .transform((c) => c.toUpperCase())
      .optional(),
  })
  .refine((v) => !v.emirate || (v.country ?? "AE") === "AE", {
    path: ["emirate"],
    message: "An emirate can only be set for a UAE (AE) dealership.",
  });
export type RegisterInput = z.infer<typeof registerSchema>;

/** Identical for new and existing addresses, so the response cannot be used to discover accounts. */
export const REGISTER_RESPONSE = {
  message: "If the details are valid, we have sent a confirmation email to the address provided.",
};

export async function register(input: RegisterInput, meta: RequestMeta): Promise<typeof REGISTER_RESPONSE> {
  const db = getPlatformDb();
  await enforce(db, [LIMITS.registerIp(rateLimitIp(meta)), LIMITS.registerEmail(input.email)]);

  // Independent of the email, so this cannot be used to discover accounts.
  if (input.currency && !(await db.currency.findFirst({ where: { code: input.currency, isEnabled: true } }))) {
    throw new AppError(400, "unsupported_currency", `${input.currency} is not a supported currency.`, {}, [
      { path: "currency", message: "unsupported currency" },
    ]);
  }

  const problems = await assertAcceptablePassword(input.password, { email: input.email, name: input.name });
  if (problems.length) throw weakPassword(problems);

  // Hash before looking the email up, so new and existing addresses cost the same time.
  const passwordHash = await hashPassword(input.password);

  const existing = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) {
    defer(() => sendEmail(accountAlreadyExistsMessage(input.email)));
    return REGISTER_RESPONSE;
  }

  try {
    const created = await db.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: input.organizationName,
          type: input.organizationType.toUpperCase() as "DEALERSHIP" | "TRADER" | "SALES_TEAM",
          email: input.email,
          country: input.country ?? "AE",
          currency: input.currency ?? "AED",
          emirate: input.emirate ? (input.emirate.toUpperCase() as "DUBAI") : undefined,
        },
      });
      const roles = await provisionOrganizationRoles(tx, organization.id);
      const user = await tx.user.create({
        data: {
          organizationId: organization.id,
          roleId: roles.dealerOwner,
          name: input.name,
          email: input.email,
          passwordHash,
          passwordChangedAt: new Date(),
          status: "PENDING_VERIFICATION",
        },
      });
      const branch = await tx.branch.create({
        data: { organizationId: organization.id, name: "Main Branch", isPrimary: true, emirate: organization.emirate },
      });
      await tx.userBranch.create({
        data: { userId: user.id, branchId: branch.id, organizationId: organization.id, isPrimary: true },
      });
      return { organizationId: organization.id, userId: user.id };
    });

    await auditAuth(db, {
      organizationId: created.organizationId,
      userId: created.userId,
      userName: input.name,
      action: "organization.registered",
      entityType: "organization",
      entityId: created.organizationId,
      meta,
    });
    await auditAuth(db, {
      organizationId: created.organizationId,
      userId: created.userId,
      userName: input.name,
      action: "user.created",
      entityType: "user",
      entityId: created.userId,
      metadata: { role: "dealerOwner", via: "registration" },
      meta,
    });

    const token = await issueAuthToken(db, {
      organizationId: created.organizationId,
      userId: created.userId,
      purpose: "EMAIL_VERIFICATION",
      ttlMs: EMAIL_VERIFICATION_TTL_MS,
    });
    defer(() => sendEmail(verifyEmailMessage(input.email, input.name, token)));
  } catch (error) {
    // Lost a race with a concurrent registration of the same address: behave exactly as "already exists".
    if ((error as { code?: string } | null)?.code === "P2002") {
      defer(() => sendEmail(accountAlreadyExistsMessage(input.email)));
      return REGISTER_RESPONSE;
    }
    throw error;
  }

  return REGISTER_RESPONSE;
}
