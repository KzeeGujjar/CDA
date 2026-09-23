import type { ID } from "@/types/common";
import type { ContractDocument, DocumentFilters, DocumentInput, DocumentStatus, DocumentType } from "@/types/document";
import type { Customer } from "@/types/customer";
import type { Vehicle } from "@/types/vehicle";
import { documentsFixture } from "@/mock/documents";
import { backendRequest, liveOrDemo, unwrapBackend } from "@/services/backend";
import { generateDocumentContent } from "@/lib/document-generator";

let documents: ContractDocument[] = [...documentsFixture];
const wait = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

interface DocumentDto {
  id: string;
  type: string;
  title: string;
  status: string;
  language: string;
  vehicleId: string | null;
  vehicleLabel: string | null;
  customerId: string | null;
  customerName: string | null;
  dealId: string | null;
  dealReference: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  hasActiveShare: boolean;
  content?: string;
}

function toContractDocument(d: DocumentDto): ContractDocument {
  return {
    id: d.id,
    type: d.type as DocumentType,
    title: d.title,
    vehicleId: d.vehicleId ?? undefined,
    vehicleLabel: d.vehicleLabel ?? undefined,
    customerId: d.customerId ?? undefined,
    customerName: d.customerName ?? undefined,
    dealId: d.dealId ?? undefined,
    dealReference: d.dealReference ?? undefined,
    status: d.status as DocumentStatus,
    createdByName: d.createdByName ?? "—",
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    content: d.content,
    hasActiveShare: d.hasActiveShare,
  };
}

// ── Documents ────────────────────────────────────────────────────────────────────────────────────────────

async function demoGetDocuments(filters?: DocumentFilters): Promise<ContractDocument[]> {
  await wait();
  return documents
    .filter((d) => {
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        const haystack = `${d.title} ${d.vehicleLabel ?? ""} ${d.customerName ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filters?.type && d.type !== filters.type) return false;
      return true;
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function liveGetDocuments(filters?: DocumentFilters): Promise<ContractDocument[]> {
  const params = new URLSearchParams();
  if (filters?.search) params.set("search", filters.search);
  if (filters?.type) params.set("type", filters.type);
  const q = params.toString();
  const items = unwrapBackend(await backendRequest<DocumentDto[]>("GET", `/generated-documents${q ? `?${q}` : ""}`));
  return items.map(toContractDocument);
}

export function getDocuments(filters?: DocumentFilters): Promise<ContractDocument[]> {
  return liveOrDemo({ live: () => liveGetDocuments(filters), demo: () => demoGetDocuments(filters) });
}

async function liveGetDocumentById(id: ID): Promise<ContractDocument | null> {
  const result = await backendRequest<DocumentDto>("GET", `/generated-documents/${id}`);
  if (result.kind === "error" && result.error.status === 404) return null;
  return toContractDocument(unwrapBackend(result));
}

export function getDocumentById(id: ID): Promise<ContractDocument | null> {
  return liveOrDemo({
    live: () => liveGetDocumentById(id),
    demo: async () => {
      await wait(150);
      return documents.find((d) => d.id === id) ?? null;
    },
  });
}

/**
 * The document's rendered text. Live mode always fetches the real, server-generated snapshot (from the
 * document itself when already loaded, otherwise a fetch); demo mode uses the same client-side templates the
 * Preview/Download/Print buttons always used. Backs handleDownload/handlePrint/DocumentPreviewDialog so every
 * one of them shows the exact same content.
 */
export async function getDocumentContent(doc: ContractDocument, opts: { vehicle?: Vehicle; customer?: Customer }): Promise<string> {
  return liveOrDemo({
    live: async () => {
      if (doc.content !== undefined) return doc.content;
      const full = await liveGetDocumentById(doc.id);
      return full?.content ?? "";
    },
    demo: async () => generateDocumentContent(doc.type, opts),
  });
}

async function demoCreateDocument(input: DocumentInput): Promise<ContractDocument> {
  await wait();
  const now = new Date().toISOString();
  const document: ContractDocument = {
    ...input,
    id: `doc-${Math.random().toString(36).slice(2, 9)}`,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
  documents = [document, ...documents];
  return document;
}

async function liveCreateDocument(input: DocumentInput): Promise<ContractDocument> {
  // createdByName has no live equivalent: the server attributes creation to the signed-in user, never a
  // name chosen from a list (see components/documents/document-form-dialog.tsx's "Prepared by" picker).
  const data = unwrapBackend(
    await backendRequest<DocumentDto>("POST", "/generated-documents", { type: input.type, title: input.title, vehicleId: input.vehicleId, customerId: input.customerId })
  );
  return toContractDocument(data);
}

export function createDocument(input: DocumentInput): Promise<ContractDocument> {
  return liveOrDemo({ live: () => liveCreateDocument(input), demo: () => demoCreateDocument(input) });
}

async function demoUpdateDocument(id: ID, patch: Partial<DocumentInput>): Promise<ContractDocument> {
  await wait();
  const index = documents.findIndex((d) => d.id === id);
  if (index === -1) throw new Error("Document not found");
  documents[index] = { ...documents[index], ...patch, updatedAt: new Date().toISOString() };
  return documents[index];
}

async function liveUpdateDocument(id: ID, patch: Partial<DocumentInput>): Promise<ContractDocument> {
  const data = unwrapBackend(
    await backendRequest<DocumentDto>("PATCH", `/generated-documents/${id}`, {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.vehicleId !== undefined ? { vehicleId: patch.vehicleId ?? null } : {}),
      ...(patch.customerId !== undefined ? { customerId: patch.customerId ?? null } : {}),
    })
  );
  return toContractDocument(data);
}

export function updateDocument(id: ID, patch: Partial<DocumentInput>): Promise<ContractDocument> {
  return liveOrDemo({ live: () => liveUpdateDocument(id, patch), demo: () => demoUpdateDocument(id, patch) });
}

async function demoUpdateDocumentStatus(id: ID, status: DocumentStatus): Promise<ContractDocument> {
  await wait();
  const index = documents.findIndex((d) => d.id === id);
  if (index === -1) throw new Error("Document not found");
  documents[index] = { ...documents[index], status, updatedAt: new Date().toISOString() };
  return documents[index];
}

async function liveUpdateDocumentStatus(id: ID, status: DocumentStatus): Promise<ContractDocument> {
  const data = unwrapBackend(await backendRequest<DocumentDto>("PATCH", `/generated-documents/${id}/status`, { status }));
  return toContractDocument(data);
}

export function updateDocumentStatus(id: ID, status: DocumentStatus): Promise<ContractDocument> {
  return liveOrDemo({ live: () => liveUpdateDocumentStatus(id, status), demo: () => demoUpdateDocumentStatus(id, status) });
}

/** The public, unauthenticated read behind a share link (app/shared-documents/[token]/page.tsx). There is no
 * demo equivalent — a token that was never issued by a real backend simply is not found. */
export async function getSharedDocument(
  token: string
): Promise<{ title: string; type: string; content: string; generatedAt: string }> {
  return unwrapBackend(
    await backendRequest<{ title: string; type: string; content: string; generatedAt: string }>(
      "GET",
      `/generated-documents/shared/${token}`
    )
  );
}

/** Issues (or rotates) a real, expiring share link. Demo mode has no server to host one, so it keeps the
 * pre-existing placeholder link — copyable, but not a page that actually resolves. */
export function shareDocument(id: ID): Promise<{ url: string; expiresAt: string }> {
  return liveOrDemo({
    live: async () => unwrapBackend(await backendRequest<{ url: string; expiresAt: string }>("POST", `/generated-documents/${id}/share`)),
    demo: async () => {
      await wait(150);
      return {
        url: typeof window !== "undefined" ? `${window.location.origin}/contracts-documents?doc=${id}` : "",
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      };
    },
  });
}
