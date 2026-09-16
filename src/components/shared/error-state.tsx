import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function ErrorState({ title, description, onRetry }: { title?: string; description?: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-destructive/40 px-6 py-14 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-5" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{title ?? t("common.somethingWentWrong")}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{description ?? t("common.somethingWentWrongDescription")}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      )}
    </div>
  );
}
