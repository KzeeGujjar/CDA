import type { SecuritySession } from "@/types/settings";

export const securitySessionsFixture: SecuritySession[] = [
  { id: "s-001", device: "Chrome on Windows", location: "Abu Dhabi, UAE", current: true },
  { id: "s-002", device: "Safari on iPhone", location: "Dubai, UAE", current: false },
];
