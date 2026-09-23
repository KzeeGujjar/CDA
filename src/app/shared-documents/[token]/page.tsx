"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Car } from "lucide-react";
import { DocumentPreview } from "@/components/documents/document-preview";
import { getSharedDocument } from "@/services/documentService";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

/**
 * The page a "Share" link (components/documents/document-card.tsx) opens. Public, no session: GET
 * /api/v1/generated-documents/shared/[token] is a publicRoute, deliberately returning only what the document already
 * shows — no vehicle/customer ids, no cost data, nothing beyond title/type/content.
 */
export default function SharedDocumentPage() {
  const { token } = useParams<{ token: string }>();
  const { t, locale } = useTranslation();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["shared-document", token],
    queryFn: () => getSharedDocument(token),
    retry: false,
  });

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex items-center gap-2 text-primary">
        <Car className="size-5" />
        <span className="text-sm font-semibold">AutoMind AI</span>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : isError || !data ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-6 py-12 text-center">
          <AlertTriangle className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("sharedDocument.notFound")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">{data.title}</h1>
            <p className="text-xs text-muted-foreground">
              {t("sharedDocument.generatedOn")} {new Date(data.generatedAt).toLocaleDateString(locale)}
            </p>
          </div>
          <DocumentPreview content={data.content} />
        </div>
      )}
    </div>
  );
}
