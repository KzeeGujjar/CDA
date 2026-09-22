/**
 * Live probe of a REAL Supabase project's storage setup. Run it after applying the migration to your
 * project (the automated tests can only use a fake Storage server, so this is the check that matters):
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... [SUPABASE_ANON_KEY=...] npm run storage:check
 *
 * For each of the four buckets it verifies the bucket is private, then uploads a tiny test object through
 * the same code the app uses, and confirms that: the public URL does not serve it, a request with only the
 * anon key does not read it, a signed link works, a tampered link and an expired link do not, and a
 * removed object is gone. It cleans up after itself. Exit code 1 if anything is exposed or fails.
 * It writes only objects named _storage-check/* and deletes them.
 */
import { randomUUID } from "node:crypto";
import { storageConfig } from "@/server/env";
import { ALL_BUCKETS } from "@/server/storage/file-rules";
import { SupabaseObjectStorage } from "@/server/storage/object-storage";

try {
  process.loadEnvFile(".env");
} catch {
  // environment provided externally
}

// A 1x1 PNG, so every bucket's MIME allow-list accepts it.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const results: { name: string; pass: boolean; detail?: string }[] = [];
const check = (name: string, pass: boolean, detail = "") => results.push({ name, pass, detail });

async function main() {
  const { url, serviceRoleKey } = storageConfig();
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const storage = new SupabaseObjectStorage(url, serviceRoleKey);

  for (const bucket of ALL_BUCKETS) {
    const path = `_storage-check/${randomUUID()}.png`;
    const label = (s: string) => `${bucket}: ${s}`;
    try {
      await storage.assertBucketPrivate(bucket);
      check(label("bucket exists and is private"), true);
    } catch (e) {
      check(label("bucket exists and is private"), false, (e as Error).message);
      continue;
    }
    try {
      const ticket = await storage.createSignedUploadUrl(bucket, path);
      const put = await fetch(ticket.url, {
        method: "PUT",
        headers: { "content-type": "image/png", "x-upsert": "false" },
        body: new Uint8Array(PNG),
      });
      check(label("signed upload works"), put.ok, `HTTP ${put.status}`);
      if (!put.ok) continue;

      const publicRes = await fetch(`${url}/storage/v1/object/public/${bucket}/${path}`);
      check(label("the public URL does NOT serve the object"), publicRes.status !== 200, `HTTP ${publicRes.status}`);
      const bare = await fetch(`${url}/storage/v1/object/${bucket}/${path}`);
      check(label("an unauthenticated request does NOT serve the object"), bare.status !== 200, `HTTP ${bare.status}`);
      if (anonKey) {
        const anonRes = await fetch(`${url}/storage/v1/object/authenticated/${bucket}/${path}`, {
          headers: { authorization: `Bearer ${anonKey}`, apikey: anonKey },
        });
        check(label("the anon key alone does NOT read the object"), anonRes.status !== 200, `HTTP ${anonRes.status}`);
        const listRes = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
          method: "POST",
          headers: { authorization: `Bearer ${anonKey}`, apikey: anonKey, "content-type": "application/json" },
          body: JSON.stringify({ prefix: "_storage-check", limit: 10 }),
        });
        const listed = listRes.ok ? ((await listRes.json()) as unknown[]).length : 0;
        check(
          label("the anon key alone cannot list objects"),
          listed === 0,
          `${listed} listed (HTTP ${listRes.status})`
        );
      }

      const signed = await storage.createSignedDownloadUrl(bucket, path, 60);
      const ok = await fetch(signed);
      check(
        label("a signed link serves the object"),
        ok.status === 200 && (await ok.arrayBuffer()).byteLength === PNG.length,
        `HTTP ${ok.status}`
      );
      const tampered = await fetch(signed.replace(/token=[^&]+/, "token=forged.token.value"));
      check(label("a tampered signed link is refused"), tampered.status !== 200, `HTTP ${tampered.status}`);

      const shortLived = await storage.createSignedDownloadUrl(bucket, path, 1);
      await new Promise((r) => setTimeout(r, 2500));
      const expired = await fetch(shortLived);
      check(label("an expired signed link is refused"), expired.status !== 200, `HTTP ${expired.status}`);

      const overwrite = await fetch(ticket.url, {
        method: "PUT",
        headers: { "content-type": "image/png", "x-upsert": "false" },
        body: new Uint8Array(PNG),
      });
      check(
        label("a used upload link cannot overwrite the object"),
        overwrite.status !== 200,
        `HTTP ${overwrite.status}`
      );

      const blocked = await storage.createSignedUploadUrl(bucket, path).then(
        () => false,
        () => true
      );
      check(label("a new upload link for an existing object is refused (no upsert)"), blocked);
    } catch (e) {
      check(label("probe ran without errors"), false, (e as Error).message);
    } finally {
      await storage.removeObjects(bucket, [path]).catch(() => undefined);
      const info = await storage.getObjectInfo(bucket, path).catch(() => "error" as const);
      check(label("the test object was removed"), info === null);
    }
  }

  const width = Math.max(...results.map((r) => r.name.length));
  for (const r of results)
    console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name.padEnd(width)}${r.pass || !r.detail ? "" : `  (${r.detail})`}`);
  const failed = results.filter((r) => !r.pass).length;
  console.log(
    failed
      ? `\n${failed} check(s) FAILED. Do not use these buckets for real documents until fixed.`
      : `\nAll ${results.length} checks passed.`
  );
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("Live check could not run:", (error as Error).message);
  process.exit(1);
});
