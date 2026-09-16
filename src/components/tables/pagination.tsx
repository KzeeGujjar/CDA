import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useTranslation();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      <span className="text-xs text-muted-foreground">{t("common.pageOf").replace("{page}", String(page)).replace("{total}", String(totalPages))}</span>
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" className="gap-1" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="size-3.5" />
          {t("common.previous")}
        </Button>
        <Button variant="outline" size="sm" className="gap-1" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          {t("common.next")}
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
