import type { FileKind } from "@/generated/prisma/client";

/**
 * What may be stored, where, and for how long a link to it lives. Pure functions and constants only, so
 * every rule is unit-tested without a database or a storage server. The bucket-level limits configured in
 * Supabase (migration supabase_storage_policies) repeat these numbers as a second, independent layer.
 */

const MiB = 1024 * 1024;

export const BUCKETS = {
  VEHICLE_PHOTO: "vehicle-photos",
  VEHICLE_DOCUMENT: "vehicle-documents",
  CUSTOMER_DOCUMENT: "customer-documents",
  DEAL_DOCUMENT: "deal-documents",
} as const satisfies Record<FileKind, string>;

export const ALL_BUCKETS = Object.values(BUCKETS);

/** Extension for every content type we accept. There is deliberately no SVG, HTML, script or archive type. */
export const CONTENT_TYPE_EXTENSIONS: Record<string, readonly string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "application/pdf": ["pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
};

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const DOCUMENT_TYPES = Object.keys(CONTENT_TYPE_EXTENSIONS);

export interface KindRules {
  bucket: string;
  maxBytes: number;
  contentTypes: readonly string[];
  /** Lifetime of a signed download link. Short for documents (personal data), longer for gallery photos. */
  downloadUrlSeconds: number;
  /** Photos and PDFs may render in the browser; other documents always download. */
  mayRenderInline: (contentType: string) => boolean;
}

function documentRules(bucket: string): KindRules {
  return {
    bucket,
    maxBytes: 25 * MiB,
    contentTypes: DOCUMENT_TYPES,
    downloadUrlSeconds: 300,
    mayRenderInline: (t) => t === "application/pdf" || t.startsWith("image/"),
  };
}

export const KIND_RULES: Record<FileKind, KindRules> = {
  VEHICLE_PHOTO: {
    bucket: BUCKETS.VEHICLE_PHOTO,
    maxBytes: 10 * MiB,
    contentTypes: PHOTO_TYPES,
    downloadUrlSeconds: 3600,
    mayRenderInline: () => true,
  },
  VEHICLE_DOCUMENT: documentRules(BUCKETS.VEHICLE_DOCUMENT),
  CUSTOMER_DOCUMENT: documentRules(BUCKETS.CUSTOMER_DOCUMENT),
  DEAL_DOCUMENT: documentRules(BUCKETS.DEAL_DOCUMENT),
};

export const MAX_PHOTOS_PER_VEHICLE = 40;
export const MAX_DOCUMENTS_PER_PARENT = 200;
export const MAX_PENDING_UPLOADS_PER_USER = 50;
/** A pending upload never completed within this long is abandoned and cleaned up. */
export const PENDING_UPLOAD_TTL_HOURS = 24;

/** Which document types may be attached to which parent. */
export const DOCUMENT_TYPES_BY_KIND = {
  VEHICLE_DOCUMENT: [
    "registration",
    "inspection_report",
    "service_history",
    "insurance",
    "customs",
    "ownership_transfer",
    "other",
  ],
  CUSTOMER_DOCUMENT: ["emirates_id", "passport", "driving_license", "trade_license", "bank_letter", "other"],
  DEAL_DOCUMENT: ["contract", "invoice", "quotation", "payment_receipt", "ownership_transfer", "other"],
} as const satisfies Partial<Record<FileKind, readonly string[]>>;

export interface UploadIssue {
  path: string;
  message: string;
}

export function baseContentType(contentType: string): string {
  return contentType.split(";")[0].trim().toLowerCase();
}

// Characters that are never valid in a file name: control characters, path separators and wildcards, plus the
// bidirectional controls used to disguise extensions (a right-to-left override makes "invoice" + "fdp.exe"
// display as "invoiceexe.pdf"). Written as code points rather than a regex so no invisible character lives in
// this source file.
const BAD_NAME_CHARS = new Set(["\\", "/", ":", "*", "?", '"', "<", ">", "|"]);
function isUnsafeNameChar(ch: string): boolean {
  const code = ch.codePointAt(0)!;
  return (
    code < 0x20 ||
    code === 0x7f ||
    BAD_NAME_CHARS.has(ch) ||
    code === 0x200e ||
    code === 0x200f ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}
/** A safe display name (also used as the download name). Keeps Arabic/Urdu/Hindi letters. Never used in an object path. */
export function sanitizeFileName(name: string): string {
  const cleaned = [...name.normalize("NFC")]
    .map((ch) => (isUnsafeNameChar(ch) ? " " : ch))
    .join("")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .replace(/[.\s]+$/, "");
  const limited = [...cleaned].slice(0, 150).join("");
  return limited || "file";
}

function extensionOf(name: string): string | null {
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : null;
}

/** Everything the server checks BEFORE issuing an upload URL. Returns every problem, or an empty list. */
export function validateUploadRequest(
  kind: FileKind,
  input: { fileName: string; contentType: string; sizeBytes: number }
): UploadIssue[] {
  const rules = KIND_RULES[kind];
  const issues: UploadIssue[] = [];
  const type = baseContentType(input.contentType);

  if (!rules.contentTypes.includes(type)) {
    issues.push({ path: "contentType", message: `${input.contentType} is not an allowed file type for this upload.` });
  }
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 1) {
    issues.push({ path: "sizeBytes", message: "must be a positive whole number of bytes." });
  } else if (input.sizeBytes > rules.maxBytes) {
    issues.push({ path: "sizeBytes", message: `is larger than the ${Math.floor(rules.maxBytes / MiB)} MB limit.` });
  }
  // A name with an extension must agree with the declared type ("virus.exe" declared as a PDF is refused).
  const ext = extensionOf(sanitizeFileName(input.fileName));
  const allowedExts = CONTENT_TYPE_EXTENSIONS[type];
  if (ext && allowedExts && !allowedExts.includes(ext)) {
    issues.push({ path: "fileName", message: `the .${ext} extension does not match ${type}.` });
  }
  return issues;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * <organization id>/<parent id>/<file id>.<ext>. Built only from server-generated ids and the extension of
 * a validated content type; the user file name never reaches the path, so there is nothing to traverse.
 */
export function buildObjectPath(input: {
  organizationId: string;
  parentId: string;
  fileId: string;
  contentType: string;
}): string {
  for (const [name, value] of Object.entries({
    organizationId: input.organizationId,
    parentId: input.parentId,
    fileId: input.fileId,
  })) {
    if (!SAFE_ID.test(value)) throw new Error(`unsafe ${name} for an object path`);
  }
  const ext = CONTENT_TYPE_EXTENSIONS[baseContentType(input.contentType)]?.[0];
  if (!ext) throw new Error("no extension for this content type");
  return `${input.organizationId}/${input.parentId}/${input.fileId}.${ext}`;
}

/** True when a path is inside the given organization folder (defense in depth next to the database CHECK). */
export function pathBelongsTo(organizationId: string, objectPath: string): boolean {
  return objectPath.startsWith(`${organizationId}/`) && !objectPath.includes("..") && !objectPath.includes("\\");
}

/** How many leading bytes of an uploaded object we read to confirm it is what it claims to be. */
export const MAGIC_BYTES_NEEDED = 12;

const startsWith = (bytes: Uint8Array, sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);

/** Does the beginning of the object look like the content type it was declared as? */
export function matchesMagicBytes(contentType: string, head: Uint8Array): boolean {
  switch (baseContentType(contentType)) {
    case "image/jpeg":
      return startsWith(head, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8);
    case "application/pdf":
      return startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return startsWith(head, [0x50, 0x4b, 0x03, 0x04]); // an OOXML file is a ZIP
    default:
      return false;
  }
}
