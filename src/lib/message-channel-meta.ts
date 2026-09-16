import type { LucideIcon } from "lucide-react";
import { Bot, Globe, Mail, MessageCircle, MessageSquareText } from "lucide-react";
import type { MessageChannel } from "@/types/message";

export const messageChannelMeta: Record<MessageChannel, { icon: LucideIcon; labelKey: string; tone: string }> = {
  whatsapp: { icon: MessageCircle, labelKey: "whatsapp", tone: "text-[#25D366]" },
  email: { icon: Mail, labelKey: "email", tone: "text-sky-400" },
  sms: { icon: MessageSquareText, labelKey: "sms", tone: "text-violet-400" },
  website_chat: { icon: Globe, labelKey: "websiteChat", tone: "text-amber-400" },
  ai_agent: { icon: Bot, labelKey: "aiAgent", tone: "text-primary" },
};

export const messageChannels: MessageChannel[] = ["whatsapp", "email", "sms", "website_chat", "ai_agent"];
