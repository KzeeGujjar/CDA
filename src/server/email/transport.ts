import { appendFile } from "node:fs/promises";
import { emailConfig } from "@/server/env";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Sends one email through the configured transport (EMAIL_TRANSPORT):
 *   resend - production. Plain HTTPS call to Resend's API (needs RESEND_API_KEY, EMAIL_FROM).
 *            Swapping providers means adding another case here; nothing else changes.
 *   log    - local development only: prints the message (including its link) to the server console.
 *   file   - automated tests only: appends JSON lines to EMAIL_OUTBOX_FILE.
 * `log` is refused in production and `file` needs an explicit extra opt-in, because both expose
 * one-time login links outside the recipient's inbox.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const config = emailConfig();

  if (config.transport === "log") {
    console.info(`[email:log] to=${message.to} subject="${message.subject}"\n${message.text}\n`);
    return;
  }

  if (config.transport === "file") {
    await appendFile(
      config.outboxFile!,
      JSON.stringify({ ...message, sentAt: new Date().toISOString() }) + "\n",
      "utf8"
    );
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${config.resendApiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: config.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    // Never include the request (it contains the link) or the API key in the error.
    throw new Error(`Email provider rejected the message (HTTP ${response.status}).`);
  }
}
