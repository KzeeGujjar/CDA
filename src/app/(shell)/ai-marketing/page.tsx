"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { VehiclePhotoUploader } from "@/components/marketing/vehicle-photo-uploader";
import { MarketingFunctionGrid } from "@/components/marketing/marketing-function-grid";
import { TranslateAdvertisementCard } from "@/components/marketing/translate-advertisement-card";
import { GeneratedContentList } from "@/components/marketing/generated-content-list";
import { CampaignBuilderCard } from "@/components/marketing/campaign-builder-card";
import { getVehicles } from "@/services/vehicleService";
import {
  generateMarketingContent,
  translateAdvertisement,
  type TranslationTargetLanguage,
} from "@/lib/marketing-generator";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { GeneratedMarketingContent, MarketingContentType, MarketingGeneratedType } from "@/types/marketing";

export default function AiMarketingPage() {
  const { t } = useTranslation();
  const [vehicleId, setVehicleId] = useState("");
  const [generatedContent, setGeneratedContent] = useState<GeneratedMarketingContent[]>([]);
  const [generatingType, setGeneratingType] = useState<MarketingGeneratedType | null>(null);
  const [newestId, setNewestId] = useState<string | null>(null);
  const [selectedContentIds, setSelectedContentIds] = useState<Set<string>>(new Set());
  const [campaignName, setCampaignName] = useState("");

  const { data: vehicles = [] } = useQuery({
    meta: { banner: true },
    queryKey: ["vehicles"],
    queryFn: () => getVehicles(),
  });
  const vehicle = vehicles.find((v) => v.id === vehicleId);

  function toggleSelect(id: string) {
    setSelectedContentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleGenerate(type: MarketingContentType) {
    if (!vehicle) return;
    setGeneratingType(type);
    setTimeout(() => {
      const item: GeneratedMarketingContent = {
        id: `gen-${Math.random().toString(36).slice(2, 9)}`,
        vehicleId: vehicle.id,
        type,
        content: generateMarketingContent(vehicle, type),
        createdAt: new Date().toISOString(),
      };
      setGeneratedContent((prev) => [item, ...prev]);
      setNewestId(item.id);
      setGeneratingType(null);
    }, 900);
  }

  function handleTranslate(target: TranslationTargetLanguage) {
    if (!vehicle) return;
    setGeneratingType("translated_ad");
    setTimeout(() => {
      const item: GeneratedMarketingContent = {
        id: `gen-${Math.random().toString(36).slice(2, 9)}`,
        vehicleId: vehicle.id,
        type: "translated_ad",
        targetLanguage: target,
        content: translateAdvertisement(vehicle, target),
        createdAt: new Date().toISOString(),
      };
      setGeneratedContent((prev) => [item, ...prev]);
      setNewestId(item.id);
      setGeneratingType(null);
    }, 900);
  }

  const vehicleContent = generatedContent.filter((c) => c.vehicleId === vehicleId);
  const selectedContent = vehicleContent.filter((c) => selectedContentIds.has(c.id));

  return (
    <>
      <PageHeader title={t("aiMarketing.title")} subtitle={t("aiMarketing.subtitle")} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Camera className="size-4" /> {t("aiMarketing.vehicleAndPhotos")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Select value={vehicleId} onValueChange={setVehicleId}>
            <SelectTrigger className="w-full sm:w-80">
              <SelectValue placeholder={t("aiMarketing.selectVehicle")} />
            </SelectTrigger>
            <SelectContent>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.year} {v.make} {v.model} {v.trim}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {vehicle && <VehiclePhotoUploader key={vehicle.id} existingImages={vehicle.images} />}
        </CardContent>
      </Card>

      {!vehicle ? (
        <EmptyState icon={Sparkles} title={t("aiMarketing.selectVehiclePrompt")} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Sparkles className="size-4" /> {t("aiMarketing.generateContent")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MarketingFunctionGrid disabled={!vehicle} generatingType={generatingType} onGenerate={handleGenerate} />
            </CardContent>
          </Card>

          <TranslateAdvertisementCard
            disabled={!vehicle || generatingType !== null}
            isGenerating={generatingType === "translated_ad"}
            onTranslate={handleTranslate}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="flex flex-col gap-3 lg:col-span-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("aiMarketing.generatedHistory")}
              </span>
              <GeneratedContentList
                items={vehicleContent}
                selectedIds={selectedContentIds}
                onToggleSelect={toggleSelect}
                newestId={newestId}
              />
            </div>

            <CampaignBuilderCard
              vehicle={vehicle}
              selectedContent={selectedContent}
              campaignName={campaignName}
              onCampaignNameChange={setCampaignName}
              onCreated={() => {
                setCampaignName("");
                setSelectedContentIds(new Set());
              }}
            />
          </div>
        </>
      )}
    </>
  );
}
