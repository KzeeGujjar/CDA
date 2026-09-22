import type { PrismaClient } from "@/generated/prisma/client";

/**
 * A small, fully known data set for the dashboard checks. It is written with the OWNER connection and
 * explicit historical timestamps (all at 12:00 UTC so no event sits near a day boundary), so every
 * expected number in the checks can be verified by hand. Two comparison windows are used:
 *
 *   CURRENT   2026-03-01 .. 2026-04-01   (31 days)
 *   PREVIOUS  2026-02-01 .. 2026-03-01
 *
 *   vehicle acquired   status trajectory                   cost   price  branch   deal (completed)             sp
 *   V1      Jan 10     available                           100k   130k*  Downtown -
 *   V2      Feb 10     available                            50k    70k   Downtown -
 *   V3      Mar 05     purchased -> available (Mar 10)      80k   100k*  Airport  -
 *   V4      Jan 15     sold by a deal on Feb 20             60k    80k   Downtown Feb 20  sale 75k  (Downtown) sp1
 *   V5      Feb 01     sold by a deal on Mar 12            120k   160k*  Airport  Mar 12  sale 155k (Airport)  sp2
 *   V6      Mar 02     sold by a deal on Mar 20             40k    55k   Downtown Mar 20  sale 52k  (Downtown) sp1
 *   V7      Mar 03     archived                             10k    15k   Downtown -
 *   V8      Mar 15     reserved                             30k    45k   Downtown -
 *   V10     May 01     sold by a deal on May 31 21:00 UTC   20k    30k   Downtown May 31  sale 25k  (Downtown) sp1
 *   (* = expected_selling_price is lower than the list price: 125k, 95k, 150k; V10 is Jun 1 in Dubai but May in UTC)
 *
 * Also: a draft, an accepted and a cancelled deal (must not count), and five leads per window.
 */
export const at = (day: string, time = "12:00:00") => new Date(`${day}T${time}Z`);

export const WINDOW = {
  current: { from: at("2026-03-01", "00:00:00"), to: at("2026-04-01", "00:00:00") },
  previous: { from: at("2026-02-01", "00:00:00"), to: at("2026-03-01", "00:00:00") },
};

export interface FixtureRefs {
  organizationId: string;
  downtownId: string;
  airportId: string;
  ownerId: string;
  sp1Id: string;
  sp2Id: string;
}

export async function seedDashboardFixture(db: PrismaClient, refs: FixtureRefs, tag: string) {
  const org = refs.organizationId;
  const customer = await db.customer.create({ data: { organizationId: org, name: `Customer ${tag}` } });

  async function vehicle(
    stock: string,
    acquired: string,
    branch: "downtown" | "airport",
    cost: { purchase: number; repair?: number; transport?: number; other?: number },
    price: { list: number; expected?: number },
    status: "AVAILABLE" | "PURCHASED" | "RESERVED" | "ARCHIVED" = "AVAILABLE"
  ) {
    return db.vehicle.create({
      data: {
        organizationId: org,
        branchId: branch === "downtown" ? refs.downtownId : refs.airportId,
        stockNumber: `${stock}-${tag}`,
        make: "Toyota",
        model: "Land Cruiser",
        year: 2022,
        status,
        listPrice: price.list,
        expectedSellingPrice: price.expected,
        purchasePrice: cost.purchase,
        repairCost: cost.repair ?? 0,
        transportCost: cost.transport ?? 0,
        otherCost: cost.other ?? 0,
        acquiredAt: at(acquired),
      },
    });
  }

  const v1 = await vehicle(
    "V1",
    "2026-01-10",
    "downtown",
    { purchase: 90_000, repair: 5_000, transport: 3_000, other: 2_000 },
    { list: 130_000, expected: 125_000 }
  );
  const v2 = await vehicle("V2", "2026-02-10", "downtown", { purchase: 50_000 }, { list: 70_000 });
  const v3 = await vehicle(
    "V3",
    "2026-03-05",
    "airport",
    { purchase: 80_000 },
    { list: 100_000, expected: 95_000 },
    "PURCHASED"
  );
  const v4 = await vehicle("V4", "2026-01-15", "downtown", { purchase: 60_000 }, { list: 80_000 });
  const v5 = await vehicle("V5", "2026-02-01", "airport", { purchase: 120_000 }, { list: 160_000, expected: 150_000 });
  const v6 = await vehicle("V6", "2026-03-02", "downtown", { purchase: 40_000 }, { list: 55_000 });
  const v7 = await vehicle("V7", "2026-03-03", "downtown", { purchase: 10_000 }, { list: 15_000 }, "ARCHIVED");
  const v8 = await vehicle("V8", "2026-03-15", "downtown", { purchase: 30_000 }, { list: 45_000 }, "RESERVED");
  const v10 = await vehicle("V10", "2026-05-01", "downtown", { purchase: 20_000 }, { list: 30_000 });

  // V3 becomes available on Mar 10: dated explicitly (app.status_event_at is the hook the deals trigger uses too).
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.status_event_at', ${at("2026-03-10").toISOString()}, true)`;
    await tx.vehicle.update({ where: { id: v3.id }, data: { status: "AVAILABLE" } });
  });

  let n = 0;
  async function deal(
    vehicleId: string,
    status: "DRAFT" | "SENT" | "ACCEPTED" | "COMPLETED" | "CANCELLED",
    salePrice: number,
    branchId: string,
    salespersonId: string,
    completedAt?: Date
  ) {
    return db.deal.create({
      data: {
        organizationId: org,
        reference: `DL-${tag}-${++n}`,
        customerId: customer.id,
        vehicleId,
        branchId,
        salespersonId,
        status,
        salePrice,
        completedAt,
      },
    });
  }
  const d4 = await deal(v4.id, "COMPLETED", 75_000, refs.downtownId, refs.sp1Id, at("2026-02-20"));
  const d5 = await deal(v5.id, "COMPLETED", 155_000, refs.airportId, refs.sp2Id, at("2026-03-12"));
  const d6 = await deal(v6.id, "COMPLETED", 52_000, refs.downtownId, refs.sp1Id, at("2026-03-20"));
  const d10 = await deal(v10.id, "COMPLETED", 25_000, refs.downtownId, refs.sp1Id, at("2026-05-31", "21:00:00"));
  // Not sales: must never be counted.
  await deal(v1.id, "DRAFT", 128_000, refs.downtownId, refs.sp1Id);
  await deal(v2.id, "ACCEPTED", 69_000, refs.downtownId, refs.sp2Id);
  await deal(v8.id, "CANCELLED", 44_000, refs.downtownId, refs.sp1Id);

  async function lead(
    day: string,
    stage: "NEW" | "CONTACTED" | "LOST" | "WON",
    assignedToId: string,
    branchId: string
  ) {
    return db.lead.create({
      data: { organizationId: org, customerId: customer.id, stage, assignedToId, branchId, createdAt: at(day) },
    });
  }
  // CURRENT window: 4 new leads, 2 won (50%)
  await lead("2026-03-02", "NEW", refs.sp1Id, refs.downtownId);
  await lead("2026-03-05", "WON", refs.sp1Id, refs.downtownId);
  await lead("2026-03-10", "LOST", refs.sp2Id, refs.airportId);
  await lead("2026-03-20", "WON", refs.sp2Id, refs.airportId);
  // PREVIOUS window: 3 new leads, 1 won (33.33%)
  await lead("2026-02-05", "WON", refs.sp1Id, refs.downtownId);
  await lead("2026-02-10", "NEW", refs.sp2Id, refs.airportId);
  await lead("2026-02-15", "CONTACTED", refs.sp1Id, refs.downtownId);
  // Outside both windows
  await lead("2026-01-05", "WON", refs.sp1Id, refs.downtownId);

  return { customer, vehicles: { v1, v2, v3, v4, v5, v6, v7, v8, v10 }, deals: { d4, d5, d6, d10 } };
}

/** Expected results for the fixture, computed by hand (see the table above). */
export const EXPECTED = {
  all: {
    stock: {
      // as at 2026-04-01 (value) and 2026-03-01 (previous)
      total: [7, 4],
      available: [3, 3],
      purchased: [3, 2],
      expectedRevenue: [335_000, 345_000],
      inventoryValue: [260_000, 270_000],
    },
    sales: { sold: [2, 1], revenue: [207_000, 75_000], grossProfit: [47_000, 15_000] },
    leads: { new: [4, 3], won: [2, 1], rate: [50, 33.33] },
  },
} as const;
