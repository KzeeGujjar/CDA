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

export interface DeliveryOutcome {
  status: "SENT" | "FAILED";
  providerMessageId: string | null;
  errorCode: string | null;
}

/**
 * Sends through a channel's adapter and normalizes the result — never a fabricated "sent". Shared by the live
 * send path (src/server/modules/messages/messages.service.ts, a real network call made outside the DB
 * transaction) and the background retry job (src/server/platform/message-retries.ts), so there is exactly one
 * place that decides what "delivered" means for a channel.
 */
export async function deliverMessage(channel: MessageChannel, to: string, body: string): Promise<DeliveryOutcome> {
  const provider = getMessageProvider(channel);
  if (!provider) return { status: "FAILED", providerMessageId: null, errorCode: "provider_not_configured" };
  try {
    const result = await provider.send({ to, body });
    if (result.status === "sent") return { status: "SENT", providerMessageId: result.providerMessageId ?? null, errorCode: null };
    return { status: "FAILED", providerMessageId: null, errorCode: result.errorCode ?? "send_failed" };
  } catch (error) {
    console.error("[messaging] provider threw:", error instanceof Error ? error.message : error);
    return { status: "FAILED", providerMessageId: null, errorCode: "send_failed" };
  }
}
