import type { MessageProvider, OutboundMessage, SendResult } from "../provider";

/**
 * website_chat and ai_agent have no external provider: the "channel" is this application itself, so a message
 * is delivered the instant it is saved — there is nothing to call out to. Used by the registry for both.
 */
export class InternalProvider implements MessageProvider {
  async send(_message: OutboundMessage): Promise<SendResult> {
    return { status: "sent" };
  }
}
