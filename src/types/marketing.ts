import type { ID } from "./common";

export type MarketingContentType =
  | "vehicle_ad"
  | "instagram_caption"
  | "facebook_post"
  | "tiktok_script"
  | "whatsapp_message"
  | "email"
  | "listing_description"
  | "seo_description";

export type MarketingGeneratedType = MarketingContentType | "translated_ad";

export interface GeneratedMarketingContent {
  id: ID;
  vehicleId: ID;
  type: MarketingGeneratedType;
  targetLanguage?: string;
  content: string;
  createdAt: string;
}

export type MarketingChannel =
  | "advertisement"
  | "instagram"
  | "facebook"
  | "tiktok"
  | "whatsapp"
  | "email"
  | "listing"
  | "seo";

export type CampaignStatus = "draft" | "scheduled" | "published";

export interface MarketingCampaign {
  id: ID;
  name: string;
  vehicleId: ID;
  vehicleLabel: string;
  channels: MarketingChannel[];
  status: CampaignStatus;
  createdAt: string;
}

export type MarketingCampaignInput = Omit<MarketingCampaign, "id" | "status" | "createdAt">;
