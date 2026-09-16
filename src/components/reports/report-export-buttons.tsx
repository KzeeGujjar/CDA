"use client";

import { toast } from "sonner";
import { FileSpreadsheet, FileText, Sheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function ReportExportButtons() {
  const { t } = useTranslation();

  function handleExport() {
    toast.info(t("reports.export.comingSoon"));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
        <FileText className="size-3.5" />
        {t("reports.export.pdf")}
      </Button>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
        <FileSpreadsheet className="size-3.5" />
        {t("reports.export.excel")}
      </Button>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
        <Sheet className="size-3.5" />
        {t("reports.export.csv")}
      </Button>
    </div>
  );
}
