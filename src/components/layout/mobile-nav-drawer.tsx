"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SidebarNav } from "./sidebar-nav";
import { Logo } from "@/components/shared/logo";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function MobileNavDrawer() {
  const [open, setOpen] = useState(false);
  const { t, dir } = useTranslation();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label={t("common.openNavigation")}>
        <Menu className="size-4.5" />
      </Button>
      <SheetContent side={dir === "rtl" ? "right" : "left"} className="w-72 p-0">
        <SheetHeader className="flex-row items-center gap-2 border-b border-border">
          <Logo />
          <SheetTitle>{t("app.name")}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
