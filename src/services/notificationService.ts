import type { ID } from "@/types/common";
import type { AppNotification, DealershipMessage, NotificationKind } from "@/types/notification";
import { messagesFixture, notificationsFixture } from "@/mock/notifications";
import { backendRequest, liveOrDemo, unwrapBackend } from "@/services/backend";

const notifications: AppNotification[] = [...notificationsFixture];

const wait = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));

interface NotificationDto {
  id: string;
  kind: string;
  title: string;
  description: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

function toAppNotification(d: NotificationDto): AppNotification {
  return {
    id: d.id,
    title: d.title,
    description: d.description,
    createdAt: d.createdAt,
    read: d.read,
    kind: d.kind as NotificationKind,
    link: d.link ?? undefined,
  };
}

async function demoGetNotifications(): Promise<AppNotification[]> {
  await wait();
  return [...notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
async function liveGetNotifications(): Promise<AppNotification[]> {
  const items = unwrapBackend(await backendRequest<NotificationDto[]>("GET", "/notifications"));
  return items.map(toAppNotification);
}
export function getNotifications(): Promise<AppNotification[]> {
  return liveOrDemo({ live: liveGetNotifications, demo: demoGetNotifications });
}

async function demoMarkNotificationRead(id: ID): Promise<AppNotification> {
  await wait(100);
  const index = notifications.findIndex((n) => n.id === id);
  if (index === -1) throw new Error("Notification not found");
  notifications[index] = { ...notifications[index], read: true };
  return notifications[index];
}
async function liveMarkNotificationRead(id: ID): Promise<AppNotification> {
  const dto = unwrapBackend(await backendRequest<NotificationDto>("PATCH", `/notifications/${id}`, { read: true }));
  return toAppNotification(dto);
}
export function markNotificationRead(id: ID): Promise<AppNotification> {
  return liveOrDemo({ live: () => liveMarkNotificationRead(id), demo: () => demoMarkNotificationRead(id) });
}

async function demoMarkAllNotificationsRead(): Promise<AppNotification[]> {
  await wait(150);
  for (let i = 0; i < notifications.length; i++) {
    notifications[i] = { ...notifications[i], read: true };
  }
  return [...notifications];
}
async function liveMarkAllNotificationsRead(): Promise<AppNotification[]> {
  unwrapBackend(await backendRequest<{ updated: number }>("POST", "/notifications/read-all"));
  return liveGetNotifications();
}
export function markAllNotificationsRead(): Promise<AppNotification[]> {
  return liveOrDemo({ live: liveMarkAllNotificationsRead, demo: demoMarkAllNotificationsRead });
}

// Dealership messages (the top-bar message preview list) have no backend endpoint yet — demo data only.
export async function getMessages(): Promise<DealershipMessage[]> {
  await wait();
  return messagesFixture;
}
