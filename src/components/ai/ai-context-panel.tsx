"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Car, GitCompare, Sparkles, TrendingUp, User, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatMoney } from "@/components/shared/currency";
import { getVehicles } from "@/services/vehicleService";
import { getCustomers } from "@/services/customerService";
import { getProfitMarginPct } from "@/lib/vehicle-finance";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function AiContextPanel({
  vehicleId,
  onVehicleChange,
  customerId,
  onCustomerChange,
}: {
  vehicleId: string;
  onVehicleChange: (id: string) => void;
  customerId: string;
  onCustomerChange: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { data: vehicles = [] } = useQuery({
    meta: { banner: true },
    queryKey: ["vehicles"],
    queryFn: () => getVehicles(),
  });
  const { data: customers = [] } = useQuery({
    meta: { banner: true },
    queryKey: ["customers"],
    queryFn: () => getCustomers(),
  });

  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const customer = customers.find((c) => c.id === customerId);

  const topProfitVehicles = useMemo(
    () =>
      // A vehicle whose margin is hidden (no profit:read) sorts last, never first as if it had a 0% margin.
      [...vehicles]
        .sort((a, b) => (getProfitMarginPct(b) ?? -Infinity) - (getProfitMarginPct(a) ?? -Infinity))
        .slice(0, 3),
    [vehicles]
  );

  const dealHref = `/deals/new?${[vehicleId && `vehicleId=${vehicleId}`, customerId && `customerId=${customerId}`]
    .filter(Boolean)
    .join("&")}`;

  return (
    <div className="flex w-full flex-col gap-4 xl:w-80 xl:shrink-0">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Car className="size-4" /> {t("aiAssistant.context.vehicle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Select value={vehicleId || undefined} onValueChange={onVehicleChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("aiAssistant.context.selectVehicle")} />
            </SelectTrigger>
            <SelectContent>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.year} {v.make} {v.model} {v.trim}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {vehicle && (
            <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-xs">
              <div className="flex flex-col">
                <span className="font-medium text-foreground">
                  {vehicle.year} {vehicle.make} {vehicle.model}
                </span>
                <span className="text-muted-foreground">{formatMoney(vehicle.price)}</span>
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onVehicleChange("")}
                aria-label={t("aiAssistant.context.removeVehicle")}
              >
                <X className="size-3" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <User className="size-4" /> {t("aiAssistant.context.customer")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Select value={customerId || undefined} onValueChange={onCustomerChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("aiAssistant.context.selectCustomer")} />
            </SelectTrigger>
            <SelectContent>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {customer && (
            <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                <Avatar className="size-6">
                  <AvatarImage src={customer.avatarUrl} alt={customer.name} />
                  <AvatarFallback>{customer.name.slice(0, 2)}</AvatarFallback>
                </Avatar>
                <span className="font-medium text-foreground">{customer.name}</span>
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onCustomerChange("")}
                aria-label={t("aiAssistant.context.removeCustomer")}
              >
                <X className="size-3" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <TrendingUp className="size-4" /> {t("aiAssistant.context.recommendations")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {topProfitVehicles.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => onVehicleChange(v.id)}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-start text-xs transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <span className="text-foreground">
                {v.year} {v.make} {v.model}
              </span>
              <span className="font-mono font-medium text-primary">
                {(() => {
                  const pct = getProfitMarginPct(v);
                  return pct === null ? t("common.restricted") : `${pct.toFixed(1)}%`;
                })()}
              </span>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="size-4" /> {t("aiAssistant.context.actions")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {vehicleId ? (
            <Button asChild size="sm" variant="outline" className="justify-start gap-2">
              <Link href={dealHref}>
                <Sparkles className="size-3.5" />
                {t("aiAssistant.context.generateQuote")}
              </Link>
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="justify-start gap-2" disabled>
              <Sparkles className="size-3.5" />
              {t("aiAssistant.context.generateQuote")}
            </Button>
          )}
          {vehicle ? (
            <Button asChild size="sm" variant="outline" className="justify-start gap-2">
              <Link href={`/valuation?make=${vehicle.make}&model=${vehicle.model}&year=${vehicle.year}`}>
                <TrendingUp className="size-3.5" />
                {t("aiAssistant.context.estimateValue")}
              </Link>
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="justify-start gap-2" disabled>
              <TrendingUp className="size-3.5" />
              {t("aiAssistant.context.estimateValue")}
            </Button>
          )}
          {vehicle ? (
            <Button asChild size="sm" variant="outline" className="justify-start gap-2">
              <Link href={`/valuation/compare?vehicleId=${vehicle.id}`}>
                <GitCompare className="size-3.5" />
                {t("aiAssistant.context.compareVehicle")}
              </Link>
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="justify-start gap-2" disabled>
              <GitCompare className="size-3.5" />
              {t("aiAssistant.context.compareVehicle")}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
