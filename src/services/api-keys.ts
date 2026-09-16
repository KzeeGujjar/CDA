import type { ID } from "@/types/common";
import type { ApiKey } from "@/types/settings";
import { apiKeysFixture } from "@/mock/api-keys";

/**
 * Mock implementation — keys are generated locally and never authenticate
 * against a real API gateway. Swap the body of `generateApiKey` for a real
 * backend call when this module is wired to an actual key-issuing service.
 */

let apiKeys: ApiKey[] = [...apiKeysFixture];

const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

function generateKeySuffix(): string {
  const chars = "abcdef0123456789";
  let out = "";
  for (let i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function getApiKeys(): Promise<ApiKey[]> {
  await wait();
  return apiKeys;
}

export async function generateApiKey(name: string): Promise<ApiKey> {
  await wait(300);
  const created: ApiKey = {
    id: `key-${Math.random().toString(36).slice(2, 9)}`,
    name,
    key: `sk_demo_••••••••••••${generateKeySuffix()}`,
    createdAt: new Date().toISOString().slice(0, 10),
    lastUsed: "—",
  };
  apiKeys = [created, ...apiKeys];
  return created;
}

export async function revokeApiKey(id: ID): Promise<void> {
  await wait(150);
  apiKeys = apiKeys.filter((k) => k.id !== id);
}
