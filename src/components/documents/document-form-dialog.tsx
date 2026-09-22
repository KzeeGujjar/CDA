"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/forms/form-field";
import { documentTypeMeta, documentTypes } from "@/lib/document-type-meta";
import { createDocument, updateDocument } from "@/services/documentService";
import { getVehicles } from "@/services/vehicleService";
import { getCustomers } from "@/services/customerService";
import { salespeople } from "@/lib/salespeople";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { ContractDocument, DocumentType } from "@/types/document";

export function DocumentFormDialog({
  open,
  onOpenChange,
  document: doc,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document?: ContractDocument | null;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isEdit = Boolean(doc);

  const [type, setType] = useState<DocumentType>(doc?.type ?? "quotation");
  const [title, setTitle] = useState(doc?.title ?? "");
  const [vehicleId, setVehicleId] = useState(doc?.vehicleId ?? "");
  const [customerId, setCustomerId] = useState(doc?.customerId ?? "");
  const [assignedToName, setAssignedToName] = useState(doc?.createdByName ?? salespeople[0]);

  const { data: vehicles = [] } = useQuery({
    meta: { banner: true },
    queryKey: ["vehicles"],
    queryFn: () => getVehicles(),
    enabled: open,
  });
  const { data: customers = [] } = useQuery({
    meta: { banner: true },
    queryKey: ["customers"],
    queryFn: () => getCustomers(),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: () => {
      const vehicle = vehicles.find((v) => v.id === vehicleId);
      const customer = customers.find((c) => c.id === customerId);
      const input = {
        type,
        title: title.trim(),
        vehicleId: vehicle?.id,
        vehicleLabel: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}` : undefined,
        customerId: customer?.id,
        customerName: customer?.name,
        createdByName: assignedToName,
      };
      return isEdit && doc ? updateDocument(doc.id, input) : createDocument(input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success(isEdit ? t("contractsDocuments.updatedToast") : t("contractsDocuments.createdToast"));
      onOpenChange(false);
    },
  });

  const canSave = title.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("contractsDocuments.editDocument") : t("contractsDocuments.newDocument")}
          </DialogTitle>
          <DialogDescription>{t("contractsDocuments.formDescription")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <FormField label={t("contractsDocuments.fields.type")} htmlFor="doc-type">
            <Select
              value={type}
              onValueChange={(v) => {
                const nextType = v as DocumentType;
                setType(nextType);
                if (!title) setTitle(t(`contractsDocuments.types.${documentTypeMeta[nextType].labelKey}`));
              }}
            >
              <SelectTrigger id="doc-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {documentTypes.map((dt) => (
                  <SelectItem key={dt} value={dt}>
                    {t(`contractsDocuments.types.${documentTypeMeta[dt].labelKey}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label={t("contractsDocuments.fields.title")} htmlFor="doc-title">
            <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </FormField>

          <FormField label={t("contractsDocuments.fields.vehicle")} htmlFor="doc-vehicle">
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger id="doc-vehicle" className="w-full">
                <SelectValue placeholder={t("contractsDocuments.fields.vehicle")} />
              </SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.year} {v.make} {v.model} {v.trim}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label={t("contractsDocuments.fields.customer")} htmlFor="doc-customer">
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger id="doc-customer" className="w-full">
                <SelectValue placeholder={t("contractsDocuments.fields.customer")} />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label={t("contractsDocuments.fields.preparedBy")} htmlFor="doc-assignee">
            <Select value={assignedToName} onValueChange={setAssignedToName}>
              <SelectTrigger id="doc-assignee" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {salespeople.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>

        <DialogFooter>
          <Button disabled={!canSave || mutation.isPending} onClick={() => mutation.mutate()}>
            {isEdit ? t("common.saveChanges") : t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
