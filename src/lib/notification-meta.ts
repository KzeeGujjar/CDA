import { Bell, ClipboardCheck, FileCheck2, Handshake, Sparkles, TrendingDown, Users, Warehouse, type LucideIcon } from "lucide-react";
import type { NotificationKind } from "@/types/notification";

export const notificationMeta: Record<NotificationKind, { icon: LucideIcon; tone: string }> = {
  lead: { icon: Users, tone: "text-info" },
  price: { icon: TrendingDown, tone: "text-accent" },
  ai: { icon: Sparkles, tone: "text-primary" },
  deal: { icon: Handshake, tone: "text-primary" },
  inspection: { icon: ClipboardCheck, tone: "text-info" },
  document: { icon: FileCheck2, tone: "text-primary" },
  inventory: { icon: Warehouse, tone: "text-muted-foreground" },
  system: { icon: Bell, tone: "text-muted-foreground" },
};
