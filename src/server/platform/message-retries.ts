import { getPlatformDb } from "@/server/db/clients";
import { deliverMessage } from "@/server/messaging/registry";

/**
 * Retries outbound messages a channel provider failed to send (§0.28: Background Jobs). Sending already
 * happens synchronously in the request (messages.service.ts's sendMessage/createConversation), deliberately —
 * the caller needs to know right away whether it went out. What nothing did until now is retry a transient
 * failure afterwards. Crosses organizations, so it uses the platform database client (not reachable from any
 * HTTP route; run it from a scheduled job or `npm run messages:retry`):
 *
 *   - FAILED messages, not yet retried, created within the last RETRY_WINDOW_HOURS.
 *   - Skips "provider_not_configured": retrying a channel with no credentials would just fail again.
 *   - Retried exactly once, automatically: retriedAt is stamped whether the retry succeeds or not, the same
 *     gate tasks.reminded_at uses for reminders. Anything still FAILED after that needs a human resend.
 *
 * Idempotent (retriedAt gates it), so running it twice, or concurrently, is safe.
 */
export interface MessageRetryResult {
  attempted: number;
  recovered: number;
  stillFailed: number;
}

const BATCH = 200;
const RETRY_WINDOW_HOURS = 24;

export async function runMessageRetries(options: { now?: Date } = {}): Promise<MessageRetryResult> {
  const db = getPlatformDb();
  const now = options.now ?? new Date();
  const result: MessageRetryResult = { attempted: 0, recovered: 0, stillFailed: 0 };

  const cutoff = new Date(now.getTime() - RETRY_WINDOW_HOURS * 3_600_000);
  const candidates = await db.message.findMany({
    where: {
      status: "FAILED",
      retriedAt: null,
      createdAt: { gte: cutoff },
      errorCode: { not: "provider_not_configured" },
    },
    select: { id: true, body: true, conversation: { select: { channel: true, contactHandle: true } } },
    take: BATCH,
  });

  for (const message of candidates) {
    result.attempted++;
    const outcome = await deliverMessage(message.conversation.channel, message.conversation.contactHandle, message.body);
    await db.message.update({
      where: { id: message.id },
      data: {
        status: outcome.status,
        providerMessageId: outcome.providerMessageId,
        errorCode: outcome.errorCode,
        retriedAt: now,
      },
    });
    if (outcome.status === "SENT") result.recovered++;
    else result.stillFailed++;
  }
  return result;
}
