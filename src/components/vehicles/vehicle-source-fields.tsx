"use client";

import { Car, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/forms/form-field";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { cn } from "@/utils";
import type { Vehicle } from "@/types/vehicle";
import type { CustomerVehicleDetails, VehicleSource } from "@/types/vehicle-request";

export function VehicleSourceFields({
  idPrefix,
  vehicles,
  source,
  onSourceChange,
  vehicleId,
  onVehicleIdChange,
  customerVehicle,
  onCustomerVehicleChange,
}: {
  idPrefix: string;
  vehicles: Vehicle[];
  source: VehicleSource;
  onSourceChange: (source: VehicleSource) => void;
  vehicleId: string;
  onVehicleIdChange: (id: string) => void;
  customerVehicle: CustomerVehicleDetails;
  onCustomerVehicleChange: (patch: Partial<CustomerVehicleDetails>) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4 sm:col-span-2">
      <div className="inline-flex w-fit rounded-lg border border-border p-1">
        {(["inventory", "customer_owned"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onSourceChange(option)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              source === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option === "inventory" ? <Car className="size-3.5" /> : <User className="size-3.5" />}
            {t(`valuation.vehicleSource.${option === "inventory" ? "inventory" : "customerOwned"}`)}
          </button>
        ))}
      </div>

      {source === "inventory" ? (
        <FormField label={t("valuation.vehicleSource.vehicle")} htmlFor={`${idPrefix}-vehicle`}>
          <Select value={vehicleId} onValueChange={onVehicleIdChange}>
            <SelectTrigger id={`${idPrefix}-vehicle`} className="w-full">
              <SelectValue placeholder={t("valuation.vehicleSource.vehiclePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.year} {v.make} {v.model} — {v.stockNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <FormField label={t("valuation.form.make")} htmlFor={`${idPrefix}-make`}>
            <Input
              id={`${idPrefix}-make`}
              value={customerVehicle.make}
              onChange={(e) => onCustomerVehicleChange({ make: e.target.value })}
              placeholder="Toyota"
            />
          </FormField>
          <FormField label={t("valuation.form.model")} htmlFor={`${idPrefix}-model`}>
            <Input
              id={`${idPrefix}-model`}
              value={customerVehicle.model}
              onChange={(e) => onCustomerVehicleChange({ model: e.target.value })}
              placeholder="Land Cruiser"
            />
          </FormField>
          <FormField label={t("valuation.form.variant")} htmlFor={`${idPrefix}-variant`}>
            <Input
              id={`${idPrefix}-variant`}
              value={customerVehicle.variant}
              onChange={(e) => onCustomerVehicleChange({ variant: e.target.value })}
              placeholder="VXR"
            />
          </FormField>
          <FormField label={t("valuation.form.year")} htmlFor={`${idPrefix}-year`}>
            <Input
              id={`${idPrefix}-year`}
              type="number"
              value={customerVehicle.year}
              onChange={(e) => onCustomerVehicleChange({ year: Number(e.target.value) })}
            />
          </FormField>
          <FormField label={t("valuation.form.mileage")} htmlFor={`${idPrefix}-mileage`}>
            <Input
              id={`${idPrefix}-mileage`}
              type="number"
              value={customerVehicle.mileageKm}
              onChange={(e) => onCustomerVehicleChange({ mileageKm: Number(e.target.value) })}
            />
          </FormField>
          <FormField label={t("valuation.form.condition")} htmlFor={`${idPrefix}-condition`} className="col-span-2">
            <Select
              value={customerVehicle.condition}
              onValueChange={(v) => onCustomerVehicleChange({ condition: v as CustomerVehicleDetails["condition"] })}
            >
              <SelectTrigger id={`${idPrefix}-condition`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="used">Used</SelectItem>
                <SelectItem value="certified_pre_owned">Certified pre-owned</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label={t("valuation.form.specifications")} htmlFor={`${idPrefix}-specs`} className="col-span-2">
            <Textarea
              id={`${idPrefix}-specs`}
              value={customerVehicle.specifications}
              onChange={(e) => onCustomerVehicleChange({ specifications: e.target.value })}
              placeholder={t("valuation.form.specificationsPlaceholder")}
              rows={2}
            />
          </FormField>
        </div>
      )}
    </div>
  );
}
