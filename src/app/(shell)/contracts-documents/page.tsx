"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Plus, Search, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { DocumentCard } from "@/components/documents/document-card";
import { DocumentFormDialog } from "@/components/documents/document-form-dialog";
import { DocumentPreviewDialog } from "@/components/documents/document-preview-dialog";
import { DocumentAssistantPanel } from "@/components/documents/document-assistant-panel";
import { documentTypeMeta, documentTypes } from "@/lib/document-type-meta";
import { getDocuments } from "@/services/documentService";
import { getVehicles } from "@/services/vehicleService";
import { getCustomers } from "@/services/customerService";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { ContractDocument, DocumentType } from "@/types/document";

export default function ContractsDocumentsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<DocumentType | "all">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<ContractDocument | null>(null);
  const [previewDoc, setPreviewDoc] = useState<ContractDocument | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const {
    data: documents,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["documents", search, typeFilter],
    queryFn: () => getDocuments({ search: search || undefined, type: typeFilter === "all" ? undefined : typeFilter }),
  });
  const { data: vehicles = [] } = useQuery({ queryKey: ["vehicles"], queryFn: () => getVehicles() });
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: () => getCustomers() });

  return (
    <>
      <PageHeader title={t("contractsDocuments.title")} subtitle={t("contractsDocuments.subtitle")} />

      <Tabs defaultValue="documents">
        <TabsList>
          <TabsTrigger value="documents" className="gap-1.5">
            <FileText className="size-3.5" />
            {t("contractsDocuments.tabs.documents")}
          </TabsTrigger>
          <TabsTrigger value="assistant" className="gap-1.5">
            <Sparkles className="size-3.5" />
            {t("contractsDocuments.tabs.assistant")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("common.search")} className="w-56 ps-8" />
              </div>
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as DocumentType | "all")}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("contractsDocuments.allTypes")}</SelectItem>
                  {documentTypes.map((dt) => (
                    <SelectItem key={dt} value={dt}>
                      {t(`contractsDocuments.types.${documentTypeMeta[dt].labelKey}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setEditingDoc(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-3.5" />
              {t("contractsDocuments.newDocument")}
            </Button>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-40 w-full" />
              ))}
            </div>
          ) : isError ? (
            <ErrorState error={error} onRetry={() => refetch()} />
          ) : !documents || documents.length === 0 ? (
            <EmptyState icon={FileText} title={t("common.noResults")} />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {documents.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  document={doc}
                  vehicle={vehicles.find((v) => v.id === doc.vehicleId)}
                  customer={customers.find((c) => c.id === doc.customerId)}
                  onEdit={(d) => {
                    setEditingDoc(d);
                    setFormOpen(true);
                  }}
                  onPreview={(d) => {
                    setPreviewDoc(d);
                    setPreviewOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="assistant">
          <DocumentAssistantPanel />
        </TabsContent>
      </Tabs>

      <DocumentFormDialog key={editingDoc?.id ?? "new"} open={formOpen} onOpenChange={setFormOpen} document={editingDoc} />
      <DocumentPreviewDialog
        document={previewDoc}
        vehicle={vehicles.find((v) => v.id === previewDoc?.vehicleId)}
        customer={customers.find((c) => c.id === previewDoc?.customerId)}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </>
  );
}
