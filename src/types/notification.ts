import type { ID } from "./common";

export type NotificationKind = "lead" | "price" | "ai" | "deal" | "inspection" | "document" | "inventory" | "system";

export interface AppNotification {
  id: ID;
  title: string;
  description: string;
  createdAt: string;
  read: boolean;
  kind: NotificationKind;
  link?: string;
}

export interface DealershipMessage {
  id: ID;
  customerName: string;
  customerAvatarUrl?: string;
  preview: string;
  updatedAt: string;
  unread: boolean;
}
