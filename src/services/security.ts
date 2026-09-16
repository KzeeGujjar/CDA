import type { ID } from "@/types/common";
import type { SecuritySession } from "@/types/settings";
import { securitySessionsFixture } from "@/mock/security-sessions";

let sessions: SecuritySession[] = [...securitySessionsFixture];

const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getSecuritySessions(): Promise<SecuritySession[]> {
  await wait();
  return sessions;
}

export async function signOutSession(id: ID): Promise<void> {
  await wait(150);
  sessions = sessions.filter((s) => s.id !== id);
}
