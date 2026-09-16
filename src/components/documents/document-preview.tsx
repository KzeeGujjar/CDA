import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function DocumentPreview({ content }: { content: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-card p-5">
        <pre dir="auto" className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
          {content}
        </pre>
      </div>
      <p className="text-xs text-muted-foreground">{t("contractsDocuments.previewDisclaimer")}</p>
    </div>
  );
}
