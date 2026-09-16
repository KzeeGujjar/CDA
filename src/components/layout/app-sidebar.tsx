"use client";

import Link from "next/link";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { SidebarNav } from "./sidebar-nav";
import { DemoModeBadge } from "./demo-mode-badge";
import { Logo } from "@/components/shared/logo";
import { useSidebarStore } from "@/store/use-sidebar-store";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { cn } from "@/utils";

export function AppSidebar() {
  const { collapsed, toggle } = useSidebarStore();
  const { t } = useTranslation();

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 flex-col border-e border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className={cn("flex h-14 items-center gap-2 border-b border-sidebar-border px-3.5", collapsed && "justify-center px-0")}>
        <Link href="/dashboard" className="flex items-center gap-2 overflow-hidden">
          <Logo />
          {!collapsed && (
            <span className="truncate text-sm font-semibold text-sidebar-foreground">{t("app.name")}</span>
          )}
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto">
        <SidebarNav collapsed={collapsed} />
      </div>

      <DemoModeBadge collapsed={collapsed} />

      <button
        onClick={toggle}
        aria-label={collapsed ? t("common.expandSidebar") : t("common.collapseSidebar")}
        aria-pressed={collapsed}
        className="flex h-11 items-center justify-center gap-2 border-t border-sidebar-border text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
      >
        {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
      </button>
    </aside>
  );
}
