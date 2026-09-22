import type { ID } from "@/types/common";
import type { MarketingCampaign, MarketingCampaignInput } from "@/types/marketing";
import { marketingCampaignsFixture } from "@/mock/marketing-campaigns";

let campaigns: MarketingCampaign[] = [...marketingCampaignsFixture];
const wait = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getCampaigns(): Promise<MarketingCampaign[]> {
  await wait();
  return campaigns;
}

export async function createCampaign(input: MarketingCampaignInput): Promise<MarketingCampaign> {
  await wait();
  const campaign: MarketingCampaign = {
    ...input,
    id: `camp-${Math.random().toString(36).slice(2, 9)}`,
    status: "draft",
    createdAt: new Date().toISOString(),
  };
  campaigns = [campaign, ...campaigns];
  return campaign;
}

export async function updateCampaignStatus(id: ID, status: MarketingCampaign["status"]): Promise<MarketingCampaign> {
  await wait();
  const index = campaigns.findIndex((c) => c.id === id);
  if (index === -1) throw new Error("Campaign not found");
  campaigns[index] = { ...campaigns[index], status };
  return campaigns[index];
}
