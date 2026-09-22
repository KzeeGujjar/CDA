"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationPanel } from "@/components/layout/notification-panel";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "@/services/notificationService";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { AppNotification } from "@/types/notification";

export function NotificationsMenu() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: notifications = [] } = useQuery({
    meta: { banner: true },
    queryKey: ["notifications"],
    queryFn: getNotifications,
  });
  const unreadCount = notifications.filter((n) => !n.read).length;

  const readMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const readAllMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  function handleSelect(n: AppNotification) {
    if (!n.read) readMutation.mutate(n.id);
    if (n.link) router.push(n.link);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unreadCount > 0 ? `${t("common.notifications")} (${unreadCount})` : t("common.notifications")}
        >
          <Bell className="size-4.5" />
          {unreadCount > 0 && (
            <span aria-hidden="true" className="absolute top-1 end-1 flex size-2 rounded-full bg-accent" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            {t("common.notifications")}
            {unreadCount > 0 && <span className="text-xs font-normal text-muted-foreground">{unreadCount} new</span>}
          </span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-xs text-muted-foreground hover:text-foreground"
              disabled={readAllMutation.isPending}
              onClick={(e) => {
                e.stopPropagation();
                readAllMutation.mutate();
              }}
            >
              <CheckCheck className="size-3" />
              {t("common.markAllRead")}
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <NotificationPanel notifications={notifications} locale={locale} onSelect={handleSelect} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
