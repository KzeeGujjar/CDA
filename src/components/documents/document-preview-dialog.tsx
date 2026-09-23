"use client";

import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { DocumentPreview } from "@/components/documents/document-preview";
import { ErrorState } from "@/components/shared/error-state";
import { getDocumentContent } from "@/services/documentService";
import type { ContractDocument } from "@/types/document";
import type { Customer } from "@/types/customer";
import type { Vehicle } from "@/types/vehicle";

export function DocumentPreviewDialog({
  document: doc,
  vehicle,
  customer,
  open,
  onOpenChange,
}: {
  document: ContractDocument | null;
  vehicle?: Vehicle;
  customer?: Customer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    data: content,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["document-content", doc?.id],
    queryFn: () => getDocumentContent(doc!, { vehicle, customer }),
    enabled: open && Boolean(doc),
  });

  if (!doc) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{doc.title}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : (
          <DocumentPreview content={content ?? ""} />
        )}
      </DialogContent>
    </Dialog>
  );
}
