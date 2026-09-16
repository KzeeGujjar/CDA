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
import { getCustomers } from "@/services/customers";
import { getVehicles } from "@/services/vehicles";
import { createLead } from "@/services/leads";
import { salespeople } from "@/lib/salespeople";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { LeadSource } from "@/types/lead";

const sources: LeadSource[] = ["website", "walk_in", "referral", "social_media", "marketplace", "phone"];

export function NewLeadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [customerId, setCustomerId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [budget, setBudget] = useState("");
  const [source, setSource] = useState<LeadSource | "">("");
  const [assignedToName, setAssignedToName] = useState("");

  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: () => getCustomers(), enabled: open });
  const { data: vehicles = [] } = useQuery({ queryKey: ["vehicles"], queryFn: () => getVehicles(), enabled: open });

  function reset() {
    setCustomerId("");
    setVehicleId("");
    setBudget("");
    setSource("");
    setAssignedToName("");
  }

  const mutation = useMutation({
    mutationFn: () => {
      if (!customerId || !source || !assignedToName) throw new Error("Missing required fields");
      const budgetAmount = Number(budget);
      return createLead({
        customerId,
        interestedVehicleId: vehicleId || undefined,
        budget: budget && !Number.isNaN(budgetAmount) ? { amount: budgetAmount, currency: "AED" } : undefined,
        source,
        assignedToName,
      });
    },
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success(`${lead.customerName} ${t("leads.createdToast")}`);
      reset();
      onOpenChange(false);
    },
  });

  const canSubmit = Boolean(customerId && source && assignedToName);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("leads.newLead")}</DialogTitle>
          <DialogDescription>{t("leads.newLeadDescription")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <FormField label={t("leads.fields.customer")} htmlFor="lead-customer">
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger id="lead-customer" className="w-full">
                <SelectValue placeholder={t("leads.fields.customer")} />
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

          <FormField label={t("leads.interestedIn")} htmlFor="lead-vehicle">
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger id="lead-vehicle" className="w-full">
                <SelectValue placeholder={t("leads.interestedIn")} />
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

          <FormField label={t("leads.fields.budget")} htmlFor="lead-budget">
            <Input
              id="lead-budget"
              type="number"
              inputMode="numeric"
              placeholder="AED"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </FormField>

          <FormField label={t("leads.fields.source")} htmlFor="lead-source">
            <Select value={source} onValueChange={(v) => setSource(v as LeadSource)}>
              <SelectTrigger id="lead-source" className="w-full">
                <SelectValue placeholder={t("leads.fields.source")} />
              </SelectTrigger>
              <SelectContent>
                {sources.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`leads.sources.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label={t("leads.assignedTo")} htmlFor="lead-assignee">
            <Select value={assignedToName} onValueChange={setAssignedToName}>
              <SelectTrigger id="lead-assignee" className="w-full">
                <SelectValue placeholder={t("leads.assignedTo")} />
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
          <Button disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>
            {t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
