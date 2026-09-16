import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function FilterPanel({
  children,
  hasActiveFilters,
  onClear,
  end,
}: {
  children: React.ReactNode;
  hasActiveFilters?: boolean;
  onClear?: () => void;
  end?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {children}
      {hasActiveFilters && onClear && (
        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={onClear}>
          <X className="size-3.5" />
          {t("common.clearFilters")}
        </Button>
      )}
      {end && <div className="ms-auto flex items-center gap-1">{end}</div>}
    </div>
  );
}
