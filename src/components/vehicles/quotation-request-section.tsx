"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { VehicleSourceFields } from "@/components/vehicles/vehicle-source-fields";
import { formatMoney } from "@/components/shared/currency";
import { getVehicles } from "@/services/vehicleService";
import { getQuotationRequests, requestQuotation } from "@/services/quotationRequestService";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { QuotationRequest, QuotationRequestStatus } from "@/types/quotation-request";
import type { CustomerVehicleDetails, VehicleSource } from "@/types/vehicle-request";
import { InlineError } from "@/components/shared/inline-state";

const statusTone: Record<QuotationRequestStatus, StatusTone> = {
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
  customerName: string;
  notes: string;
}

export function QuotationRequestSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [vehicleSource, setVehicleSource] = useState<VehicleSource>("inventory");
  const [vehicleId, setVehicleId] = useState("");
  const [customerVehicle, setCustomerVehicle] = useState<CustomerVehicleDetails>(blankCustomerVehicle);

  const vehiclesQuery = useQuery({
    meta: { banner: true },
    queryKey: ["vehicles", "quotation-options"],
    queryFn: () => getVehicles(),
  });
  const requestsQuery = useQuery({ queryKey: ["quotation-requests"], queryFn: getQuotationRequests });

  const { register, handleSubmit, reset } = useForm<FormValues>({
    defaultValues: { customerName: "", notes: "" },
  });

  const resetAll = () => {
    reset();
    setVehicleSource("inventory");
    setVehicleId("");
    setCustomerVehicle(blankCustomerVehicle);
  };

  const mutation = useMutation({
    mutationFn: requestQuotation,
    onSuccess: () => {
      toast.success(t("valuation.quotationRequest.success"));
      queryClient.invalidateQueries({ queryKey: ["quotation-requests"] });
      resetAll();
      setOpen(false);
    },
  });

  const columns: DataTableColumn<QuotationRequest>[] = [
    { key: "vehicleLabel", header: t("valuation.quotationRequest.table.vehicle"), render: (r) => r.vehicleLabel },
    {
      key: "customerName",
      header: t("valuation.quotationRequest.table.customer"),
      render: (r) => r.customerName ?? "—",
    },
    {
      key: "quotedPrice",
      header: t("valuation.quotationRequest.table.quotedPrice"),
      render: (r) => (r.quotedPrice ? <span className="font-mono">{formatMoney(r.quotedPrice)}</span> : "—"),
    },
    {
      key: "status",
      header: t("valuation.quotationRequest.table.status"),
      render: (r) => (
        <StatusBadge label={t(`valuation.quotationRequest.status.${r.status}`)} tone={statusTone[r.status]} />
      ),
    },
    {
      key: "requestedAt",
      header: t("valuation.quotationRequest.table.requested"),
      render: (r) => new Date(r.requestedAt).toLocaleDateString(),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-primary" />
            <CardTitle>{t("valuation.quotationRequest.title")}</CardTitle>
          </div>
          <Button size="sm" variant={open ? "outline" : "default"} onClick={() => setOpen((v) => !v)}>
            {open ? t("common.cancel") : t("valuation.quotationRequest.form.submit")}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{t("valuation.quotationRequest.subtitle")}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
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
                vehicleLabel = [
                  customerVehicle.year,
                  customerVehicle.make,
                  customerVehicle.model,
                  customerVehicle.variant,
                ]
                  .filter(Boolean)
                  .join(" ");
              }

              mutation.mutate({
                vehicleSource,
                vehicleId: vehicleSource === "inventory" ? vehicleId : undefined,
                vehicleLabel,
                customerVehicle: vehicleSource === "customer_owned" ? customerVehicle : undefined,
                customerName: values.customerName || undefined,
                notes: values.notes || undefined,
              });
            })}
            className="grid grid-cols-1 gap-4 rounded-lg border border-border p-4 sm:grid-cols-2"
          >
            <VehicleSourceFields
              idPrefix="qr"
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

            <FormField label={t("valuation.quotationRequest.form.customerName")} htmlFor="qr-customer">
              <Input id="qr-customer" {...register("customerName")} />
            </FormField>

            <FormField label={t("valuation.quotationRequest.form.notes")} htmlFor="qr-notes">
              <Input id="qr-notes" {...register("notes")} />
            </FormField>

            <div className="sm:col-span-2">
              <Button type="submit" disabled={mutation.isPending}>
                {t("valuation.quotationRequest.form.submit")}
              </Button>
            </div>
          </form>
        )}

        {requestsQuery.isError ? (
          <InlineError error={requestsQuery.error} onRetry={() => requestsQuery.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            rows={requestsQuery.data ?? []}
            loading={requestsQuery.isPending}
            emptyTitle={t("valuation.quotationRequest.empty")}
          />
        )}
      </CardContent>
    </Card>
  );
}
