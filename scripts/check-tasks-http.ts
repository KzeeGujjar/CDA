/**
 * End-to-end check of real task management (§0.23): list/get/update/status/delete (new, v2 envelope) built
 * on top of the existing POST /api/v1/tasks (unchanged, flat envelope, shared with the AI agent's createTask
 * tool), plus reminders (src/server/platform/task-reminders.ts) and the activity trail.
 *
 *   CHECK_DB_ALLOW_WRITES=1 DIRECT_DATABASE_URL=... DATABASE_URL=... npm run check:tasks-http
 */
import { createPrismaClient } from "@/server/db/client";
import { sessionCookieName } from "@/server/auth/cookies";
import { createSession } from "@/server/auth/session";
import { provisionOrganizationRoles } from "@/server/modules/rbac/apply-role-template";
import { runTaskReminders } from "@/server/platform/task-reminders";

try {
  process.loadEnvFile(".env");
} catch {
  // environment provided externally
}
if (process.env.CHECK_DB_ALLOW_WRITES !== "1") throw new Error("Set CHECK_DB_ALLOW_WRITES=1 (writes test data).");
const ownerUrl = process.env.DIRECT_DATABASE_URL;
if (!ownerUrl) throw new Error("Set DIRECT_DATABASE_URL.");
const BASE = process.env.CHECK_BASE_URL ?? "http://localhost:3100";

const db = createPrismaClient(ownerUrl, { maxConnections: 2 });
const suffix = Date.now().toString(36);
let passed = 0;
const failures: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ` - ${detail}` : ""}`);
};
const same = (name: string, a: unknown, b: unknown) =>
  ok(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);

interface Res {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}
let ipCounter = 0;
const runOctets = [1 + Math.floor(Math.random() * 200), Math.floor(Math.random() * 250)];
const nextIp = () => `10.${runOctets[0]}.${runOctets[1] + Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

async function call(method: string, path: string, token?: string, body?: unknown): Promise<Res> {
  const headers: Record<string, string> = { "x-real-ip": nextIp() };
  if (token) headers.cookie = `${sessionCookieName()}=${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const raw = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(raw);
  } catch {
    // no body
  }
  const isV2 = json !== null && typeof json === "object" && "success" in (json as object);
  return { status: res.status, raw: json, data: isV2 ? (json as { data: unknown }).data : json };
}
const get = (p: string, t?: string) => call("GET", p, t);
const post = (p: string, t: string | undefined, b: unknown = {}) => call("POST", p, t, b);
const patch = (p: string, t: string | undefined, b: unknown) => call("PATCH", p, t, b);
const del = (p: string, t?: string) => call("DELETE", p, t);

async function makeOrg(label: string) {
  const org = await db.organization.create({
    data: { name: `${label} ${suffix}`, email: `${label.toLowerCase()}-${suffix}@example.com`, timezone: "Asia/Dubai" },
  });
  const roles = await db.$transaction((tx) => provisionOrganizationRoles(tx, org.id));
  const users: Record<string, { id: string; token: string }> = {};
  const mk = async (key: string, roleId: string) => {
    const user = await db.user.create({
      data: { organizationId: org.id, roleId, name: key, email: `${key}-${label}-${suffix}@example.com`.toLowerCase(), status: "ACTIVE" },
    });
    const token = (await createSession(db, { organizationId: org.id, userId: user.id })).token;
    return (users[key] = { id: user.id, token });
  };
  for (const key of ["dealerOwner", "manager", "marketingManager", "salesperson", "sales2", "buyer", "accountant", "viewer"] as const)
    await mk(key, roles[key === "sales2" ? "salesperson" : key]);
  return { org, users };
}

const due = (mins: number) => new Date(Date.now() + mins * 60_000).toISOString();

async function main() {
  const X = await makeOrg("Xray");
  const Y = await makeOrg("Yankee");
  const tok = (k: string) => X.users[k].token;
  const vehicle = await db.vehicle.create({
    data: { organizationId: X.org.id, stockNumber: `T-${suffix}`, make: "Toyota", model: "Camry", year: 2023, listPrice: 90_000 },
  });
  const customer = await db.customer.create({ data: { organizationId: X.org.id, name: "Sara Khan" } });

  // ═════════ 1. who may do what ═════════
  const table: [string, number, number, number][] = [
    // role, create, list, update-own-task-of-mine(salesperson checked separately)
    ["dealerOwner", 201, 200, 200],
    ["manager", 201, 200, 200],
    ["salesperson", 201, 200, 200],
    ["buyer", 201, 200, 200],
    ["accountant", 403, 403, 403],
    ["marketingManager", 403, 403, 403],
    ["viewer", 403, 403, 403],
  ];
  const createdIds: Record<string, string> = {};
  for (const [role, createStatus, listStatus] of table) {
    const created = await post("/api/v1/tasks", tok(role), { title: `probe ${role}`, dueAt: due(60) });
    same(`${role}: create / list`, [created.status, (await get("/api/v1/tasks", tok(role))).status], [createStatus, listStatus]);
    if (created.status === 201) createdIds[role] = created.data.id;
  }
  const updProbe = await patch(`/api/v1/tasks/${createdIds.salesperson}`, tok("accountant"), { title: "x" });
  same("accountant cannot update a task (no tasks permission at all)", updProbe.status, 403);
  same("no session -> 401", (await get("/api/v1/tasks")).status, 401);

  // ═════════ 2. real data: create with context, list shows resolved labels ═════════
  const genRes = await post("/api/v1/tasks", tok("dealerOwner"), {
    title: "Follow up on Camry",
    category: "follow_up",
    priority: "high",
    dueAt: due(30),
    context: { type: "vehicle", id: vehicle.id },
  });
  ok("v2 list wraps {success:true,data:[...]}", (await get("/api/v1/tasks", tok("dealerOwner"))).raw.success === true);
  const list = await get("/api/v1/tasks", tok("dealerOwner"));
  const mine = (list.data as { id: string; vehicleLabel: string | null }[]).find((t) => t.id === genRes.data.id);
  same("the list resolves the vehicle's real label", mine?.vehicleLabel, "2023 Toyota Camry");
  const searched = await get(`/api/v1/tasks?search=${encodeURIComponent("Follow up on Camry")}`, tok("dealerOwner"));
  ok("search (§29) finds a task by title", (searched.data as { id: string }[]).some((t) => t.id === genRes.data.id), JSON.stringify(searched.data));
  const searchedMiss = await get(`/api/v1/tasks?search=${encodeURIComponent("no such task title exists")}`, tok("dealerOwner"));
  same("...and finds nothing for a title that isn't there", searchedMiss.data.length, 0);

  // ═════════ 3. get one, with activity history ═════════
  const detail = await get(`/api/v1/tasks/${genRes.data.id}`, tok("dealerOwner"));
  ok(
    "task detail includes activity, starting with task.created",
    detail.status === 200 && Array.isArray(detail.data.activity) && detail.data.activity.some((a: { action: string }) => a.action === "task.created"),
    JSON.stringify(detail.data.activity)
  );

  // ═════════ 4. update: relink, reassign, reminders ═════════
  const upd1 = await patch(`/api/v1/tasks/${genRes.data.id}`, tok("dealerOwner"), { context: { type: "customer", id: customer.id }, priority: "low" });
  same("updating adds the customer and changes priority", [upd1.data.customerName, upd1.data.priority], ["Sara Khan", "low"]);
  const remindAt = due(-5); // already due, for the reminder-maintenance test below
  const upd2 = await patch(`/api/v1/tasks/${genRes.data.id}`, tok("dealerOwner"), { remindAt });
  ok("a reminder time can be set", upd2.status === 200 && upd2.data.remindAt !== null);
  const detail2 = await get(`/api/v1/tasks/${genRes.data.id}`, tok("dealerOwner"));
  ok(
    "the activity trail now shows task.updated entries",
    detail2.data.activity.filter((a: { action: string }) => a.action === "task.updated").length >= 2
  );

  // ═════════ 5. status ═════════
  const statusRes = await patch(`/api/v1/tasks/${genRes.data.id}/status`, tok("dealerOwner"), { status: "completed" });
  ok("status can move to completed, with completedAt set", statusRes.status === 200 && statusRes.data.status === "completed" && statusRes.data.completedAt !== null);
  const reopened = await patch(`/api/v1/tasks/${genRes.data.id}/status`, tok("dealerOwner"), { status: "open" });
  same("reopening clears completedAt", reopened.data.completedAt, null);
  same("an unknown status is a 400", (await patch(`/api/v1/tasks/${genRes.data.id}/status`, tok("dealerOwner"), { status: "archived" })).status, 400);

  // ═════════ 6. reminders: a real notification, idempotent ═════════
  const beforeCount = await db.notification.count({ where: { organizationId: X.org.id } });
  const run1 = await runTaskReminders();
  ok("the maintenance run sends at least one reminder", run1.reminded >= 1);
  const afterCount = await db.notification.count({ where: { organizationId: X.org.id } });
  ok("...creating a real notification row", afterCount > beforeCount);
  const notif = await db.notification.findFirst({ where: { organizationId: X.org.id, kind: "SYSTEM", description: "Follow up on Camry" } });
  ok("...addressed to the task's assignee", notif?.userId === X.users.dealerOwner.id);
  const run2 = await runTaskReminders();
  same("running again does not double-notify (remindedAt was stamped)", run2.reminded, 0);

  // ═════════ 7. "own" scope for salesperson/buyer ═════════
  const spTask = await post("/api/v1/tasks", tok("salesperson"), { title: "sp task", dueAt: due(60) });
  same(
    "a salesperson can read/update their own task but not another salesperson's",
    [
      (await get(`/api/v1/tasks/${spTask.data.id}`, tok("salesperson"))).status,
      (await get(`/api/v1/tasks/${spTask.data.id}`, tok("sales2"))).status,
      (await get(`/api/v1/tasks/${spTask.data.id}`, tok("manager"))).status,
    ],
    [200, 404, 200]
  );
  const reassign = await post("/api/v1/tasks", tok("salesperson"), { title: "for someone else", dueAt: due(60), assignedToId: X.users.manager.id });
  same("a salesperson cannot assign a task to someone else", reassign.status, 403);

  // ═════════ 8. validation & not found ═════════
  same("update: an empty patch is a 400", (await patch(`/api/v1/tasks/${genRes.data.id}`, tok("dealerOwner"), {})).status, 400);
  same("update: a tenant field is a 400", (await patch(`/api/v1/tasks/${genRes.data.id}`, tok("dealerOwner"), { title: "x", organizationId: Y.org.id })).status, 400);
  same("get: an unknown task is a 404", (await get("/api/v1/tasks/does-not-exist", tok("dealerOwner"))).status, 404);
  same("get: another organization's task is also a 404 (RLS)", (await get(`/api/v1/tasks/${genRes.data.id}`, Y.users.dealerOwner.token)).status, 404);

  // ═════════ 9. delete ═════════
  const delRes = await del(`/api/v1/tasks/${spTask.data.id}`, tok("salesperson"));
  same("a salesperson can delete their own task", [delRes.status, delRes.data.deleted], [200, true]);
  same("...and it is really gone", (await get(`/api/v1/tasks/${spTask.data.id}`, tok("salesperson"))).status, 404);

  // ═════════ 10. tenant isolation ═════════
  same("org Y sees none of org X's tasks", (await get("/api/v1/tasks", Y.users.dealerOwner.token)).data.length, 0);
}

main()
  .catch((error) => failures.push(`unexpected error: ${(error as Error).stack ?? error}`))
  .finally(async () => {
    await db.$disconnect();
    if (failures.length) {
      console.error(`\nTasks HTTP check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`);
      process.exit(1);
    }
    console.log(`Tasks HTTP check OK: ${passed} assertions passed.`);
  });
