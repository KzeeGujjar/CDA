/**
 * Demo data seed: a fictional UAE dealership ("Desert Falcon Motors") with 36 vehicles, 20 customers, 32 leads,
 * 18 deals, 22 tasks, 19 notifications and 6 AI conversations, all in AED. See prisma/demo/data.ts for what is
 * in it and why none of it is real.
 *
 *   ALLOW_DEMO_SEED=1 DIRECT_DATABASE_URL=... npm run db:seed:demo            # first run, or "already there"
 *   ALLOW_DEMO_SEED=1 DIRECT_DATABASE_URL=... npm run db:seed:demo -- --reset # rebuild the demo records
 *
 * Run `npm run db:seed` first (it writes the permission catalog the roles are built from).
 *
 * Safe by construction:
 *  - it refuses to run unless ALLOW_DEMO_SEED=1, and never when NODE_ENV=production: demo users with a known
 *    password must not exist in a real environment;
 *  - it only ever touches the one demo organization (a fixed id); other tenants are not read or written;
 *  - it writes through the same tenant-scoped client the app uses, so every row carries that organization;
 *  - passwords are hashed with the app's Argon2id. Set DEMO_USER_PASSWORD, or one is generated and shown once.
 *    It is never stored in plain text and never written to a file;
 *  - the whole tenant part is ONE transaction: it either all lands or none does;
 *  - the second run does nothing ("already there"); --reset deletes and re-creates only the demo records
 *    (customers, vehicles, leads, deals, tasks, notifications, AI conversations), never users, roles or audit logs.
 *
 * Runs as the database owner (DIRECT_DATABASE_URL), like the base seed.
 */
import { randomBytes } from "node:crypto";
import { createPrismaClient } from "@/server/db/client";
import { runInTenant, type TenantDb } from "@/server/db/tenant";
import { hashPassword, passwordPolicyProblems } from "@/server/auth/password";
import { provisionOrganizationRoles } from "@/server/modules/rbac/apply-role-template";
import {
  branches,
  customerKey,
  customers,
  CUSTOMER_EMAIL_DOMAIN,
  DEMO_EMAIL_DOMAIN,
  DEMO_ORGANIZATION_ID,
  deals,
  leads,
  notifications,
  organization,
  tasks,
  USD_TO_AED,
  users,
  vehicleDetails,
  vehicles,
  type BranchKey,
  type CustomerKey,
  type UserKey,
  type VehicleKey,
} from "./demo/data";
import { buildConversations } from "./demo/conversations";
import { budgetOf, expectedPriceOf, marketValueOf, purchaseAed, salePriceOf, vatOf, vinFor } from "./demo/derive";

try {
  process.loadEnvFile(".env");
} catch {
  // real environment variables are provided by CI / the host
}

function refuse(message: string): never {
  console.error(`\nDemo seed refused: ${message}\n`);
  process.exit(1);
}

if (process.env.NODE_ENV === "production") {
  refuse("NODE_ENV is production. Demo users with a known password must not exist in a real environment.");
}
if (process.env.ALLOW_DEMO_SEED !== "1") {
  refuse("set ALLOW_DEMO_SEED=1 to confirm this database is a demo, development or staging one.");
}
const url = process.env.DIRECT_DATABASE_URL;
if (!url) refuse("set DIRECT_DATABASE_URL (the database owner connection, like the base seed).");
const reset = process.argv.slice(2).includes("--reset");

const prisma = createPrismaClient(url);
const now = new Date();
const ORG = DEMO_ORGANIZATION_ID;

// ─────────────────────────── time ───────────────────────────
// Dubai wall-clock time (UTC+4, no daylight saving): `dayOffset` days from today at `hour` o'clock.
function at(dayOffset: number, hour: number, minute = 0): Date {
  const dubai = new Date(now.getTime() + 4 * 3_600_000);
  const midnight = Date.UTC(dubai.getUTCFullYear(), dubai.getUTCMonth(), dubai.getUTCDate());
  return new Date(midnight + (dayOffset * 24 + hour - 4) * 3_600_000 + minute * 60_000);
}
/** Something that already happened is never dated in the future, whatever time of day the seed runs. */
function past(dayOffset: number, hour: number, minute = 0): Date {
  const d = at(dayOffset, hour, minute);
  return d > now ? new Date(now.getTime() - 60_000) : d;
}

// ─────────────────────────── helpers ───────────────────────────
const emailFor = (name: string, domain: string) => `${name.toLowerCase().replace(/\s+/g, ".")}@${domain}`;
/** Unassigned subscriber block (000): looks like a UAE mobile number, reaches nobody. */
const mobile = (prefix: string, block: number, n: number) =>
  `+971 ${prefix} 000 0${block}${String(n).padStart(2, "0")}`;

function lookup<K extends string>(map: Map<K, string>, key: K, what: string): string {
  const id = map.get(key);
  if (!id) throw new Error(`demo data refers to an unknown ${what}: ${key}`);
  return id;
}

function chooseDemoPassword(): { password: string; generated: boolean } {
  const fromEnv = process.env.DEMO_USER_PASSWORD;
  if (fromEnv) {
    const problems = passwordPolicyProblems(fromEnv);
    if (problems.length) refuse(`DEMO_USER_PASSWORD is not acceptable: ${problems.join(" ")}`);
    return { password: fromEnv, generated: false };
  }
  // 20 URL-safe characters; comfortably inside the password policy.
  return { password: randomBytes(15).toString("base64url"), generated: true };
}

/** The descriptive columns of a vehicle: the spec and registration documents, notes, location and featured flag. */
function detailsOf(key: VehicleKey) {
  const d = vehicleDetails[key];
  const [regStatus, plate, expiresInDays] = d.reg;
  return {
    spec: {
      engine: d.engine,
      horsepower: d.hp,
      fuelType: d.fuel,
      transmission: d.transmission,
      exteriorColor: d.exterior,
      interiorColor: d.interior,
      seats: d.seats,
      bodyType: d.body,
      accidentHistory: d.accident,
      serviceHistory: d.service,
      owners: d.owners,
    },
    registration: {
      status: regStatus,
      ...(plate ? { plateNumber: plate } : {}),
      ...(expiresInDays !== undefined ? { expiryDate: at(expiresInDays, 12).toISOString().slice(0, 10) } : {}),
    },
    notes: d.notes,
    location: d.location,
    featured: d.featured ?? false,
  };
}

// ─────────────────────────── the seed ───────────────────────────
async function wipeDemoRecords(tx: TenantDb): Promise<Record<string, number>> {
  // Children before parents. Users, roles, branches and audit logs are left alone.
  //
  // `files`: an ACTIVE row has real bytes sitting in Storage, so silently deleting it here would orphan them
  // without telling anyone — its FK is left standing to block the reset instead (a deliberately loud failure,
  // see the P2003 handler above), and the operator removes the attachment (or the bytes) first, or uses a
  // fresh database. A DELETED row (a tombstone left by the ordinary delete-a-photo/document flow, §0.8) is a
  // different story: its bytes are already gone from Storage (or will be, via `storage:maintenance`) and the
  // row exists only for the audit trail, which `--reset` is already about to clear along with everything
  // else — so tombstones are removed here, but a live, ACTIVE file still blocks the reset exactly as before.
  //
  // `conversations` has no external resource at all, so it is wiped here like everything else; it cascades to
  // its own `messages`.
  const removed: Record<string, number> = {};
  const step = async (name: string, run: () => Promise<{ count: number }>) => (removed[name] = (await run()).count);
  await step("aiToolCalls", () => tx.aiToolCall.deleteMany({}));
  await step("aiUsage", () => tx.aiUsage.deleteMany({}));
  await step("aiActivity", () => tx.aiActivity.deleteMany({}));
  await step("aiMessages", () => tx.aiMessage.deleteMany({}));
  await step("aiConversations", () => tx.aiConversation.deleteMany({}));
  await step("conversations", () => tx.conversation.deleteMany({}));
  await step("notifications", () => tx.notification.deleteMany({}));
  await step("tasks", () => tx.task.deleteMany({}));
  await step("partnerRequests", () => tx.partnerRequest.deleteMany({}));
  await step("deletedFiles", () => tx.storedFile.deleteMany({ where: { status: "DELETED" } }));
  await step("deals", () => tx.deal.deleteMany({}));
  await step("leads", () => tx.lead.deleteMany({}));
  await step("vehicles", () => tx.vehicle.deleteMany({}));
  await step("customers", () => tx.customer.deleteMany({}));
  return removed;
}

async function main() {
  const permissionCount = await prisma.permission.count();
  if (permissionCount === 0) refuse("the permission catalog is empty. Run `npm run db:seed` first.");

  console.log(`Target database: ${new URL(url!).host}`);
  // Validated before touching the database, so a bad DEMO_USER_PASSWORD is refused every time, not only on a
  // database that does not have the demo organization yet.
  const { password, generated } = chooseDemoPassword();

  const existing = await prisma.organization.findUnique({ where: { id: ORG }, select: { id: true } });
  if (existing && !reset) {
    console.log(
      `The demo organization already exists (${ORG}). Nothing changed. Use --reset to rebuild its demo records.`
    );
    return;
  }

  const passwordHashes = await Promise.all(users.map(() => hashPassword(password)));

  if (!existing) {
    await prisma.organization.create({
      data: {
        id: ORG,
        type: "DEALERSHIP",
        ...organization,
        country: "AE",
        currency: "AED",
        timezone: "Asia/Dubai",
        locale: "en",
        createdAt: past(-200, 9),
      },
    });
  }

  const summary = await runInTenant(
    prisma,
    ORG,
    async (tx) => {
      const removed = existing ? await wipeDemoRecords(tx) : null;

      // ── roles, branches, users ──
      const roleIds = await provisionOrganizationRoles(tx, ORG);

      const branchIds = new Map<BranchKey, string>();
      for (const b of branches) {
        const { key, ...fields } = b;
        const row = await tx.branch.upsert({
          where: { organizationId_code: { organizationId: ORG, code: b.code } },
          create: { ...fields, organizationId: ORG },
          update: { ...fields },
          select: { id: true },
        });
        branchIds.set(key, row.id);
      }

      const userIds = new Map<UserKey, string>();
      for (const [i, u] of users.entries()) {
        const email = emailFor(u.name, DEMO_EMAIL_DOMAIN);
        const data = {
          roleId: roleIds[u.role],
          name: u.name,
          phone: mobile("50", 1, i + 1),
          passwordHash: passwordHashes[i],
          passwordChangedAt: now,
          status: "ACTIVE" as const,
          emailVerifiedAt: past(-190, 9),
          failedLoginCount: 0,
          lockedUntil: null,
          locale: "en",
        };
        const row = await tx.user.upsert({
          where: { email },
          create: { ...data, email, organizationId: ORG },
          update: data,
          select: { id: true },
        });
        userIds.set(u.key, row.id);
        await tx.userBranch.deleteMany({ where: { userId: row.id } });
        await tx.userBranch.createMany({
          data: u.branches.map((b, n) => ({
            organizationId: ORG,
            userId: row.id,
            branchId: lookup(branchIds, b, "branch"),
            isPrimary: n === 0,
          })),
        });
      }

      // ── customers ──
      const customerIds = new Map<CustomerKey, string>();
      const prefixes = ["50", "52", "55", "56"];
      for (const [i, name] of customers.entries()) {
        const key = customerKey(name);
        // The customer appears with their first lead.
        const oldestLead = Math.max(0, ...leads.filter((l) => l.customer === key).map((l) => l.created));
        const created = past(-(oldestLead + 2), 10);
        const row = await tx.customer.create({
          data: {
            organizationId: ORG,
            name,
            email: emailFor(name, CUSTOMER_EMAIL_DOMAIN),
            phone: mobile(prefixes[i % prefixes.length], 2, i + 1),
            createdAt: created,
            updatedAt: created,
          },
          select: { id: true },
        });
        customerIds.set(key, row.id);
      }

      // ── vehicles ──
      // A SOLD vehicle is created available and becomes sold by completing its deal below (a database rule),
      // which is also what dates its status history correctly.
      const vehicleIds = new Map<VehicleKey, string>();
      for (const [i, v] of vehicles.entries()) {
        const acquired = past(-v.acq, 9);
        const usd = v.buyUsd !== undefined;
        const row = await tx.vehicle.create({
          data: {
            organizationId: ORG,
            branchId: lookup(branchIds, v.branch, "branch"),
            stockNumber: `STK-24${String(i + 1).padStart(3, "0")}`,
            vin: vinFor(i, v),
            make: v.make,
            model: v.model,
            trim: v.trim,
            year: v.year,
            condition: v.cond,
            mileageKm: v.km,
            status: v.status === "SOLD" ? "AVAILABLE" : v.status,
            listPrice: v.list,
            expectedSellingPrice: expectedPriceOf(v),
            estimatedMarketValue: marketValueOf(v),
            purchasePrice: purchaseAed(v),
            repairCost: v.repair,
            transportCost: v.transport,
            otherCost: 0,
            emirate: v.emirate,
            importSpec: v.spec,
            sourceType: v.src,
            purchaseCurrency: usd ? "USD" : null,
            purchaseAmountOriginal: usd ? v.buyUsd : null,
            purchaseFxRate: usd ? USD_TO_AED : null,
            ...detailsOf(v.key),
            acquiredAt: acquired,
            createdAt: acquired,
            updatedAt: acquired,
          },
          select: { id: true },
        });
        vehicleIds.set(v.key, row.id);
      }
      const vehicleRow = (key: VehicleKey) => vehicles.find((v) => v.key === key)!;

      // ── leads ──
      const leadIds = new Map<string, string>();
      for (const l of leads) {
        const v = vehicleRow(l.vehicle);
        const created = past(-l.created, 10);
        const last = l.last === null ? null : past(-l.last, 11);
        const row = await tx.lead.create({
          data: {
            organizationId: ORG,
            customerId: lookup(customerIds, l.customer, "customer"),
            branchId: lookup(branchIds, v.branch, "branch"),
            assignedToId: lookup(userIds, l.sales, "user"),
            interestedVehicleId: lookup(vehicleIds, l.vehicle, "vehicle"),
            stage: l.stage,
            source: l.source,
            score: l.score,
            budget: budgetOf(v, l.bf),
            lastContactAt: last,
            nextFollowUpAt: l.next ? at(l.next[0], l.next[1]) : null,
            createdAt: created,
            updatedAt: last ?? created,
          },
          select: { id: true },
        });
        leadIds.set(l.key, row.id);
      }

      // ── deals ── numbered oldest first, QT-<year>-<sequence>
      const dealIds = new Map<string, string>();
      const byAge = [...deals].sort((a, b) => b.created - a.created);
      for (const [n, d] of byAge.entries()) {
        const v = vehicleRow(d.vehicle);
        const price = salePriceOf(v, d.factor);
        const created = past(-d.created, 11);
        const updated = past(-d.updated, 15);
        const row = await tx.deal.create({
          data: {
            organizationId: ORG,
            reference: `QT-${created.getUTCFullYear()}-${String(40 + n).padStart(4, "0")}`,
            customerId: lookup(customerIds, d.customer, "customer"),
            vehicleId: lookup(vehicleIds, d.vehicle, "vehicle"),
            branchId: lookup(branchIds, v.branch, "branch"),
            salespersonId: lookup(userIds, d.sales, "user"),
            status: d.status,
            salePrice: price,
            vatAmount: vatOf(price),
            // cost_of_sale, completed_at and the vehicle turning SOLD are set by the database on completion.
            completedAt: d.status === "COMPLETED" ? past(-(d.completed ?? d.updated), 14) : undefined,
            notes: d.notes,
            createdAt: created,
            updatedAt: updated,
          },
          select: { id: true },
        });
        dealIds.set(d.key, row.id);
      }
      // Every SOLD vehicle must have come from a completed deal, and the other way round.
      for (const v of vehicles) {
        const completed = deals.filter((d) => d.vehicle === v.key && d.status === "COMPLETED").length;
        if ((v.status === "SOLD") !== (completed === 1)) {
          throw new Error(`demo data: ${v.key} is ${v.status} but has ${completed} completed deals`);
        }
      }

      // ── tasks ──
      for (const t of tasks) {
        const done = t.doneAgo !== undefined;
        const created = past(Math.min(t.due[0] - 3, done ? -(t.doneAgo as number) - 1 : 0), 9);
        await tx.task.create({
          data: {
            organizationId: ORG,
            title: t.title,
            description: t.description,
            category: t.cat,
            priority: t.pri,
            status: done ? "COMPLETED" : "OPEN",
            dueAt: at(t.due[0], t.due[1]),
            assignedToId: lookup(userIds, t.to, "user"),
            createdById: lookup(userIds, t.by, "user"),
            source: t.ai ? "ai_agent" : "manual",
            vehicleId: t.vehicle ? lookup(vehicleIds, t.vehicle, "vehicle") : undefined,
            customerId: t.customer ? lookup(customerIds, t.customer, "customer") : undefined,
            leadId: t.lead ? lookup(leadIds, t.lead, "lead") : undefined,
            dealId: t.deal ? lookup(dealIds, t.deal, "deal") : undefined,
            completedAt: done ? past(-(t.doneAgo as number), 12) : undefined,
            createdAt: created,
            updatedAt: done ? past(-(t.doneAgo as number), 12) : created,
          },
        });
      }

      // ── notifications ──
      const paths = (n: (typeof notifications)[number]): string | undefined => {
        const link = n.link;
        if (!link) return undefined;
        if (link.lead) return `/leads/${lookup(leadIds, link.lead, "lead")}`;
        if (link.deal) return `/deals/${lookup(dealIds, link.deal, "deal")}`;
        if (link.vehicle) return `/inventory/${lookup(vehicleIds, link.vehicle, "vehicle")}`;
        return `/${link.path}`;
      };
      await tx.notification.createMany({
        data: notifications.map((n) => {
          const createdAt = past(-n.at[0], n.at[1]);
          return {
            organizationId: ORG,
            userId: lookup(userIds, n.to, "user"),
            kind: n.kind,
            title: n.title,
            description: n.description,
            link: paths(n),
            readAt: n.read ? new Date(Math.min(now.getTime(), createdAt.getTime() + 2 * 3_600_000)) : null,
            createdAt,
          };
        }),
      });

      // ── AI conversations ──
      const conversations = buildConversations();
      let messageTotal = 0;
      for (const c of conversations) {
        const start = past(-c.startedAt[0], c.startedAt[1]);
        // Each message follows the previous one by a few seconds to a minute.
        const times = c.messages.map((_, i) => new Date(start.getTime() + i * 45_000));
        const conversation = await tx.aiConversation.create({
          data: {
            organizationId: ORG,
            userId: lookup(userIds, c.user, "user"),
            title: c.title,
            status: "ACTIVE",
            vehicleId: c.context?.vehicle ? lookup(vehicleIds, c.context.vehicle, "vehicle") : undefined,
            leadId: c.context?.lead ? lookup(leadIds, c.context.lead, "lead") : undefined,
            dealId: c.context?.deal ? lookup(dealIds, c.context.deal, "deal") : undefined,
            messageCount: c.messages.length,
            lastMessageAt: times[times.length - 1],
            createdAt: start,
            updatedAt: times[times.length - 1],
          },
          select: { id: true },
        });
        await tx.aiMessage.createMany({
          data: c.messages.map((m, i) => ({
            organizationId: ORG,
            conversationId: conversation.id,
            position: i + 1,
            role: m.role,
            status: "COMPLETE" as const,
            content: m.content,
            // Canned text: no provider or model is claimed, and no usage or cost is recorded.
            finishReason: m.role === "ASSISTANT" ? "stop" : undefined,
            createdAt: times[i],
          })),
        });
        messageTotal += c.messages.length;
      }

      return {
        removed,
        users: users.length,
        branches: branches.length,
        customers: customers.length,
        vehicles: vehicles.length,
        leads: leads.length,
        deals: deals.length,
        tasks: tasks.length,
        notifications: notifications.length,
        aiConversations: conversations.length,
        aiMessages: messageTotal,
      };
    },
    { timeoutMs: 120_000 }
  ).catch((error: unknown) => {
    if ((error as { code?: string } | null)?.code === "P2003") {
      throw new Error(
        "The demo records could not be replaced because something else still refers to them (for example uploaded " +
          "files attached to a demo vehicle). Remove those first, or use a fresh database."
      );
    }
    throw error;
  });

  const { removed, ...counts } = summary;
  if (removed) console.log("Removed the previous demo records:", removed);
  console.log("Seeded the demo organization:", counts);
  console.log(`\nDemo organization: ${organization.name} (${ORG})`);
  console.log("Sign in with any of these (all use the same password):");
  for (const u of users) console.log(`  ${emailFor(u.name, DEMO_EMAIL_DOMAIN).padEnd(48)} ${u.role}`);
  if (generated) {
    console.log(`\nPassword (generated, shown once, not stored anywhere): ${password}`);
  } else {
    console.log("\nPassword: the value of DEMO_USER_PASSWORD.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
