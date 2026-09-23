import type { ID } from "@/types/common";
import type { GeneratedMarketingContent, MarketingCampaign, MarketingCampaignInput, MarketingContentType } from "@/types/marketing";
import type { Vehicle } from "@/types/vehicle";
import { marketingCampaignsFixture } from "@/mock/marketing-campaigns";
import { backendRequest, liveOrDemo, unwrapBackend } from "@/services/backend";
import {
  generateMarketingContent as demoGenerateContent,
  translateAdvertisement as demoTranslateContent,
  type TranslationTargetLanguage,
} from "@/lib/marketing-generator";

export type { TranslationTargetLanguage };

let campaigns: MarketingCampaign[] = [...marketingCampaignsFixture];
const wait = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));
const genId = () => `gen-${Math.random().toString(36).slice(2, 9)}`;

export async function getCampaigns(): Promise<MarketingCampaign[]> {
  await wait();
  return campaigns;
}

export async function createCampaign(input: MarketingCampaignInput): Promise<MarketingCampaign> {
  await wait();
  const campaign: MarketingCampaign = { ...input, id: genId(), status: "draft", createdAt: new Date().toISOString() };
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

// ── AI content generation (POST /api/v1/marketing/generate, /marketing/translate) ─────────────────────────

export interface GenerateContentOptions {
  language?: "en" | "ar" | "hi" | "ur";
  targetAudience?: string;
  priceOverride?: number;
  highlightFeatures?: string[];
}

interface MarketingContentResponse {
  content: string;
  type: string;
  language: string;
}

export async function generateContent(
  vehicle: Vehicle,
  type: MarketingContentType,
  options?: GenerateContentOptions
): Promise<GeneratedMarketingContent> {
  return liveOrDemo({
    live: async () => {
      const data = unwrapBackend(
        await backendRequest<MarketingContentResponse>("POST", "/marketing/generate", {
          vehicleId: vehicle.id,
          type,
          language: options?.language ?? "en",
          ...(options?.targetAudience ? { targetAudience: options.targetAudience } : {}),
          ...(options?.priceOverride ? { priceOverride: options.priceOverride } : {}),
          ...(options?.highlightFeatures?.length ? { highlightFeatures: options.highlightFeatures } : {}),
        })
      );
      return {
        id: genId(),
        vehicleId: vehicle.id,
        type,
        targetLanguage: data.language,
        content: data.content,
        createdAt: new Date().toISOString(),
      };
    },
    demo: async () => {
      await wait(900);
      return {
        id: genId(),
        vehicleId: vehicle.id,
        type,
        content: demoGenerateContent(vehicle, type),
        createdAt: new Date().toISOString(),
      };
    },
  });
}

export async function translateContent(
  vehicle: Vehicle,
  target: TranslationTargetLanguage
): Promise<GeneratedMarketingContent> {
  return liveOrDemo({
    live: async () => {
      const data = unwrapBackend(
        await backendRequest<MarketingContentResponse>("POST", "/marketing/translate", {
          vehicleId: vehicle.id,
          targetLanguage: target,
        })
      );
      return {
        id: genId(),
        vehicleId: vehicle.id,
        type: "translated_ad",
        targetLanguage: data.language,
        content: data.content,
        createdAt: new Date().toISOString(),
      };
    },
    demo: async () => {
      await wait(900);
      return {
        id: genId(),
        vehicleId: vehicle.id,
        type: "translated_ad",
        targetLanguage: target,
        content: demoTranslateContent(vehicle, target),
        createdAt: new Date().toISOString(),
      };
    },
  });
}
