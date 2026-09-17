"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Landmark } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/forms/form-field";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { VehicleSourceFields } from "@/components/vehicles/vehicle-source-fields";
import { formatMoney } from "@/components/shared/currency";
import { getVehicles } from "@/services/vehicles";
import { getBankEvaluations, requestBankEvaluation } from "@/services/bank-evaluations";
import { uaeBanks, BANK_EVALUATION_FEE_AED } from "@/lib/uae-banks";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { BankEvaluationRequest, BankEvaluationStatus, UaeBankCode } from "@/types/bank-evaluation";
import type { CustomerVehicleDetails, VehicleSource } from "@/types/vehicle-request";

const statusTone: Record<BankEvaluationStatus, StatusTone> = {
  requested: "info",
  in_review: "warning",
  completed: "success",
  rejected: "danger",
};

const blankCustomerVehicle: CustomerVehicleDetails = {
  make: "",
  model: "",
  variant: "",
  year: new Date().getFullYear(),
  mileageKm: 0,
  condition: "used",
  specifications: "",
};

interface FormValues {
  bankCode: UaeBankCode | "";
  customerName: string;
  financeAmount: number;
  notes: string;
}

export function BankEvaluationSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [vehicleSource, setVehicleSource] = useState<VehicleSource>("inventory");
  const [vehicleId, setVehicleId] = useState("");
  const [customerVehicle, setCustomerVehicle] = useState<CustomerVehicleDetails>(blankCustomerVehicle);

  const vehiclesQuery = useQuery({ queryKey: ["vehicles", "bank-eval-options"], queryFn: () => getVehicles() });
  const evaluationsQuery = useQuery({ queryKey: ["bank-evaluations"], queryFn: getBankEvaluations });

  const { register, control, handleSubmit, reset } = useForm<FormValues>({
    defaultValues: { bankCode: "", customerName: "", financeAmount: 0, notes: "" },
  });

  const resetAll = () => {
    reset();
    setVehicleSource("inventory");
    setVehicleId("");
    setCustomerVehicle(blankCustomerVehicle);
  };

  const mutation = useMutation({
    mutationFn: requestBankEvaluation,
    onSuccess: () => {
      toast.success(t("valuation.bankFinancing.success"));
      queryClient.invalidateQueries({ queryKey: ["bank-evaluations"] });
      resetAll();
      setOpen(false);
    },
  });

  const columns: DataTableColumn<BankEvaluationRequest>[] = [
    { key: "vehicleLabel", header: t("valuation.bankFinancing.table.vehicle"), render: (r) => r.vehicleLabel },
    { key: "bankName", header: t("valuation.bankFinancing.table.bank"), render: (r) => r.bankName },
    { key: "customerName", header: t("valuation.bankFinancing.table.customer"), render: (r) => r.customerName ?? "—" },
    {
      key: "financeAmount",
      header: t("valuation.bankFinancing.table.financeAmount"),
      render: (r) => <span className="font-mono">{formatMoney(r.financeAmount)}</span>,
    },
    { key: "fee", header: t("valuation.bankFinancing.table.fee"), render: (r) => <span className="font-mono">{formatMoney(r.fee)}</span> },
    {
      key: "status",
      header: t("valuation.bankFinancing.table.status"),
      render: (r) => <StatusBadge label={t(`valuation.bankFinancing.status.${r.status}`)} tone={statusTone[r.status]} />,
    },
    {
      key: "requestedAt",
      header: t("valuation.bankFinancing.table.requested"),
      render: (r) => new Date(r.requestedAt).toLocaleDateString(),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Landmark className="size-4 text-primary" />
            <CardTitle>{t("valuation.bankFinancing.title")}</CardTitle>
          </div>
          <Button size="sm" variant={open ? "outline" : "default"} onClick={() => setOpen((v) => !v)}>
            {open ? t("common.cancel") : t("valuation.bankFinancing.form.submit")}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{t("valuation.bankFinancing.subtitle")}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent-foreground">
          {t("valuation.bankFinancing.feeNotice").replace("{fee}", String(BANK_EVALUATION_FEE_AED))}
        </div>

        {open && (
          <form
            onSubmit={handleSubmit((values) => {
              let vehicleLabel = "";
              if (vehicleSource === "inventory") {
                const vehicle = vehiclesQuery.data?.find((v) => v.id === vehicleId);
                if (!vehicle) return;
                vehicleLabel = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
              } else {
                if (!customerVehicle.make.trim() || !customerVehicle.model.trim()) return;
                vehicleLabel = [customerVehicle.year, customerVehicle.make, customerVehicle.model, customerVehicle.variant]
                  .filter(Boolean)
                  .join(" ");
              }

              mutation.mutate({
                vehicleSource,
                vehicleId: vehicleSource === "inventory" ? vehicleId : undefined,
                vehicleLabel,
                customerVehicle: vehicleSource === "customer_owned" ? customerVehicle : undefined,
                bankCode: values.bankCode as UaeBankCode,
                financeAmount: { amount: values.financeAmount, currency: "AED" },
                customerName: values.customerName || undefined,
                notes: values.notes || undefined,
              });
            })}
            className="grid grid-cols-1 gap-4 rounded-lg border border-border p-4 sm:grid-cols-2"
          >
            <VehicleSourceFields
              idPrefix="bev"
              vehicles={vehiclesQuery.data ?? []}
              source={vehicleSource}
              onSourceChange={(source) => {
                setVehicleSource(source);
                setVehicleId("");
                setCustomerVehicle(blankCustomerVehicle);
              }}
              vehicleId={vehicleId}
              onVehicleIdChange={setVehicleId}
              customerVehicle={customerVehicle}
              onCustomerVehicleChange={(patch) => setCustomerVehicle((prev) => ({ ...prev, ...patch }))}
            />

            <FormField label={t("valuation.bankFinancing.form.bank")} htmlFor="bev-bank">
              <Controller
                control={control}
                name="bankCode"
                rules={{ required: true }}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="bev-bank" className="w-full">
                      <SelectValue placeholder={t("valuation.bankFinancing.form.bankPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {uaeBanks.map((bank) => (
                        <SelectItem key={bank.code} value={bank.code}>
                          {bank.shortName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>

            <FormField label={t("valuation.bankFinancing.form.financeAmount")} htmlFor="bev-finance-amount">
              <Input
                id="bev-finance-amount"
                type="number"
                min={0}
                step={1000}
                {...register("financeAmount", { required: true, valueAsNumber: true, min: 1 })}
              />
            </FormField>

            <FormField label={t("valuation.bankFinancing.form.customerName")} htmlFor="bev-customer">
              <Input id="bev-customer" {...register("customerName")} />
            </FormField>

            <FormField label={t("valuation.bankFinancing.form.notes")} htmlFor="bev-notes">
              <Input id="bev-notes" {...register("notes")} />
            </FormField>

            <div className="sm:col-span-2">
              <Button type="submit" disabled={mutation.isPending}>
                {t("valuation.bankFinancing.form.submit")}
              </Button>
            </div>
          </form>
        )}

        <DataTable
          columns={columns}
          rows={evaluationsQuery.data ?? []}
          loading={evaluationsQuery.isPending}
          emptyTitle={t("valuation.bankFinancing.empty")}
        />
      </CardContent>
    </Card>
  );
}
