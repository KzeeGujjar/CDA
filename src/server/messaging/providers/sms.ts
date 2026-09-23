import type { SmsConfig } from "../config";
import type { MessageProvider, OutboundMessage, SendResult } from "../provider";

/**
 * Twilio's REST API shape: POST /2010-04-01/Accounts/{sid}/Messages.json, HTTP Basic auth (sid:authToken),
 * form-encoded body. Real HTTP; unconfigured (no TWILIO_* env vars, src/server/messaging/config.ts) means this
 * adapter is never even chosen — see the registry.
 */
export class SmsProvider implements MessageProvider {
  constructor(private readonly config: SmsConfig) {}

  async send(message: OutboundMessage): Promise<SendResult> {
    const body = new URLSearchParams({ To: message.to, From: this.config.fromNumber, Body: message.body });
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
      });
    } catch (error) {
      console.error("[messaging:sms] request failed:", error instanceof Error ? error.message : error);
      return { status: "failed", errorCode: "sms_unavailable" };
    }
    const text = await response.text().catch(() => "");
    if (!response.ok) {
      console.error(`[messaging:sms] provider rejected the message (HTTP ${response.status}): ${text.slice(0, 200)}`);
      return { status: "failed", errorCode: `sms_http_${response.status}` };
    }
    try {
      const json = JSON.parse(text) as { sid?: string };
      return json.sid ? { status: "sent", providerMessageId: json.sid } : { status: "failed", errorCode: "sms_bad_response" };
    } catch {
      return { status: "failed", errorCode: "sms_bad_response" };
    }
  }
}
