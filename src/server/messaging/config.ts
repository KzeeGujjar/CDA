/**
 * Messaging provider configuration. SERVER-ONLY, same rule as src/server/ai/config.ts: nothing here may be
 * NEXT_PUBLIC_, and the frontend never sees a credential — it only calls our own /api/v1/messages/* endpoints.
 * A provider with no configuration returns null and is simply not offered (src/server/messaging/registry.ts),
 * exactly like an unconfigured AI provider.
 */

const isProduction = () => process.env.NODE_ENV === "production";

function validBaseUrl(name: string, raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} is not a valid URL.`);
  }
  if (isProduction() && url.protocol !== "https:") {
    // Test environments only: plain http for a loopback address (a local fake of the provider) with an
    // explicit flag — mirrors AI_ALLOW_INSECURE_URL / STORAGE_ALLOW_INSECURE_URL.
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    if (!(process.env.MESSAGING_ALLOW_INSECURE_URL === "1" && loopback))
      throw new Error(`${name} must use https in production.`);
  }
  return url.origin;
}

export interface WhatsAppConfig {
  baseUrl: string;
  phoneNumberId: string;
  accessToken: string;
}

/** WhatsApp Cloud API (Meta Graph API). Needs WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN. */
export function whatsAppConfig(): WhatsAppConfig | null {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  if (!phoneNumberId || !accessToken) return null;
  const baseUrl = validBaseUrl("WHATSAPP_BASE_URL", process.env.WHATSAPP_BASE_URL?.trim() || "https://graph.facebook.com");
  return { baseUrl, phoneNumberId, accessToken };
}

export interface SmsConfig {
  baseUrl: string;
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

/** Twilio's REST API shape. Needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER. */
export function smsConfig(): SmsConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!accountSid || !authToken || !fromNumber) return null;
  const baseUrl = validBaseUrl("TWILIO_BASE_URL", process.env.TWILIO_BASE_URL?.trim() || "https://api.twilio.com");
  return { baseUrl, accountSid, authToken, fromNumber };
}

/** Every configured secret value, so a provider error can be scrubbed of them before it is logged. */
export function configuredMessagingSecrets(): string[] {
  return [whatsAppConfig()?.accessToken, smsConfig()?.authToken].filter((v): v is string => !!v);
}
