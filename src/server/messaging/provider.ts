/**
 * The one shape every messaging channel is adapted to. The messages service (src/server/modules/messages)
 * depends on this interface only — never on a channel provider's SDK, endpoint or credentials — so adding a
 * sixth channel, or swapping WhatsApp Cloud API for a different vendor, is a new adapter file plus one line in
 * the registry, never a change to the database or the service layer. Mirrors the AI provider seam
 * (src/server/ai/providers/types.ts) and the object storage seam (src/server/storage/object-storage.ts).
 */

export interface OutboundMessage {
  /** The channel's own address for the contact: a phone number, an email address, a chat session id. */
  to: string;
  body: string;
  /** Used by channels that have one (email); ignored by the rest. */
  subject?: string;
}

export interface SendResult {
  status: "sent" | "failed";
  /** The provider's own id for this message, when it succeeded — used for idempotent webhook dedupe later. */
  providerMessageId?: string;
  /** Short, safe-to-store reason when status is "failed". Never a raw provider error (may contain secrets). */
  errorCode?: string;
}

export interface MessageProvider {
  send(message: OutboundMessage): Promise<SendResult>;
}
