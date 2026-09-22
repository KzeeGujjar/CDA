import { after } from "next/server";

/**
 * Runs work AFTER the response has been sent (Next.js `after`, which keeps a serverless function alive
 * until it finishes). Used for sending email so the request's latency is identical whether or not the
 * account exists, which stops timing from revealing registered addresses. Failures are logged, never
 * surfaced to the caller. Outside a request (scripts) it simply runs in the background.
 */
export function defer(task: () => Promise<void>): void {
  const run = async () => {
    try {
      await task();
    } catch (error) {
      console.error("[deferred task failed]", error instanceof Error ? error.message : error);
    }
  };
  try {
    after(run);
  } catch {
    void run();
  }
}
