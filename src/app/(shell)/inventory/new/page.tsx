"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/forms/form-field";
import { vehicleFormSchema, type VehicleFormValues } from "@/lib/validation/vehicle-schema";
import { vehicleStatusOrder } from "@/components/vehicles/vehicle-status";
import { registrationStatusOrder } from "@/components/vehicles/registration-status";
import { createVehicle } from "@/services/vehicleService";
import { emirates } from "@/lib/emirates";
import { vehicleSourceTypes } from "@/lib/vehicle-source-meta";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { applyFormError } from "@/lib/errors/form";
import { notifyError } from "@/lib/errors/notify";

export default function NewVehiclePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    register,
    control,
    handleSubmit,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleFormSchema),
    defaultValues: {
      condition: "used",
      status: "available",
      fuelType: "petrol",
      transmission: "automatic",
      seats: 5,
      repairCost: 0,
      transportCost: 0,
      importSpec: "GCC",
      accidentHistory: "none",
      serviceHistory: "full",
      owners: 1,
      emirate: "dubai",
      sourceType: "dealer",
      registrationStatus: "not_registered",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: VehicleFormValues) =>
      createVehicle({
        stockNumber: values.stockNumber,
        make: values.make,
        model: values.model,
        trim: values.trim,
        year: values.year,
        condition: values.condition,
        status: values.status,
        price: { amount: values.price, currency: "AED" },
        costPrice: { amount: values.costPrice, currency: "AED" },
        repairCost: { amount: values.repairCost, currency: "AED" },
        transportCost: { amount: values.transportCost, currency: "AED" },
        expectedSellingPrice: { amount: values.expectedSellingPrice, currency: "AED" },
        estimatedMarketValue: { amount: values.estimatedMarketValue, currency: "AED" },
        images: ["https://picsum.photos/seed/new-vehicle/640/420"],
        location: values.location,
        emirate: values.emirate,
        sourceType: values.sourceType,
        registration: {
          status: values.registrationStatus,
          plateNumber: values.plateNumber || undefined,
          expiryDate: values.registrationExpiryDate || undefined,
          rtaNotes: values.rtaNotes || undefined,
        },
        notes: values.notes,
        spec: {
          engine: "",
          horsepower: values.horsepower,
          fuelType: values.fuelType,
          transmission: values.transmission,
          mileageKm: values.mileageKm,
          exteriorColor: values.exteriorColor,
          interiorColor: values.interiorColor,
          seats: values.seats,
          bodyType: values.bodyType,
          vin: values.vin,
          importSpec: values.importSpec,
          accidentHistory: values.accidentHistory,
          serviceHistory: values.serviceHistory,
          owners: values.owners,
        },
      }),
    // Server validation errors land next to their fields; anything else is reported by a notification.
    onError: (error) => {
      if (!applyFormError(error, { getValues, setError })) notifyError(error);
    },
    onSuccess: (vehicle) => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      toast.success(`${vehicle.year} ${vehicle.make} ${vehicle.model} added to inventory`);
      router.push(`/inventory/${vehicle.id}`);
    },
  });

  return (
    <>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild aria-label={t("common.back")}>
          <Link href="/inventory">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <PageHeader title={t("inventory.addVehicle")} />
      </div>

      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Vehicle details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormField label="Stock number" htmlFor="stockNumber" error={errors.stockNumber?.message}>
              <Input id="stockNumber" {...register("stockNumber")} placeholder="STK-24021" />
            </FormField>
            <FormField label={t("inventory.make")} htmlFor="make" error={errors.make?.message}>
              <Input id="make" {...register("make")} placeholder="Toyota" />
            </FormField>
            <FormField label={t("inventory.model")} htmlFor="model" error={errors.model?.message}>
              <Input id="model" {...register("model")} placeholder="Land Cruiser" />
            </FormField>
            <FormField label="Variant / Trim" htmlFor="trim" error={errors.trim?.message}>
              <Input id="trim" {...register("trim")} placeholder="GXR V6" />
            </FormField>
            <FormField label={t("inventory.year")} htmlFor="year" error={errors.year?.message}>
              <Input id="year" type="number" {...register("year", { valueAsNumber: true })} />
            </FormField>
            <FormField label="Condition" htmlFor="condition">
              <Controller
                control={control}
                name="condition"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="condition" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="used">Used</SelectItem>
                      <SelectItem value="certified_pre_owned">Certified pre-owned</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField label={t("inventory.status")} htmlFor="status">
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicleStatusOrder.map((status) => (
                        <SelectItem key={status} value={status}>
                          {t(`inventory.statuses.${status}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField label={t("inventory.importSpec")} htmlFor="importSpec">
              <Controller
                control={control}
                name="importSpec"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="importSpec" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["GCC", "UAE", "Imported"] as const).map((spec) => (
                        <SelectItem key={spec} value={spec}>
                          {t(`inventory.importSpecs.${spec}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField label={t("inventory.location")} htmlFor="location" error={errors.location?.message}>
              <Input id="location" {...register("location")} placeholder="Downtown Dubai Showroom" />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("inventory.registration.title")}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormField label={t("inventory.emirate")} htmlFor="emirate">
              <Controller
                control={control}
                name="emirate"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="emirate" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {emirates.map((e) => (
                        <SelectItem key={e} value={e}>
                          {t(`inventory.emirates.${e}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField label={t("inventory.sourceType")} htmlFor="sourceType">
              <Controller
                control={control}
                name="sourceType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="sourceType" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicleSourceTypes.map((s) => (
                        <SelectItem key={s} value={s}>
                          {t(`inventory.sourceTypes.${s}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField label={t("inventory.registration.status")} htmlFor="registrationStatus">
              <Controller
                control={control}
                name="registrationStatus"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="registrationStatus" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {registrationStatusOrder.map((s) => (
                        <SelectItem key={s} value={s}>
                          {t(`inventory.registration.statuses.${s}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField label={t("inventory.registration.plateNumber")} htmlFor="plateNumber">
              <Input id="plateNumber" {...register("plateNumber")} placeholder="Dubai O 12345" />
            </FormField>
            <FormField label={t("inventory.registration.expiryDate")} htmlFor="registrationExpiryDate">
              <Input id="registrationExpiryDate" type="date" {...register("registrationExpiryDate")} />
            </FormField>
            <FormField
              label={t("inventory.registration.rtaNotes")}
              htmlFor="rtaNotes"
              className="sm:col-span-2 lg:col-span-3"
            >
              <Textarea
                id="rtaNotes"
                {...register("rtaNotes")}
                rows={2}
                placeholder={t("inventory.registration.rtaNotesPlaceholder")}
              />
              <span className="text-xs text-muted-foreground">{t("inventory.registration.placeholderNotice")}</span>
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("inventory.tabs.pricingMargin")}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormField label="Purchase price" htmlFor="costPrice" error={errors.costPrice?.message}>
              <Input id="costPrice" type="number" {...register("costPrice", { valueAsNumber: true })} />
            </FormField>
            <FormField label="Repair cost" htmlFor="repairCost" error={errors.repairCost?.message}>
              <Input id="repairCost" type="number" {...register("repairCost", { valueAsNumber: true })} />
            </FormField>
            <FormField label="Transport cost" htmlFor="transportCost" error={errors.transportCost?.message}>
              <Input id="transportCost" type="number" {...register("transportCost", { valueAsNumber: true })} />
            </FormField>
            <FormField label={t("inventory.price")} htmlFor="price" error={errors.price?.message}>
              <Input id="price" type="number" {...register("price", { valueAsNumber: true })} />
            </FormField>
            <FormField
              label="Expected selling price"
              htmlFor="expectedSellingPrice"
              error={errors.expectedSellingPrice?.message}
            >
              <Input
                id="expectedSellingPrice"
                type="number"
                {...register("expectedSellingPrice", { valueAsNumber: true })}
              />
            </FormField>
            <FormField
              label="Estimated market value"
              htmlFor="estimatedMarketValue"
              error={errors.estimatedMarketValue?.message}
            >
              <Input
                id="estimatedMarketValue"
                type="number"
                {...register("estimatedMarketValue", { valueAsNumber: true })}
              />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Specification</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormField label={t("inventory.mileage")} htmlFor="mileageKm" error={errors.mileageKm?.message}>
              <Input id="mileageKm" type="number" {...register("mileageKm", { valueAsNumber: true })} />
            </FormField>
            <FormField label="Horsepower" htmlFor="horsepower" error={errors.horsepower?.message}>
              <Input id="horsepower" type="number" {...register("horsepower", { valueAsNumber: true })} />
            </FormField>
            <FormField label="Fuel type" htmlFor="fuelType">
              <Controller
                control={control}
                name="fuelType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="fuelType" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="petrol">Petrol</SelectItem>
                      <SelectItem value="diesel">Diesel</SelectItem>
                      <SelectItem value="hybrid">Hybrid</SelectItem>
                      <SelectItem value="electric">Electric</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField label="Transmission" htmlFor="transmission">
              <Controller
                control={control}
                name="transmission"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="transmission" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="automatic">Automatic</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField label="Exterior color" htmlFor="exteriorColor" error={errors.exteriorColor?.message}>
              <Input id="exteriorColor" {...register("exteriorColor")} />
            </FormField>
            <FormField label="Interior color" htmlFor="interiorColor" error={errors.interiorColor?.message}>
              <Input id="interiorColor" {...register("interiorColor")} />
            </FormField>
            <FormField label="Seats" htmlFor="seats" error={errors.seats?.message}>
              <Input id="seats" type="number" {...register("seats", { valueAsNumber: true })} />
            </FormField>
            <FormField label="Body type" htmlFor="bodyType" error={errors.bodyType?.message}>
              <Input id="bodyType" {...register("bodyType")} placeholder="SUV" />
            </FormField>
            <FormField label={t("inventory.vin")} htmlFor="vin" error={errors.vin?.message}>
              <Input id="vin" {...register("vin")} />
            </FormField>
            <FormField label="Owners" htmlFor="owners" error={errors.owners?.message}>
              <Input id="owners" type="number" {...register("owners", { valueAsNumber: true })} />
            </FormField>
            <FormField label="Accident history" htmlFor="accidentHistory">
              <Controller
                control={control}
                name="accidentHistory"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="accidentHistory" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="minor">Minor</SelectItem>
                      <SelectItem value="major">Major</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField label="Service history" htmlFor="serviceHistory">
              <Controller
                control={control}
                name="serviceHistory"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="serviceHistory" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Full</SelectItem>
                      <SelectItem value="partial">Partial</SelectItem>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField label="Notes" htmlFor="notes" className="sm:col-span-2 lg:col-span-3">
              <Textarea id="notes" {...register("notes")} rows={3} />
            </FormField>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" asChild>
            <Link href="/inventory">{t("common.cancel")}</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting || mutation.isPending}>
            {t("common.save")}
          </Button>
        </div>
      </form>
    </>
  );
}
