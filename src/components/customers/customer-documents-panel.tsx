"use client";

import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { getCustomerDocuments } from "@/services/customers";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function CustomerDocumentsPanel({ customerId }: { customerId: string }) {
  const { t, locale } = useTranslation();
  const { data: documents, isLoading } = useQuery({
    queryKey: ["customer-documents", customerId],
    queryFn: () => getCustomerDocuments(customerId),
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (!documents || documents.length === 0) return <EmptyState icon={FileText} title={t("common.noResults")} />;

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {documents.map((doc) => (
        <div key={doc.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <FileText className="size-4" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-foreground">{doc.name}</span>
            <span className="text-xs text-muted-foreground">
              {t(`customers.documentTypes.${doc.type}`)} · {doc.sizeLabel} · {new Date(doc.uploadedAt).toLocaleDateString(locale)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
