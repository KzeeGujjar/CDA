"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { GitCompare } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { FormField } from "@/components/forms/form-field";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { ValuationGauge } from "@/components/vehicles/valuation-gauge";
import { ErrorState } from "@/components/shared/error-state";
import { formatMoney } from "@/components/shared/currency";
import { getMarketValuation } from "@/services/valuation";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { ComparableListing, ValuationQuery } from "@/types/valuation";

function ValuationForm() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const [condition, setCondition] = useState("used");

  const { register, handleSubmit } = useForm<{ make: string; model: string; year: number; mileageKm: number }>({
    defaultValues: {
      make: searchParams.get("make") ?? "",
      model: searchParams.get("model") ?? "",
      year: Number(searchParams.get("year")) || 2023,
      mileageKm: 20000,
    },
  });

  const mutation = useMutation({
    mutationFn: (query: ValuationQuery) => getMarketValuation(query),
  });

  const columns: DataTableColumn<ComparableListing>[] = [
    { key: "title", header: "Listing", render: (c) => c.title },
    { key: "source", header: "Source", render: (c) => c.source },
    { key: "location", header: t("inventory.location"), render: (c) => c.location },
    { key: "mileage", header: t("inventory.mileage"), render: (c) => `${c.mileageKm.toLocaleString()} km` },
    { key: "price", header: t("inventory.price"), render: (c) => <span className="font-mono">{formatMoney(c.price)}</span> },
  ];

  return (
    <>
      <PageHeader
        title={t("valuation.title")}
        subtitle={t("valuation.subtitle")}
        actions={
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/valuation/compare">
              <GitCompare className="size-4" />
              {t("valuation.compareVehicles")}
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>{t("valuation.form.submit")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleSubmit((values) =>
                mutation.mutate({ make: values.make, model: values.model, year: values.year, mileageKm: values.mileageKm, condition })
              )}
              className="flex flex-col gap-4"
            >
              <FormField label={t("valuation.form.make")} htmlFor="v-make">
                <Input id="v-make" {...register("make", { required: true })} placeholder="Toyota" />
              </FormField>
              <FormField label={t("valuation.form.model")} htmlFor="v-model">
                <Input id="v-model" {...register("model", { required: true })} placeholder="Land Cruiser" />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label={t("valuation.form.year")} htmlFor="v-year">
                  <Input id="v-year" type="number" {...register("year", { required: true, valueAsNumber: true })} />
                </FormField>
                <FormField label={t("valuation.form.mileage")} htmlFor="v-mileage">
                  <Input id="v-mileage" type="number" {...register("mileageKm", { required: true, valueAsNumber: true })} />
                </FormField>
              </div>
              <FormField label={t("valuation.form.condition")} htmlFor="v-condition">
                <Select value={condition} onValueChange={setCondition}>
                  <SelectTrigger id="v-condition" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="used">Used</SelectItem>
                    <SelectItem value="certified_pre_owned">Certified pre-owned</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <Button type="submit" disabled={mutation.isPending}>
                {t("valuation.form.submit")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6 lg:col-span-2">
          {mutation.isPending && <Skeleton className="h-48 w-full" />}
          {mutation.isError && <ErrorState onRetry={() => mutation.reset()} />}
          {mutation.data && (
            <>
              <ValuationGauge valuation={mutation.data} />
              <Card>
                <CardHeader>
                  <CardTitle>{t("valuation.comparables")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <DataTable columns={columns} rows={mutation.data.comparables} />
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default function ValuationPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ValuationForm />
    </Suspense>
  );
}
