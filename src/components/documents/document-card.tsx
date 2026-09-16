"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import { Download, Eye, PenTool, Pencil, Printer, Share2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/shared/status-badge";
import { documentStatusTone } from "./document-status";
import { documentTypeMeta } from "@/lib/document-type-meta";
import { generateDocumentContent } from "@/lib/document-generator";
import { updateDocumentStatus } from "@/services/documents";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { ContractDocument } from "@/types/document";
import type { Vehicle } from "@/types/vehicle";
import type { Customer } from "@/types/customer";

function ActionButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon-xs"
          disabled={disabled}
          onClick={onClick}
          className={accent ? "text-primary" : undefined}
          aria-label={label}
        >
          <Icon className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function DocumentCard({
  document: doc,
  vehicle,
  customer,
  onEdit,
  onPreview,
}: {
  document: ContractDocument;
  vehicle?: Vehicle;
  customer?: Customer;
  onEdit: (doc: ContractDocument) => void;
  onPreview: (doc: ContractDocument) => void;
}) {
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();
  const meta = documentTypeMeta[doc.type];
  const Icon = meta.icon;

  const signMutation = useMutation({
    mutationFn: () => updateDocumentStatus(doc.id, "signed"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success(t("contractsDocuments.actions.signedToast"));
    },
  });

  function handleDownload() {
    const content = generateDocumentContent(doc.type, { vehicle, customer });
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${doc.title.replace(/[^a-z0-9]+/gi, "-")}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success(t("contractsDocuments.actions.downloaded"));
  }

  function handlePrint() {
    onPreview(doc);
    setTimeout(() => window.print(), 200);
  }

  function handleShare() {
    const url = typeof window !== "undefined" ? `${window.location.origin}/contracts-documents?doc=${doc.id}` : "";
    navigator.clipboard?.writeText(url).then(() => toast.success(t("contractsDocuments.actions.linkCopied")));
  }

  const canSign = doc.status === "draft" || doc.status === "pending_signature";

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-4" />
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-sm font-medium text-foreground">{doc.title}</span>
              <span className="truncate text-xs text-muted-foreground">
                {t(`contractsDocuments.types.${meta.labelKey}`)}
                {doc.vehicleLabel && ` · ${doc.vehicleLabel}`}
              </span>
            </div>
          </div>
          <StatusBadge label={t(`contractsDocuments.statuses.${doc.status}`)} tone={documentStatusTone(doc.status)} />
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">{doc.customerName ?? "—"}</span>
          <span className="shrink-0">{new Date(doc.updatedAt).toLocaleDateString(locale)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1 border-t border-border pt-2.5">
          <ActionButton icon={Pencil} label={t("contractsDocuments.actions.edit")} onClick={() => onEdit(doc)} />
          <ActionButton icon={Eye} label={t("contractsDocuments.actions.preview")} onClick={() => onPreview(doc)} />
          <ActionButton icon={Download} label={t("contractsDocuments.actions.download")} onClick={handleDownload} />
          <ActionButton icon={Printer} label={t("contractsDocuments.actions.print")} onClick={handlePrint} />
          <ActionButton icon={Share2} label={t("contractsDocuments.actions.share")} onClick={handleShare} />
          {canSign && (
            <ActionButton
              icon={PenTool}
              label={t("contractsDocuments.actions.sign")}
              onClick={() => signMutation.mutate()}
              disabled={signMutation.isPending}
              accent
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
