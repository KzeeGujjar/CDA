"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { cn } from "@/utils";

export function DemoModeBadge({ collapsed }: { collapsed?: boolean }) {
  const { t } = useTranslation();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "mx-2.5 mb-2 flex items-center gap-1.5 rounded-lg border border-accent/25 bg-accent/10 px-2.5 py-1.5 text-accent",
            collapsed && "mx-auto size-7 justify-center rounded-full p-0"
          )}
        >
          <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
          {!collapsed && <span className="truncate text-xs font-medium">{t("common.demoMode")}</span>}
        </div>
      </TooltipTrigger>
      <TooltipContent side="right">{t("common.demoModeTooltip")}</TooltipContent>
    </Tooltip>
  );
}
