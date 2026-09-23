import { getPlatformDb } from "@/server/db/clients";
import { notFound } from "@/server/lib/errors";

/**
 * Reads a document by its public share token, with no session and no organization: the same "look up by an
 * opaque token on the platform client" shape as src/server/auth/flows/password-reset.ts, here for
 * GET /api/v1/generated-documents/shared/[token] (a public route — see
 * src/app/api/v1/generated-documents/shared/[token]/route.ts). This lives under src/server/platform, not
 * src/server/modules/documents, because only src/server/{db,auth,
 * http,platform} may import the RLS-bypassing platform client (enforced by eslint.config.mjs).
 *
 * Never returns cost data, variables, or anything beyond what the document itself already shows a customer.
 */
export async function getSharedDocument(token: string): Promise<{ title: string; type: string; content: string; generatedAt: string }> {
  if (!/^[\w-]{20,64}$/.test(token)) throw notFound("This link is invalid or has expired.");
  const db = getPlatformDb();
  const row = await db.generatedDocument.findUnique({ where: { shareToken: token } });
  if (!row || !row.shareExpiresAt || row.shareExpiresAt < new Date()) throw notFound("This link is invalid or has expired.");
  return { title: row.title, type: row.type.toLowerCase(), content: row.content, generatedAt: row.createdAt.toISOString() };
}
