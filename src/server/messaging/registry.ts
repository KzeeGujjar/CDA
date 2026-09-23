import type { MessageChannel } from "@/generated/prisma/client";
import { smsConfig, whatsAppConfig } from "./config";
import { EmailProvider } from "./providers/email";
import { InternalProvider } from "./providers/internal";
import { SmsProvider } from "./providers/sms";
import { WhatsAppProvider } from "./providers/whatsapp";
import type { MessageProvider } from "./provider";

/**
 * Turns a channel into a ready adapter, or null when that channel has no usable configuration. This is the
 * ONLY place that knows which class serves which channel; adding a sixth channel means one adapter file and
 * one case here — mirrors src/server/ai/providers/registry.ts.
 */
export function getMessageProvider(channel: MessageChannel): MessageProvider | null {
  switch (channel) {
    case "WEBSITE_CHAT":
    case "AI_AGENT":
      return new InternalProvider();
    case "EMAIL":
      return new EmailProvider();
    case "WHATSAPP": {
      const config = whatsAppConfig();
      return config ? new WhatsAppProvider(config) : null;
    }
    case "SMS": {
      const config = smsConfig();
      return config ? new SmsProvider(config) : null;
    }
  }
}

export interface ChannelStatus {
  channel: MessageChannel;
  configured: boolean;
}

const ALL_CHANNELS: MessageChannel[] = ["WHATSAPP", "EMAIL", "SMS", "WEBSITE_CHAT", "AI_AGENT"];

export function channelStatuses(): ChannelStatus[] {
  return ALL_CHANNELS.map((channel) => ({ channel, configured: getMessageProvider(channel) !== null }));
}
