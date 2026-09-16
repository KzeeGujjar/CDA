"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navGroups } from "@/constants";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { cn } from "@/utils";

export function SidebarNav({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-5 overflow-y-auto px-2.5 py-4">
      {navGroups.map((group) => (
        <div key={group.key} className="flex flex-col gap-1">
          {!collapsed && (
            <span className="px-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
              {t(group.labelKey)}
            </span>
          )}
          {group.items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={onNavigate}
                title={collapsed ? t(item.labelKey) : undefined}
                aria-label={collapsed ? t(item.labelKey) : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  collapsed && "justify-center"
                )}
              >
                <Icon className={cn("size-4.5 shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-sidebar-foreground")} />
                {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
