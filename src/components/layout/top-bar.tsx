"use client";

import Link from "next/link";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { MobileNavDrawer } from "./mobile-nav-drawer";
import { CommandPalette } from "./command-palette";
import { QuickAddMenu } from "./quick-add-menu";
import { MessagesMenu } from "./messages-menu";
import { NotificationsMenu } from "./notifications-menu";
import { DealershipSelector } from "./dealership-selector";
import { LanguageSwitcher } from "./language-switcher";
import { ThemeSwitcher } from "./theme-switcher";
import { UserMenu } from "./user-menu";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function TopBar() {
  const { t } = useTranslation();

  return (
    <header className="sticky top-0 z-30 flex h-14 min-w-0 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-3.5 backdrop-blur supports-backdrop-filter:bg-background/80 md:px-5">
      <MobileNavDrawer />
      <CommandPalette />

      <div className="ms-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" className="text-primary" aria-label={t("common.askAi")} asChild>
          <Link href="/ai-assistant">
            <Bot className="size-4.5" />
          </Link>
        </Button>
        <QuickAddMenu />
        <Separator orientation="vertical" className="mx-1 h-6" />
        <MessagesMenu />
        <NotificationsMenu />
        <Separator orientation="vertical" className="mx-1 h-6" />
        <DealershipSelector />
        <LanguageSwitcher />
        <ThemeSwitcher />
        <Separator orientation="vertical" className="mx-1 h-6" />
        <UserMenu />
      </div>
    </header>
  );
}
