import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { FileKind, StoredFile } from "@/generated/prisma/client";
import type { AuthContext } from "@/server/auth/context";
import { requirePermission, scopeAllows, scopeWhere } from "@/server/auth/authorize";
import { withTenant, type TenantDb } from "@/server/db/tenant";
import { AppError, badRequest, notFound, tooManyRequests } from "@/server/lib/errors";
import type { RequestMeta } from "@/server/http/api-route";
import { recordAudit } from "@/server/modules/audit/record";
import {
  baseContentType,
  buildObjectPath,
  DOCUMENT_TYPES_BY_KIND,
  KIND_RULES,
  matchesMagicBytes,
  MAX_DOCUMENTS_PER_PARENT,
  MAX_PENDING_UPLOADS_PER_USER,
  MAX_PHOTOS_PER_VEHICLE,
  PENDING_UPLOAD_TTL_HOURS,
  sanitizeFileName,
  validateUploadRequest,
} from "@/server/storage/file-rules";
import { getObjectStorage } from "@/server/storage/object-storage";

/**
 * Vehicle photos, and vehicle / customer / deal documents, in private Supabase Storage.
 *
 * The flow, and where each security decision is made:
 *   1. POST .../upload-url   The caller is authenticated, holds the permission, and can see the parent record
 *                            (tenant + scope). The server validates name, type and size, records a PENDING
 *                            row, builds the object path itself, and returns a single-use signed upload URL.
 *   2. (browser) PUT bytes   Straight to Storage: no file passes through our servers. The bucket itself
 *                            enforces the size limit and the MIME allow-list a second time.
 *   3. POST .../complete     The server looks at what actually arrived (exists, exact size, declared type,
 *                            and the real file signature). Anything that does not match is deleted.
 *   4. GET  .../download-url A short-lived signed link, issued only after the tenant/permission/scope check,
 *                            and audited. There is no public URL for any object.
 */

// ── request schemas ──────────────────────────────────────────────────────────────────────────────

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "is not a valid id");
const fileFields = {
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(3).max(120),
  sizeBytes: z.number().int().positive(),
};

export const photoUploadSchema = z.strictObject(fileFields);
export const documentUploadSchema = z.strictObject({
  parent: z.strictObject({ type: z.enum(["vehicle", "customer", "deal"]), id: idSchema }),
  documentType: z.string().trim().min(1).max(40),
  ...fileFields,
});
export const photoUpdateSchema = z
  .strictObject({
    isPrimary: z.literal(true).optional(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
  })
  .refine((v) => v.isPrimary !== undefined || v.sortOrder !== undefined, { message: "Nothing to update." });
export const documentListQuerySchema = z
  .strictObject({ vehicleId: idSchema.optional(), customerId: idSchema.optional(), dealId: idSchema.optional() })
  .refine((q) => [q.vehicleId, q.customerId, q.dealId].filter(Boolean).length === 1, {
    message: "Give exactly one of vehicleId, customerId or dealId.",
  });
export const downloadQuerySchema = z.strictObject({
  disposition: z.enum(["attachment", "inline"]).default("attachment"),
});

const parse = <T>(schema: z.ZodType<T>, query: URLSearchParams): T => schema.parse(Object.fromEntries(query.entries()));

// ── response shapes ──────────────────────────────────────────────────────────────────────────────

export interface FileDto {
  id: string;
  kind: string;
  status: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  documentType: string | null;
  isPrimary: boolean;
  sortOrder: number;
  uploadedById: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface PhotoDto extends FileDto {
  /** Signed link, valid until urlExpiresAt. null if it could not be created. */
  url: string | null;
  urlExpiresAt: string;
}

export interface UploadTicket {
  file: FileDto;
  upload: {
    method: "PUT";
    url: string;
    /** For supabase-js: storage.from(bucket).uploadToSignedUrl(path, token, file). */
    token: string;
    bucket: string;
    path: string;
    headers: Record<string, string>;
    maxBytes: number;
    /** How long the upload link stays valid (set by Supabase). Complete the upload within this time. */
    expiresInSeconds: number;
  };
}

export interface DownloadDto {
  url: string;
  expiresInSeconds: number;
  expiresAt: string;
  fileName: string;
  contentType: string;
  disposition: "attachment" | "inline";
}

const toDto = (f: StoredFile): FileDto => ({
  id: f.id,
  kind: f.kind.toLowerCase(),
  status: f.status.toLowerCase(),
  fileName: f.originalName,
  contentType: f.contentType,
  sizeBytes: f.sizeBytes,
  documentType: f.documentType,
  isPrimary: f.isPrimary,
  sortOrder: f.sortOrder,
  uploadedById: f.uploadedById,
  createdAt: f.createdAt.toISOString(),
  completedAt: f.completedAt?.toISOString() ?? null,
});

// ── parents: who may see the record a file hangs on ──────────────────────────────────────────────

type ParentType = "vehicle" | "customer" | "deal";
const DOCUMENT_KIND: Record<ParentType, FileKind> = {
  vehicle: "VEHICLE_DOCUMENT",
  customer: "CUSTOMER_DOCUMENT",
  deal: "DEAL_DOCUMENT",
};

/**
 * The parent must exist in the caller's organization AND be inside their scope; otherwise it is a 404,
 * exactly as if it did not exist. A role that cannot read that kind of record at all gets a 403.
 * `write` (vehicle photos only) requires vehicles:update instead of vehicles:read.
 */
async function assertParentAccess(
  ctx: AuthContext,
  db: TenantDb,
  type: ParentType,
  id: string,
  mode: "read" | "write" = "read"
): Promise<void> {
  if (type === "vehicle") {
    const scope = requirePermission(ctx, "vehicles", mode === "write" ? "update" : "read");
    const row = await db.vehicle.findFirst({ where: { id }, select: { id: true, branchId: true } });
    if (!row || !scopeAllows(ctx, scope, { branchField: "branchId" }, row)) throw notFound("Vehicle not found.");
  } else if (type === "customer") {
    const scope = requirePermission(ctx, "customers", "read");
    const row = await db.customer.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!row || !scopeAllows(ctx, scope, {}, row)) throw notFound("Customer not found.");
  } else {
    const scope = requirePermission(ctx, "deals", "read");
    const row = await db.deal.findFirst({ where: { id }, select: { id: true, salespersonId: true, branchId: true } });
    if (!row || !scopeAllows(ctx, scope, { ownerField: "salespersonId", branchField: "branchId" }, row)) {
      throw notFound("Deal not found.");
    }
  }
}

const parentOf = (f: Pick<StoredFile, "kind" | "vehicleId" | "customerId" | "dealId">): [ParentType, string] =>
  f.vehicleId ? ["vehicle", f.vehicleId] : f.customerId ? ["customer", f.customerId] : ["deal", f.dealId!];

// ── issuing an upload ────────────────────────────────────────────────────────────────────────────

interface UploadRequest {
  kind: FileKind;
  parentType: ParentType;
  parentId: string;
  documentType?: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

async function issueUpload(ctx: AuthContext, req: UploadRequest, meta?: RequestMeta): Promise<UploadTicket> {
  const rules = KIND_RULES[req.kind];
  const issues = validateUploadRequest(req.kind, req);
  if (req.kind !== "VEHICLE_PHOTO") {
    const allowed = DOCUMENT_TYPES_BY_KIND[req.kind as keyof typeof DOCUMENT_TYPES_BY_KIND] as readonly string[];
    if (!req.documentType || !allowed.includes(req.documentType)) {
      issues.push({ path: "documentType", message: `must be one of: ${allowed.join(", ")}.` });
    }
  }
  if (issues.length) throw new AppError(400, "validation_error", "Invalid request.", {}, issues);

  const contentType = baseContentType(req.contentType);
  const fileId = randomUUID();
  const objectPath = buildObjectPath({
    organizationId: ctx.organizationId,
    parentId: req.parentId,
    fileId,
    contentType,
  });
  const parentColumn: { vehicleId?: string; customerId?: string; dealId?: string } = {};
  if (req.parentType === "vehicle") parentColumn.vehicleId = req.parentId;
  else if (req.parentType === "customer") parentColumn.customerId = req.parentId;
  else parentColumn.dealId = req.parentId;

  const pending = await withTenant(ctx, async (db) => {
    await assertParentAccess(ctx, db, req.parentType, req.parentId, req.kind === "VEHICLE_PHOTO" ? "write" : "read");

    const live = { status: { not: "DELETED" as const } };
    const existing = await db.storedFile.count({ where: { kind: req.kind, ...parentColumn, ...live } });
    const limit = req.kind === "VEHICLE_PHOTO" ? MAX_PHOTOS_PER_VEHICLE : MAX_DOCUMENTS_PER_PARENT;
    if (existing >= limit) {
      throw new AppError(409, "file_limit_reached", `This record already has the maximum of ${limit} files.`);
    }
    const since = new Date(Date.now() - PENDING_UPLOAD_TTL_HOURS * 3_600_000);
    const stale = await db.storedFile.count({
      where: { uploadedById: ctx.userId, status: "PENDING", createdAt: { gt: since } },
    });
    if (stale >= MAX_PENDING_UPLOADS_PER_USER)
      throw tooManyRequests(60, "Too many unfinished uploads. Finish or wait.");

    const row = await db.storedFile.create({
      data: {
        id: fileId,
        organizationId: ctx.organizationId,
        kind: req.kind,
        status: "PENDING",
        bucket: rules.bucket,
        objectPath,
        ...parentColumn,
        documentType: req.kind === "VEHICLE_PHOTO" ? null : req.documentType,
        originalName: sanitizeFileName(req.fileName),
        contentType,
        sizeBytes: req.sizeBytes,
        uploadedById: ctx.userId,
      },
    });
    await recordAudit(db, ctx, {
      action: "file.upload_requested",
      entityType: "file",
      entityId: row.id,
      metadata: { kind: req.kind, contentType, sizeBytes: req.sizeBytes },
      ...meta,
    });
    return row;
  });

  try {
    const signed = await getObjectStorage().createSignedUploadUrl(pending.bucket, pending.objectPath);
    return {
      file: toDto(pending),
      upload: {
        method: "PUT",
        url: signed.url,
        token: signed.token,
        bucket: pending.bucket,
        path: signed.path,
        headers: { "content-type": contentType, "x-upsert": "false" },
        maxBytes: rules.maxBytes,
        expiresInSeconds: 7200,
      },
    };
  } catch (error) {
    // No usable upload was handed out: retire the pending row so it does not count against the user.
    await withTenant(ctx, (db) =>
      db.storedFile.update({
        where: { id: pending.id },
        data: { status: "DELETED", deletedAt: new Date(), objectRemoved: true },
      })
    ).catch(() => undefined);
    throw error;
  }
}

export function requestVehiclePhotoUpload(
  ctx: AuthContext,
  vehicleId: string,
  body: z.infer<typeof photoUploadSchema>,
  meta?: RequestMeta
) {
  requirePermission(ctx, "vehicles", "update");
  return issueUpload(ctx, { kind: "VEHICLE_PHOTO", parentType: "vehicle", parentId: vehicleId, ...body }, meta);
}

export function requestDocumentUpload(
  ctx: AuthContext,
  body: z.infer<typeof documentUploadSchema>,
  meta?: RequestMeta
) {
  requirePermission(ctx, "documents", "create");
  const { parent, ...rest } = body;
  return issueUpload(
    ctx,
    { kind: DOCUMENT_KIND[parent.type], parentType: parent.type, parentId: parent.id, ...rest },
    meta
  );
}

// ── completing an upload ─────────────────────────────────────────────────────────────────────────

/** Discards an upload that is not what it claimed to be: the object is removed and the row tombstoned. */
async function rejectUpload(ctx: AuthContext, file: StoredFile, reason: string, meta?: RequestMeta): Promise<never> {
  let removed = false;
  try {
    await getObjectStorage().removeObjects(file.bucket, [file.objectPath]);
    removed = true;
  } catch {
    // the cleanup job retries removals that failed
  }
  await withTenant(ctx, async (db) => {
    await db.storedFile.update({
      where: { id: file.id },
      data: { status: "DELETED", deletedAt: new Date(), objectRemoved: removed, isPrimary: false },
    });
    await recordAudit(db, ctx, {
      action: "file.upload_rejected",
      entityType: "file",
      entityId: file.id,
      outcome: "FAILURE",
      metadata: { reason },
      ...meta,
    });
  });
  throw badRequest("The uploaded file was rejected because it does not match what was declared.", "invalid_upload");
}

async function completeUpload(
  ctx: AuthContext,
  fileId: string,
  expect: { photoOfVehicle: string } | { document: true },
  meta?: RequestMeta
): Promise<StoredFile> {
  const file = await withTenant(ctx, async (db) => {
    const row = await db.storedFile.findFirst({ where: { id: fileId } });
    // Only the uploader completes an upload, and only through the route that matches the file kind.
    const kindMatches =
      "photoOfVehicle" in expect
        ? row?.kind === "VEHICLE_PHOTO" && row.vehicleId === expect.photoOfVehicle
        : row !== null && row.kind !== "VEHICLE_PHOTO";
    if (!row || !kindMatches || row.uploadedById !== ctx.userId || row.status === "DELETED") {
      throw notFound("File not found.");
    }
    const [type, id] = parentOf(row);
    await assertParentAccess(ctx, db, type, id, row.kind === "VEHICLE_PHOTO" ? "write" : "read");
    return row;
  });
  if (file.status === "ACTIVE") return file; // completing twice is harmless

  const storage = getObjectStorage();
  const info = await storage.getObjectInfo(file.bucket, file.objectPath);
  if (!info) throw new AppError(409, "upload_not_found", "The file has not been uploaded yet.");
  if (info.size !== file.sizeBytes) return rejectUpload(ctx, file, "size_mismatch", meta);
  if (info.contentType && baseContentType(info.contentType) !== file.contentType) {
    return rejectUpload(ctx, file, "content_type_mismatch", meta);
  }
  const head = await storage.readObjectHead(file.bucket, file.objectPath);
  if (!head || !matchesMagicBytes(file.contentType, head)) return rejectUpload(ctx, file, "signature_mismatch", meta);

  const activate = (makePrimary: boolean) =>
    withTenant(ctx, async (db) => {
      let isPrimary = false;
      let sortOrder = 0;
      if (file.kind === "VEHICLE_PHOTO") {
        const scope = {
          vehicleId: file.vehicleId,
          kind: "VEHICLE_PHOTO" as const,
          status: { not: "DELETED" as const },
        };
        isPrimary = makePrimary && (await db.storedFile.count({ where: { ...scope, isPrimary: true } })) === 0;
        // Position after the photos that are already live (this one is still pending, so it is not counted).
        const live = { ...scope, status: "ACTIVE" as const };
        sortOrder =
          ((await db.storedFile.aggregate({ where: live, _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1;
      }
      const row = await db.storedFile.update({
        where: { id: file.id },
        data: { status: "ACTIVE", completedAt: new Date(), isPrimary, sortOrder },
      });
      await recordAudit(db, ctx, {
        action: "file.uploaded",
        entityType: "file",
        entityId: file.id,
        metadata: { kind: file.kind, documentType: file.documentType, sizeBytes: file.sizeBytes },
        ...meta,
      });
      return row;
    });
  try {
    return await activate(true);
  } catch (error) {
    // Two photos finishing at once can both try to become the primary; the loser retries as a normal photo.
    if ((error as { code?: string }).code === "P2002") return activate(false);
    throw error;
  }
}

export async function completeVehiclePhotoUpload(
  ctx: AuthContext,
  vehicleId: string,
  fileId: string,
  meta?: RequestMeta
): Promise<PhotoDto> {
  requirePermission(ctx, "vehicles", "update");
  const row = await completeUpload(ctx, fileId, { photoOfVehicle: vehicleId }, meta);
  return (await withSignedUrls([row]))[0];
}

export async function completeDocumentUpload(ctx: AuthContext, fileId: string, meta?: RequestMeta): Promise<FileDto> {
  requirePermission(ctx, "documents", "create");
  return toDto(await completeUpload(ctx, fileId, { document: true }, meta));
}

// ── vehicle photos ───────────────────────────────────────────────────────────────────────────────

async function withSignedUrls(rows: StoredFile[]): Promise<PhotoDto[]> {
  if (!rows.length) return [];
  const ttl = KIND_RULES.VEHICLE_PHOTO.downloadUrlSeconds;
  const urls = await getObjectStorage().createSignedDownloadUrls(
    KIND_RULES.VEHICLE_PHOTO.bucket,
    rows.map((r) => r.objectPath),
    ttl
  );
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  return rows.map((r) => ({ ...toDto(r), url: urls.get(r.objectPath) ?? null, urlExpiresAt: expiresAt }));
}

export async function listVehiclePhotos(ctx: AuthContext, vehicleId: string): Promise<PhotoDto[]> {
  requirePermission(ctx, "vehicles", "read");
  const rows = await withTenant(ctx, async (db) => {
    await assertParentAccess(ctx, db, "vehicle", vehicleId, "read");
    return db.storedFile.findMany({
      where: { vehicleId, kind: "VEHICLE_PHOTO", status: "ACTIVE" },
      orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    });
  });
  return withSignedUrls(rows);
}

/**
 * One signed thumbnail per vehicle (its primary photo, or the first by display order if none is marked primary
 * yet), for a list of vehicles at once — used by the vehicles list/detail endpoints so a grid of cards costs one
 * extra query, not one Storage round trip per vehicle. Missing entries simply have no photo. Storage being down
 * degrades to "no thumbnails" rather than failing the vehicle list: `db` is the caller's own tenant transaction,
 * so no separate permission check is made here.
 */
export async function primaryPhotosByVehicle(db: TenantDb, vehicleIds: string[]): Promise<Map<string, PhotoDto>> {
  const result = new Map<string, PhotoDto>();
  if (!vehicleIds.length) return result;
  const rows = await db.storedFile.findMany({
    where: { vehicleId: { in: vehicleIds }, kind: "VEHICLE_PHOTO", status: "ACTIVE" },
    orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const firstPerVehicle = new Map<string, StoredFile>();
  for (const row of rows) {
    if (row.vehicleId && !firstPerVehicle.has(row.vehicleId)) firstPerVehicle.set(row.vehicleId, row);
  }
  if (!firstPerVehicle.size) return result;
  try {
    const dtos = await withSignedUrls([...firstPerVehicle.values()]);
    const byFileId = new Map(dtos.map((d) => [d.id, d]));
    for (const [vehicleId, row] of firstPerVehicle) {
      const dto = byFileId.get(row.id);
      if (dto) result.set(vehicleId, dto);
    }
  } catch (error) {
    console.error("[files] could not sign vehicle thumbnail URLs:", error instanceof Error ? error.message : error);
  }
  return result;
}

export async function updateVehiclePhoto(
  ctx: AuthContext,
  vehicleId: string,
  fileId: string,
  body: z.infer<typeof photoUpdateSchema>,
  meta?: RequestMeta
): Promise<FileDto> {
  requirePermission(ctx, "vehicles", "update");
  const row = await withTenant(ctx, async (db) => {
    await assertParentAccess(ctx, db, "vehicle", vehicleId, "write");
    const file = await db.storedFile.findFirst({
      where: { id: fileId, vehicleId, kind: "VEHICLE_PHOTO", status: "ACTIVE" },
    });
    if (!file) throw notFound("Photo not found.");
    if (body.isPrimary) {
      await db.storedFile.updateMany({
        where: { vehicleId, kind: "VEHICLE_PHOTO", isPrimary: true, status: { not: "DELETED" } },
        data: { isPrimary: false },
      });
    }
    const updated = await db.storedFile.update({
      where: { id: fileId },
      data: {
        ...(body.isPrimary ? { isPrimary: true } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      },
    });
    await recordAudit(db, ctx, {
      action: "file.updated",
      entityType: "file",
      entityId: fileId,
      metadata: { isPrimary: body.isPrimary ?? null, sortOrder: body.sortOrder ?? null },
      ...meta,
    });
    return updated;
  });
  return toDto(row);
}

// ── documents ────────────────────────────────────────────────────────────────────────────────────

export async function listDocuments(ctx: AuthContext, query: URLSearchParams): Promise<FileDto[]> {
  const scope = requirePermission(ctx, "documents", "read");
  const q = parse(documentListQuerySchema, query);
  const [type, id]: [ParentType, string] = q.vehicleId
    ? ["vehicle", q.vehicleId]
    : q.customerId
      ? ["customer", q.customerId]
      : ["deal", q.dealId!];
  const rows = await withTenant(ctx, async (db) => {
    await assertParentAccess(ctx, db, type, id, "read");
    return db.storedFile.findMany({
      where: {
        kind: DOCUMENT_KIND[type],
        ...(type === "vehicle" ? { vehicleId: id } : type === "customer" ? { customerId: id } : { dealId: id }),
        status: "ACTIVE",
        // a role limited to "own" documents sees only what it uploaded
        ...scopeWhere(ctx, scope, { ownerField: "uploadedById" }),
      },
      orderBy: { createdAt: "desc" },
    });
  });
  return rows.map(toDto);
}

/** Loads one live document the caller may access (tenant + documents scope + the parent record). */
async function loadDocument(
  ctx: AuthContext,
  db: TenantDb,
  fileId: string,
  action: "read" | "delete"
): Promise<StoredFile> {
  const scope = requirePermission(ctx, "documents", action);
  const row = await db.storedFile.findFirst({
    where: { id: fileId, status: "ACTIVE", kind: { not: "VEHICLE_PHOTO" } },
  });
  if (!row || !scopeAllows(ctx, scope, { ownerField: "uploadedById" }, row)) throw notFound("Document not found.");
  const [type, id] = parentOf(row);
  await assertParentAccess(ctx, db, type, id, "read");
  return row;
}

export async function getDocumentDownloadUrl(
  ctx: AuthContext,
  fileId: string,
  query: URLSearchParams,
  meta?: RequestMeta
): Promise<DownloadDto> {
  requirePermission(ctx, "documents", "read");
  const { disposition } = parse(downloadQuerySchema, query);
  const file = await withTenant(ctx, async (db) => {
    const row = await loadDocument(ctx, db, fileId, "read");
    if (disposition === "inline" && !KIND_RULES[row.kind].mayRenderInline(row.contentType)) {
      throw badRequest("This file type cannot be shown inline; download it instead.", "inline_not_allowed");
    }
    await recordAudit(db, ctx, {
      action: "file.download_url_issued",
      entityType: "file",
      entityId: row.id,
      metadata: { kind: row.kind, documentType: row.documentType, disposition },
      ...meta,
    });
    return row;
  });
  const ttl = KIND_RULES[file.kind].downloadUrlSeconds;
  const url = await getObjectStorage().createSignedDownloadUrl(
    file.bucket,
    file.objectPath,
    ttl,
    disposition === "attachment" ? { downloadAs: file.originalName } : {}
  );
  return {
    url,
    expiresInSeconds: ttl,
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    fileName: file.originalName,
    contentType: file.contentType,
    disposition,
  };
}

// ── deleting ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Access is revoked first (the row becomes a tombstone in the same transaction as the audit entry), then the
 * object is removed. If Storage is down the tombstone stays and the cleanup job removes the object later.
 */
async function deleteStoredFile(ctx: AuthContext, file: StoredFile, meta?: RequestMeta): Promise<void> {
  await withTenant(ctx, async (db) => {
    await db.storedFile.update({
      where: { id: file.id },
      data: { status: "DELETED", deletedAt: new Date(), isPrimary: false },
    });
    if (file.isPrimary && file.vehicleId) {
      const next = await db.storedFile.findFirst({
        where: { vehicleId: file.vehicleId, kind: "VEHICLE_PHOTO", status: "ACTIVE" },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
      if (next) await db.storedFile.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
    await recordAudit(db, ctx, {
      action: "file.deleted",
      entityType: "file",
      entityId: file.id,
      metadata: { kind: file.kind, documentType: file.documentType },
      ...meta,
    });
  });
  try {
    await getObjectStorage().removeObjects(file.bucket, [file.objectPath]);
    await withTenant(ctx, (db) => db.storedFile.update({ where: { id: file.id }, data: { objectRemoved: true } }));
  } catch {
    // left for the cleanup job (objectRemoved stays false)
  }
}

export async function deleteDocument(ctx: AuthContext, fileId: string, meta?: RequestMeta): Promise<{ deleted: true }> {
  requirePermission(ctx, "documents", "delete");
  const file = await withTenant(ctx, (db) => loadDocument(ctx, db, fileId, "delete"));
  await deleteStoredFile(ctx, file, meta);
  return { deleted: true };
}

export async function deleteVehiclePhoto(
  ctx: AuthContext,
  vehicleId: string,
  fileId: string,
  meta?: RequestMeta
): Promise<{ deleted: true }> {
  requirePermission(ctx, "vehicles", "update");
  const file = await withTenant(ctx, async (db) => {
    await assertParentAccess(ctx, db, "vehicle", vehicleId, "write");
    const row = await db.storedFile.findFirst({
      where: { id: fileId, vehicleId, kind: "VEHICLE_PHOTO", status: "ACTIVE" },
    });
    if (!row) throw notFound("Photo not found.");
    return row;
  });
  await deleteStoredFile(ctx, file, meta);
  return { deleted: true };
}
