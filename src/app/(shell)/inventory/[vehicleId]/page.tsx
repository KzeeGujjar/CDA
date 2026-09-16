"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, BadgeCheck, CalendarClock, FileText, Gauge, MapPin, MessageSquare, ShieldCheck, Wrench } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { Currency, formatMoney } from "@/components/shared/currency";
import { PriceBadge } from "@/components/shared/price-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { registrationStatusTone } from "@/components/vehicles/registration-status";
import { VehicleGallery } from "@/components/vehicles/vehicle-gallery";
import { VehicleStatusBadge } from "@/components/vehicles/vehicle-status-badge";
import { VehicleActionBar } from "@/components/vehicles/vehicle-action-bar";
import { VehicleAiAnalysisCard } from "@/components/vehicles/vehicle-ai-analysis-card";
import { ProfitCard } from "@/components/vehicles/profit-card";
import { vehicleSourceMeta } from "@/lib/vehicle-source-meta";
import { getVehicleById, updateVehicle } from "@/services/vehicles";
import { getTasks, updateTaskStatus } from "@/services/tasks";
import { getExpectedProfit, getProfitMarginPct, getTotalCost } from "@/lib/vehicle-finance";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { Vehicle } from "@/types/vehicle";

function inspectionChecklist(vehicle: Vehicle) {
  const majorAccident = vehicle.spec.accidentHistory === "major";
  const anyAccident = vehicle.spec.accidentHistory !== "none";
  return [
    { label: "Engine", pass: !majorAccident },
    { label: "Transmission", pass: true },
    { label: "Brakes", pass: vehicle.daysInStock <= 50 },
    { label: "Suspension", pass: !anyAccident },
    { label: "Electrical", pass: true },
    { label: "Body & paint", pass: !anyAccident },
    { label: "Interior", pass: true },
    { label: "Tires", pass: vehicle.spec.mileageKm <= 20000 },
  ];
}

export default function VehicleDetailPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = use(params);
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [analyzing, setAnalyzing] = useState(false);
  const [notesValue, setNotesValue] = useState<string | null>(null);

  const {
    data: vehicle,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["vehicle", vehicleId],
    queryFn: () => getVehicleById(vehicleId),
  });

  const { data: allTasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: getTasks });
  const vehicleTasks = allTasks.filter((task) => task.vehicleId === vehicleId);

  const notesMutation = useMutation({
    mutationFn: (notes: string) => updateVehicle(vehicleId, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicle", vehicleId] });
      toast.success(t("common.saveChanges"));
    },
  });

  const taskMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "open" | "completed" }) => updateTaskStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  function handleAiAnalyze() {
    setActiveTab("aiAnalysis");
    setAnalyzing(true);
    setTimeout(() => setAnalyzing(false), 900);
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (isError) return <ErrorState onRetry={() => refetch()} />;

  if (!vehicle) {
    return <EmptyState icon={Gauge} title={t("common.noResults")} />;
  }

  const totalCost = getTotalCost(vehicle);
  const expectedProfit = getExpectedProfit(vehicle);
  const profitMarginPct = getProfitMarginPct(vehicle);
  const currentNotes = notesValue ?? vehicle.notes ?? "";
  const SourceIcon = vehicleSourceMeta[vehicle.sourceType].icon;

  return (
    <>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild aria-label={t("common.back")}>
          <Link href="/inventory">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <PageHeader
          title={`${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}`}
          subtitle={vehicle.stockNumber}
        />
      </div>

      <VehicleActionBar vehicle={vehicle} onAiAnalyze={handleAiAnalyze} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <VehicleGallery images={vehicle.images} alt={`${vehicle.make} ${vehicle.model}`} />

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="overflow-x-auto pb-1">
              <TabsList>
                <TabsTrigger value="overview">{t("inventory.tabs.overview")}</TabsTrigger>
                <TabsTrigger value="pricing">{t("inventory.tabs.pricingMargin")}</TabsTrigger>
                <TabsTrigger value="history">{t("inventory.tabs.history")}</TabsTrigger>
                <TabsTrigger value="inspection">{t("inventory.tabs.inspection")}</TabsTrigger>
                <TabsTrigger value="aiAnalysis">{t("inventory.tabs.aiAnalysis")}</TabsTrigger>
                <TabsTrigger value="documents">{t("inventory.tabs.documents")}</TabsTrigger>
                <TabsTrigger value="inquiries">{t("inventory.tabs.inquiries")}</TabsTrigger>
                <TabsTrigger value="notesTasks">
                  {t("inventory.tabs.notes")} & {t("inventory.tabs.tasks")}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview">
              <Card>
                <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                  {[
                    [t("inventory.stockNumber"), vehicle.stockNumber],
                    [t("inventory.vin"), vehicle.spec.vin],
                    [t("inventory.mileage"), `${vehicle.spec.mileageKm.toLocaleString()} km`],
                    [t("inventory.engine"), vehicle.spec.engine],
                    [t("inventory.horsepower"), `${vehicle.spec.horsepower} hp`],
                    [t("inventory.transmission"), vehicle.spec.transmission],
                    [t("inventory.fuelType"), vehicle.spec.fuelType],
                    [t("inventory.exteriorColor"), vehicle.spec.exteriorColor],
                    [t("inventory.interiorColor"), vehicle.spec.interiorColor],
                    [t("inventory.seats"), String(vehicle.spec.seats)],
                    [t("inventory.bodyType"), vehicle.spec.bodyType],
                    [t("inventory.importSpec"), t(`inventory.importSpecs.${vehicle.spec.importSpec}`)],
                    [t("inventory.emirate"), t(`inventory.emirates.${vehicle.emirate}`)],
                    [t("inventory.sourceType"), t(`inventory.sourceTypes.${vehicle.sourceType}`)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground">{label}</span>
                      <span className="font-medium text-foreground">{value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pricing" className="flex flex-col gap-4">
              <Card>
                <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">{t("inventory.purchasePrice")}</span>
                    <Currency money={vehicle.costPrice} className="font-mono font-medium text-foreground" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">{t("inventory.repairCost")}</span>
                    <Currency money={vehicle.repairCost} className="font-mono font-medium text-foreground" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">{t("inventory.transportCost")}</span>
                    <Currency money={vehicle.transportCost} className="font-mono font-medium text-foreground" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">{t("inventory.totalCost")}</span>
                    <span className="font-mono font-medium text-foreground">
                      {formatMoney({ amount: totalCost, currency: vehicle.price.currency })}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">{t("inventory.price")}</span>
                    <PriceBadge price={vehicle.price} marketValue={vehicle.estimatedMarketValue} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">{t("inventory.expectedSellingPrice")}</span>
                    <Currency money={vehicle.expectedSellingPrice} className="font-mono font-medium text-foreground" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">{t("inventory.estimatedMarketValue")}</span>
                    <Currency money={vehicle.estimatedMarketValue} className="font-mono font-medium text-foreground" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">{t("inventory.expectedProfit")}</span>
                    <span className={`font-mono font-medium ${expectedProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                      {formatMoney({ amount: expectedProfit, currency: vehicle.price.currency })}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">{t("inventory.profitMargin")}</span>
                    <span className={`font-mono font-medium ${profitMarginPct >= 0 ? "text-primary" : "text-destructive"}`}>
                      {profitMarginPct.toFixed(1)}%
                    </span>
                  </div>
                </CardContent>
              </Card>
              <Button asChild size="sm" variant="outline" className="w-fit">
                <Link href={`/valuation?make=${vehicle.make}&model=${vehicle.model}&year=${vehicle.year}`}>
                  {t("inventory.getValuation")}
                </Link>
              </Button>
            </TabsContent>

            <TabsContent value="history" className="flex flex-col gap-4">
              <Card>
                <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">{t("inventory.accidentHistory")}</span>
                    <span className="font-medium capitalize text-foreground">{vehicle.spec.accidentHistory}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">{t("inventory.serviceHistory")}</span>
                    <span className="font-medium capitalize text-foreground">{vehicle.spec.serviceHistory}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">{t("inventory.owners")}</span>
                    <span className="font-medium text-foreground">{vehicle.spec.owners}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">{t("inventory.importSpec")}</span>
                    <span className="font-medium text-foreground">{t(`inventory.importSpecs.${vehicle.spec.importSpec}`)}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <BadgeCheck className="size-4 text-primary" />
                    {t("inventory.registration.title")}
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground">{t("inventory.registration.status")}</span>
                      <StatusBadge
                        label={t(`inventory.registration.statuses.${vehicle.registration.status}`)}
                        tone={registrationStatusTone(vehicle.registration.status)}
                      />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground">{t("inventory.registration.plateNumber")}</span>
                      <span className="font-mono font-medium text-foreground">{vehicle.registration.plateNumber ?? "—"}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground">{t("inventory.registration.expiryDate")}</span>
                      <span className="font-medium text-foreground">
                        {vehicle.registration.expiryDate ? new Date(vehicle.registration.expiryDate).toLocaleDateString(locale) : "—"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground">{t("inventory.emirate")}</span>
                      <span className="font-medium text-foreground">{t(`inventory.emirates.${vehicle.emirate}`)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 rounded-lg border border-dashed border-border p-3">
                    <span className="text-xs font-medium text-foreground">{t("inventory.registration.rtaNotes")}</span>
                    <span className="text-sm text-muted-foreground">
                      {vehicle.registration.rtaNotes || t("inventory.registration.rtaNotesEmpty")}
                    </span>
                    <span className="text-xs text-muted-foreground/80">{t("inventory.registration.placeholderNotice")}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <CalendarClock className="size-4 text-muted-foreground" />
                    {t("inventory.tabs.timeline")}
                  </div>
                  <div className="flex flex-col gap-3 border-s border-border ps-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground">
                        {new Date(vehicle.acquiredAt).toLocaleDateString(locale)}
                      </span>
                      <span className="text-sm text-foreground">Vehicle acquired and added to inventory</span>
                    </div>
                    {vehicle.spec.serviceHistory !== "none" && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-muted-foreground">
                          {new Date(vehicle.acquiredAt).toLocaleDateString(locale)}
                        </span>
                        <span className="text-sm text-foreground">Pre-delivery inspection and reconditioning completed</span>
                      </div>
                    )}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground">{t("common.status")}</span>
                      <span className="text-sm text-foreground">
                        Currently {t(`inventory.statuses.${vehicle.status}`)} — {vehicle.daysInStock} days in stock
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="inspection">
              <Card>
                <CardContent className="flex flex-col gap-3">
                  {inspectionChecklist(vehicle).map((item) => (
                    <div key={item.label} className="flex items-center justify-between border-b border-border pb-3 last:border-0 last:pb-0">
                      <div className="flex items-center gap-2">
                        <Wrench className="size-3.5 text-muted-foreground" />
                        <span className="text-sm text-foreground">{item.label}</span>
                      </div>
                      <StatusBadge
                        label={item.pass ? t("inventory.inspection.pass") : t("inventory.inspection.needsAttention")}
                        tone={item.pass ? "success" : "warning"}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="aiAnalysis">
              <VehicleAiAnalysisCard vehicle={vehicle} analyzing={analyzing} onReviewPricing={() => setActiveTab("pricing")} />
            </TabsContent>

            <TabsContent value="documents">
              <EmptyState icon={FileText} title={t("placeholder.contractsDocuments.title")} description={t("common.comingSoonDescription")} />
            </TabsContent>

            <TabsContent value="inquiries">
              <Card>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <MessageSquare className="size-3.5" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-foreground">Interested buyer via WhatsApp</span>
                      <span className="text-xs text-muted-foreground">
                        Asked about financing options and availability for a test drive this week.
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <MessageSquare className="size-3.5" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-foreground">Walk-in showroom inquiry</span>
                      <span className="text-xs text-muted-foreground">
                        Requested a comparison against a similar vehicle from another make.
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notesTasks" className="flex flex-col gap-4">
              <Card>
                <CardContent className="flex flex-col gap-3">
                  <span className="text-sm font-medium text-foreground">{t("inventory.tabs.notes")}</span>
                  <Textarea
                    rows={4}
                    value={currentNotes}
                    onChange={(e) => setNotesValue(e.target.value)}
                    placeholder="Add internal notes about this vehicle..."
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      disabled={notesMutation.isPending}
                      onClick={() => notesMutation.mutate(currentNotes)}
                    >
                      {t("common.saveChanges")}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex flex-col gap-3">
                  <span className="text-sm font-medium text-foreground">{t("inventory.tabs.tasks")}</span>
                  {vehicleTasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("common.noResults")}</p>
                  ) : (
                    vehicleTasks.map((task) => (
                      <div key={task.id} className="flex items-center justify-between">
                        <span
                          className={`text-sm ${task.status === "completed" ? "text-muted-foreground line-through" : "text-foreground"}`}
                        >
                          {task.title}
                        </span>
                        <Switch
                          checked={task.status === "completed"}
                          disabled={taskMutation.isPending}
                          onCheckedChange={(checked) =>
                            taskMutation.mutate({ id: task.id, status: checked ? "completed" : "open" })
                          }
                        />
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t("common.status")}</span>
                <VehicleStatusBadge status={vehicle.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t("inventory.price")}</span>
                <Currency money={vehicle.price} className="font-mono text-lg font-semibold" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t("inventory.daysInStock")}</span>
                <span className="text-sm font-medium">{vehicle.daysInStock}d</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t("inventory.location")}</span>
                <span className="text-sm font-medium">{vehicle.location}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t("inventory.emirate")}</span>
                <span className="inline-flex items-center gap-1 text-sm font-medium">
                  <MapPin className="size-3.5 text-muted-foreground" />
                  {t(`inventory.emirates.${vehicle.emirate}`)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t("inventory.sourceType")}</span>
                <span className="inline-flex items-center gap-1 text-sm font-medium">
                  <SourceIcon className="size-3.5 text-muted-foreground" />
                  {t(`inventory.sourceTypes.${vehicle.sourceType}`)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t("inventory.stockNumber")}</span>
                <span className="text-sm font-medium">{vehicle.stockNumber}</span>
              </div>
            </CardContent>
          </Card>

          <ProfitCard vehicle={vehicle} />

          <Card>
            <CardContent className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <ShieldCheck className="size-4 text-primary" />
                {t("inventory.tabs.history")}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("inventory.accidentHistory")}</span>
                <span className="font-medium capitalize text-foreground">{vehicle.spec.accidentHistory}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("inventory.owners")}</span>
                <span className="font-medium text-foreground">{vehicle.spec.owners}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
