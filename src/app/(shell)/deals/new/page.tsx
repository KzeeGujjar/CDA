"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { FormField } from "@/components/forms/form-field";
import { getCustomers } from "@/services/customers";
import { getVehicles } from "@/services/vehicles";
import { createDeal } from "@/services/deals";
import { formatMoney } from "@/components/shared/currency";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export default function NewDealPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [customerId, setCustomerId] = useState<string>(() => searchParams.get("customerId") ?? "");
  const [vehicleId, setVehicleId] = useState<string>(() => searchParams.get("vehicleId") ?? "");
  const [notes, setNotes] = useState("");

  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: () => getCustomers() });
  const { data: vehicles = [] } = useQuery({ queryKey: ["vehicles", "available"], queryFn: () => getVehicles() });

  const customer = customers.find((c) => c.id === customerId);
  const vehicle = vehicles.find((v) => v.id === vehicleId);

  const vatRate = 0.05;
  const subtotal = vehicle?.price.amount ?? 0;
  const vatAmount = Math.round(subtotal * vatRate);
  const total = subtotal + vatAmount;

  const mutation = useMutation({
    mutationFn: () => {
      if (!customer || !vehicle) throw new Error("Missing customer or vehicle");
      return createDeal({
        customerId: customer.id,
        customerName: customer.name,
        vehicleId: vehicle.id,
        vehicleLabel: `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}`,
        status: "draft",
        vatRate,
        lineItems: [
          { id: "li-1", label: `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}`, amount: vehicle.price },
        ],
        notes,
      });
    },
    onSuccess: (deal) => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      toast.success(`Deal ${deal.reference} created`);
      router.push(`/deals/${deal.id}`);
    },
  });

  const canSubmit = Boolean(customer && vehicle);

  const vehicleOptions = useMemo(() => vehicles.filter((v) => v.status === "available" || v.status === "reserved"), [vehicles]);

  return (
    <>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild aria-label={t("common.back")}>
          <Link href="/deals">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <PageHeader title={t("deals.newDeal")} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Deal details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FormField label={t("deals.customer")} htmlFor="customer">
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger id="customer" className="w-full">
                  <SelectValue placeholder={t("deals.customer")} />
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
            <FormField label={t("deals.vehicle")} htmlFor="vehicle">
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger id="vehicle" className="w-full">
                  <SelectValue placeholder={t("deals.vehicle")} />
                </SelectTrigger>
                <SelectContent>
                  {vehicleOptions.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.year} {v.make} {v.model} {v.trim}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Notes" htmlFor="notes">
              <Textarea id="notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </FormField>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" asChild>
                <Link href="/deals">{t("common.cancel")}</Link>
              </Button>
              <Button disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>
                {t("common.create")}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader>
            <CardTitle>Quote preview</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{t("deals.customer")}</span>
              <span className="text-sm font-medium text-foreground">{customer?.name ?? "—"}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground">
                {vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}` : "—"}
              </span>
              <span className="font-mono text-foreground">{vehicle ? formatMoney(vehicle.price) : "—"}</span>
            </div>
            <Separator />
            <div className="flex flex-col gap-1.5 text-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>{t("deals.subtotal")}</span>
                <span className="font-mono">{formatMoney({ amount: subtotal, currency: "AED" })}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>{t("deals.vat")}</span>
                <span className="font-mono">{formatMoney({ amount: vatAmount, currency: "AED" })}</span>
              </div>
              <div className="flex items-center justify-between text-base font-semibold text-foreground">
                <span>{t("deals.total")}</span>
                <span className="font-mono">{formatMoney({ amount: total, currency: "AED" })}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
