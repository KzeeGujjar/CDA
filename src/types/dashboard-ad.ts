import type { ID } from "./common";

export interface DashboardAd {
  id: ID;
  title: string;
  description: string;
  ctaLabel: string;
  ctaUrl: string;
  badge?: string;
  active: boolean;
  createdAt: string;
}

export type DashboardAdInput = Omit<DashboardAd, "id" | "createdAt">;
