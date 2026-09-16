import type { LucideIcon } from "lucide-react";
import { Camera, FileText, Languages, Mail, Megaphone, MessageCircle, Music2, Search, ThumbsUp } from "lucide-react";
import type { MarketingChannel, MarketingContentType, MarketingGeneratedType } from "@/types/marketing";

export const marketingContentMeta: Record<MarketingGeneratedType, { icon: LucideIcon; labelKey: string }> = {
  vehicle_ad: { icon: Megaphone, labelKey: "vehicleAd" },
  instagram_caption: { icon: Camera, labelKey: "instagramCaption" },
  facebook_post: { icon: ThumbsUp, labelKey: "facebookPost" },
  tiktok_script: { icon: Music2, labelKey: "tiktokScript" },
  whatsapp_message: { icon: MessageCircle, labelKey: "whatsappMessage" },
  email: { icon: Mail, labelKey: "email" },
  listing_description: { icon: FileText, labelKey: "listingDescription" },
  seo_description: { icon: Search, labelKey: "seoDescription" },
  translated_ad: { icon: Languages, labelKey: "translatedAd" },
};

export const marketingContentTypes: MarketingContentType[] = [
  "vehicle_ad",
  "instagram_caption",
  "facebook_post",
  "tiktok_script",
  "whatsapp_message",
  "email",
  "listing_description",
  "seo_description",
];

export const marketingTypeToChannel: Record<MarketingGeneratedType, MarketingChannel> = {
  vehicle_ad: "advertisement",
  instagram_caption: "instagram",
  facebook_post: "facebook",
  tiktok_script: "tiktok",
  whatsapp_message: "whatsapp",
  email: "email",
  listing_description: "listing",
  seo_description: "seo",
  translated_ad: "advertisement",
};
