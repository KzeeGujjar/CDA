import { notificationMeta } from "@/lib/notification-meta";
import { formatRelativeTime } from "@/lib/relative-time";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { cn } from "@/utils";
import type { AppNotification } from "@/types/notification";
import type { Locale } from "@/lib/i18n/config";

export function NotificationPanel({
  notifications,
  locale,
  onSelect,
}: {
  notifications: AppNotification[];
  locale: Locale;
  onSelect: (notification: AppNotification) => void;
}) {
  const { t } = useTranslation();

  if (notifications.length === 0) {
    return <p className="px-2 py-4 text-center text-sm text-muted-foreground">{t("common.noNotifications")}</p>;
  }

  return (
    <div className="flex max-h-96 flex-col gap-0.5 overflow-y-auto">
      {notifications.map((n) => {
        const meta = notificationMeta[n.kind];
        const Icon = meta.icon;
        return (
          <button
            key={n.id}
            type="button"
            onClick={() => onSelect(n)}
            className="flex items-start gap-2.5 rounded-md px-2 py-2 text-start hover:bg-muted"
          >
            <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-muted", meta.tone)}>
              <Icon className="size-3.5" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                {!n.read && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                <span className={cn("truncate text-sm font-medium", n.read ? "text-muted-foreground" : "text-foreground")}>
                  {n.title}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{n.description}</p>
              <span className="text-[11px] text-muted-foreground/70">{formatRelativeTime(n.createdAt, locale)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
