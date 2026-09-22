import type { ID } from "@/types/common";
import type { AppNotification, DealershipMessage } from "@/types/notification";
import { messagesFixture, notificationsFixture } from "@/mock/notifications";

const notifications: AppNotification[] = [...notificationsFixture];

const wait = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getNotifications(): Promise<AppNotification[]> {
  await wait();
  return [...notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function markNotificationRead(id: ID): Promise<AppNotification> {
  await wait(100);
  const index = notifications.findIndex((n) => n.id === id);
  if (index === -1) throw new Error("Notification not found");
  notifications[index] = { ...notifications[index], read: true };
  return notifications[index];
}

export async function markAllNotificationsRead(): Promise<AppNotification[]> {
  await wait(150);
  for (let i = 0; i < notifications.length; i++) {
    notifications[i] = { ...notifications[i], read: true };
  }
  return [...notifications];
}

export async function getMessages(): Promise<DealershipMessage[]> {
  await wait();
  return messagesFixture;
}
