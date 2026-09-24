import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { storageConfig } from "@/server/env";
import { AppError } from "@/server/lib/errors";
import { MAGIC_BYTES_NEEDED } from "./file-rules";

/**
 * The only place that talks to Supabase Storage. Everything else depends on the small ObjectStorage
 * interface, so the rest of the app never sees a Supabase type, a bucket URL or the service-role key.
 *
 * Rules enforced here:
 *  - Every bucket is checked to be PRIVATE before we use it, and again periodically. If one has been made
 *    public we refuse to issue any URL for it (fail closed) rather than expose private documents.
 *  - We never build a URL by hand. Links come from Storage itself as signed URLs with an expiry.
 *  - The only host we ever fetch from is the configured Supabase project.
 *  - Failures from Storage become one generic 502; details (which may contain object paths) go to the log only.
 */

export interface SignedUpload {
  /** PUT the file bytes here (Content-Type must equal the declared type). Valid for about 2 hours, single use. */
  url: string;
  token: string;
  path: string;
}

export interface ObjectInfo {
  size: number;
  contentType: string | null;
}

export interface ObjectListEntry {
  name: string;
  size: number | null;
  updatedAt: string | null;
}

export interface ObjectStorage {
  createSignedUploadUrl(bucket: string, path: string): Promise<SignedUpload>;
  createSignedDownloadUrl(
    bucket: string,
    path: string,
    expiresInSeconds: number,
    options?: { downloadAs?: string }
  ): Promise<string>;
  /** Many signed URLs at once (gallery). A path that could not be signed maps to null. */
  createSignedDownloadUrls(
    bucket: string,
    paths: string[],
    expiresInSeconds: number
  ): Promise<Map<string, string | null>>;
  /** null when the object does not exist. */
  getObjectInfo(bucket: string, path: string): Promise<ObjectInfo | null>;
  /** The first bytes of the object, or null when it does not exist. */
  readObjectHead(bucket: string, path: string, length?: number): Promise<Uint8Array | null>;
  removeObjects(bucket: string, paths: string[]): Promise<void>;
  /**
   * Objects directly under `prefix` (not recursive), newest bucket contents first. This is an ops/debugging
   * capability, not a read path the application uses: normal reads stay DB-driven (StoredFile rows carry
   * permission scope, soft-delete state and business metadata a bucket listing does not have) — see
   * storage-live-check.ts, which uses this to verify a bucket's real contents against what the app expects.
   */
  list(bucket: string, prefix: string, options?: { limit?: number; offset?: number }): Promise<ObjectListEntry[]>;
  /** Throws unless the bucket exists and is private. */
  assertBucketPrivate(bucket: string): Promise<void>;
}

interface StorageErrorLike {
  message?: string;
  status?: number | string;
  statusCode?: number | string;
}

const isNotFound = (error: StorageErrorLike | null | undefined) =>
  !!error &&
  (Number(error.status) === 404 || Number(error.statusCode) === 404 || /not found/i.test(error.message ?? ""));

function unavailable(action: string, error: unknown): AppError {
  // The message can contain object paths (organization ids), so it is logged, never returned.
  console.error(`[storage] ${action} failed:`, error instanceof Error ? error.message : error);
  return new AppError(502, "storage_unavailable", "File storage is temporarily unavailable.");
}

/** How long a "this bucket is private" check is trusted. Re-checked afterwards, so a bucket someone makes public is noticed. */
const privateCheckTtlMs = () => {
  const seconds = Number(process.env.STORAGE_PRIVATE_CHECK_TTL_SECONDS ?? 300);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 300_000;
};

export class SupabaseObjectStorage implements ObjectStorage {
  private readonly client: SupabaseClient;
  private readonly origin: string;
  private readonly privateUntil = new Map<string, number>();

  constructor(url: string, serviceRoleKey: string) {
    this.origin = new URL(url).origin;
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  async assertBucketPrivate(bucket: string): Promise<void> {
    const until = this.privateUntil.get(bucket) ?? 0;
    if (until > Date.now()) return;
    const { data, error } = await this.client.storage.getBucket(bucket);
    if (error || !data) throw unavailable(`checking bucket ${bucket}`, error);
    if (data.public) {
      this.privateUntil.delete(bucket);
      console.error(`[storage] bucket "${bucket}" is PUBLIC. Refusing to use it. Make it private in Supabase.`);
      throw new AppError(503, "storage_misconfigured", "File storage is not configured securely.");
    }
    this.privateUntil.set(bucket, Date.now() + privateCheckTtlMs());
  }

  async createSignedUploadUrl(bucket: string, path: string): Promise<SignedUpload> {
    await this.assertBucketPrivate(bucket);
    // upsert stays false: a signed URL can create this exact object once, never overwrite anything.
    const { data, error } = await this.client.storage.from(bucket).createSignedUploadUrl(path);
    if (error || !data) throw unavailable("creating an upload URL", error);
    this.assertOwnOrigin(data.signedUrl);
    return { url: data.signedUrl, token: data.token, path: data.path };
  }

  async createSignedDownloadUrl(
    bucket: string,
    path: string,
    expiresInSeconds: number,
    options: { downloadAs?: string } = {}
  ): Promise<string> {
    await this.assertBucketPrivate(bucket);
    const { data, error } = await this.client.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds, options.downloadAs ? { download: options.downloadAs } : undefined);
    if (error || !data) throw unavailable("creating a download URL", error);
    this.assertOwnOrigin(data.signedUrl);
    return data.signedUrl;
  }

  async createSignedDownloadUrls(
    bucket: string,
    paths: string[],
    expiresInSeconds: number
  ): Promise<Map<string, string | null>> {
    const result = new Map<string, string | null>();
    if (!paths.length) return result;
    await this.assertBucketPrivate(bucket);
    const { data, error } = await this.client.storage.from(bucket).createSignedUrls(paths, expiresInSeconds);
    if (error || !data) throw unavailable("creating download URLs", error);
    for (const item of data) {
      if (item.path) result.set(item.path, item.signedUrl && !item.error ? item.signedUrl : null);
    }
    for (const url of result.values()) if (url) this.assertOwnOrigin(url);
    return result;
  }

  async getObjectInfo(bucket: string, path: string): Promise<ObjectInfo | null> {
    const { data, error } = await this.client.storage.from(bucket).info(path);
    if (error) {
      if (isNotFound(error as StorageErrorLike)) return null;
      throw unavailable("reading object info", error);
    }
    if (!data) return null;
    return { size: Number(data.size ?? 0), contentType: data.contentType ?? null };
  }

  async readObjectHead(bucket: string, path: string, length = MAGIC_BYTES_NEEDED): Promise<Uint8Array | null> {
    let url: string;
    try {
      url = await this.createSignedDownloadUrl(bucket, path, 60);
    } catch (error) {
      if (error instanceof AppError && error.status === 502) {
        // The object may simply not exist yet; distinguish that from an outage.
        if ((await this.getObjectInfo(bucket, path)) === null) return null;
      }
      throw error;
    }
    const response = await fetch(url, {
      headers: { range: `bytes=0-${length - 1}` },
      signal: AbortSignal.timeout(10_000),
    }).catch((error) => {
      throw unavailable("reading the start of an object", error);
    });
    if (response.status === 404) return null;
    if (response.status !== 200 && response.status !== 206) {
      throw unavailable("reading the start of an object", new Error(`HTTP ${response.status}`));
    }
    return new Uint8Array((await response.arrayBuffer()).slice(0, length));
  }

  async removeObjects(bucket: string, paths: string[]): Promise<void> {
    if (!paths.length) return;
    const { error } = await this.client.storage.from(bucket).remove(paths);
    if (error) throw unavailable("removing objects", error);
  }

  async list(bucket: string, prefix: string, options: { limit?: number; offset?: number } = {}): Promise<ObjectListEntry[]> {
    await this.assertBucketPrivate(bucket);
    const { data, error } = await this.client.storage.from(bucket).list(prefix, {
      limit: options.limit ?? 100,
      offset: options.offset ?? 0,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw unavailable("listing objects", error);
    // A "folder" placeholder has no id; only real objects are meaningful to a caller.
    return (data ?? [])
      .filter((entry) => entry.id !== null)
      .map((entry) => ({
        name: entry.name,
        size: typeof entry.metadata?.size === "number" ? entry.metadata.size : null,
        updatedAt: entry.updated_at ?? null,
      }));
  }

  /** A signed URL must point at our own Supabase project. Anything else is a misconfiguration or an attack. */
  private assertOwnOrigin(url: string): void {
    if (new URL(url).origin !== this.origin) {
      throw unavailable("validating a signed URL", new Error("signed URL points at an unexpected host"));
    }
  }
}

const globalForStorage = globalThis as unknown as { __cdaObjectStorage?: ObjectStorage };

/** The process-wide storage client. Missing configuration is a 503 for the file endpoints only. */
export function getObjectStorage(): ObjectStorage {
  if (!globalForStorage.__cdaObjectStorage) {
    let config: ReturnType<typeof storageConfig>;
    try {
      config = storageConfig();
    } catch (error) {
      console.error(`[storage] ${(error as Error).message}`);
      throw new AppError(503, "storage_not_configured", "File storage is not configured.");
    }
    globalForStorage.__cdaObjectStorage = new SupabaseObjectStorage(config.url, config.serviceRoleKey);
  }
  return globalForStorage.__cdaObjectStorage;
}
