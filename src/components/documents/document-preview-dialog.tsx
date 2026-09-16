"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DocumentPreview } from "@/components/documents/document-preview";
import { generateDocumentContent } from "@/lib/document-generator";
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
  if (!doc) return null;
  const content = generateDocumentContent(doc.type, { vehicle, customer });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{doc.title}</DialogTitle>
        </DialogHeader>
        <DocumentPreview content={content} />
      </DialogContent>
    </Dialog>
  );
}
