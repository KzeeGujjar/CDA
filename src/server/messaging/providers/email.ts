import { sendEmail } from "@/server/email/transport";
import type { MessageProvider, OutboundMessage, SendResult } from "../provider";

/**
 * The email channel, on top of the transport this app already uses for password-reset/verification mail
 * (src/server/email/transport.ts): log in development, a file outbox in tests, Resend in production. Real in
 * every mode — there is no separate "fake" path for this channel, since the underlying transport already has one.
 */
export class EmailProvider implements MessageProvider {
  async send(message: OutboundMessage): Promise<SendResult> {
    try {
      await sendEmail({
        to: message.to,
        subject: message.subject?.trim() || "New message",
        text: message.body,
        html: `<p>${escapeHtml(message.body).replace(/\n/g, "<br>")}</p>`,
      });
      return { status: "sent" };
    } catch (error) {
      console.error("[messaging:email] send failed:", error instanceof Error ? error.message : error);
      return { status: "failed", errorCode: "email_provider_error" };
    }
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
