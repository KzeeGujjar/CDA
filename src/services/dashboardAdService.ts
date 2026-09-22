import type { ID } from "@/types/common";
import type { DashboardAd, DashboardAdInput } from "@/types/dashboard-ad";
import { dashboardAdsFixture } from "@/mock/dashboard-ads";

let dashboardAds: DashboardAd[] = [...dashboardAdsFixture];

const wait = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getDashboardAds(): Promise<DashboardAd[]> {
  await wait();
  return dashboardAds;
}

export async function getActiveDashboardAds(): Promise<DashboardAd[]> {
  await wait(150);
  return dashboardAds.filter((ad) => ad.active);
}

export async function createDashboardAd(input: DashboardAdInput): Promise<DashboardAd> {
  await wait();
  const ad: DashboardAd = {
    ...input,
    id: `ad-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
  };
  dashboardAds = [ad, ...dashboardAds];
  return ad;
}

export async function updateDashboardAd(id: ID, patch: Partial<DashboardAdInput>): Promise<DashboardAd> {
  await wait();
  const index = dashboardAds.findIndex((ad) => ad.id === id);
  if (index === -1) throw new Error("Dashboard ad not found");
  dashboardAds[index] = { ...dashboardAds[index], ...patch };
  return dashboardAds[index];
}

export async function deleteDashboardAd(id: ID): Promise<void> {
  await wait();
  dashboardAds = dashboardAds.filter((ad) => ad.id !== id);
}
