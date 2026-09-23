import type { WhatsAppConfig } from "../config";
import type { MessageProvider, OutboundMessage, SendResult } from "../provider";

/**
 * WhatsApp Business (Meta Graph API) shape: POST /{phoneNumberId}/messages with a bearer token, a plain text
 * message. Real HTTP, not a mock — it simply has nothing to talk to unless WHATSAPP_PHONE_NUMBER_ID and
 * WHATSAPP_ACCESS_TOKEN are set (src/server/messaging/config.ts), same as every AI provider in this app.
 */
export class WhatsAppProvider implements MessageProvider {
  constructor(private readonly config: WhatsAppConfig) {}

  async send(message: OutboundMessage): Promise<SendResult> {
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/v20.0/${this.config.phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: message.to,
          type: "text",
          text: { body: message.body },
        }),
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
      });
    } catch (error) {
      console.error("[messaging:whatsapp] request failed:", error instanceof Error ? error.message : error);
      return { status: "failed", errorCode: "whatsapp_unavailable" };
    }
    const text = await response.text().catch(() => "");
    if (!response.ok) {
      console.error(`[messaging:whatsapp] provider rejected the message (HTTP ${response.status}): ${text.slice(0, 200)}`);
      return { status: "failed", errorCode: `whatsapp_http_${response.status}` };
    }
    try {
      const json = JSON.parse(text) as { messages?: { id?: string }[] };
      const id = json.messages?.[0]?.id;
      return id ? { status: "sent", providerMessageId: id } : { status: "failed", errorCode: "whatsapp_bad_response" };
    } catch {
      return { status: "failed", errorCode: "whatsapp_bad_response" };
    }
  }
}
