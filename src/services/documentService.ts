import type { ID } from "@/types/common";
import type { ContractDocument, DocumentFilters, DocumentInput, DocumentStatus } from "@/types/document";
import { documentsFixture } from "@/mock/documents";

let documents: ContractDocument[] = [...documentsFixture];
const wait = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getDocuments(filters?: DocumentFilters): Promise<ContractDocument[]> {
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

export async function getDocumentById(id: ID): Promise<ContractDocument | null> {
  await wait(150);
  return documents.find((d) => d.id === id) ?? null;
}

export async function createDocument(input: DocumentInput): Promise<ContractDocument> {
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

export async function updateDocument(id: ID, patch: Partial<DocumentInput>): Promise<ContractDocument> {
  await wait();
  const index = documents.findIndex((d) => d.id === id);
  if (index === -1) throw new Error("Document not found");
  documents[index] = { ...documents[index], ...patch, updatedAt: new Date().toISOString() };
  return documents[index];
}

export async function updateDocumentStatus(id: ID, status: DocumentStatus): Promise<ContractDocument> {
  await wait();
  const index = documents.findIndex((d) => d.id === id);
  if (index === -1) throw new Error("Document not found");
  documents[index] = { ...documents[index], status, updatedAt: new Date().toISOString() };
  return documents[index];
}
