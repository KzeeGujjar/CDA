"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Rocket } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { marketingTypeToChannel } from "@/lib/marketing-content-meta";
import { InlineError } from "@/components/shared/inline-state";
import { createCampaign, getCampaigns } from "@/services/marketingService";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { CampaignStatus, GeneratedMarketingContent, MarketingChannel } from "@/types/marketing";
import type { Vehicle } from "@/types/vehicle";

const statusTone: Record<CampaignStatus, StatusTone> = { draft: "neutral", scheduled: "info", published: "success" };

export function CampaignBuilderCard({
  vehicle,
  selectedContent,
  campaignName,
  onCampaignNameChange,
  onCreated,
}: {
  vehicle: Vehicle | undefined;
  selectedContent: GeneratedMarketingContent[];
  campaignName: string;
  onCampaignNameChange: (value: string) => void;
  onCreated: () => void;
}) {
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();

  const {
    data: campaigns,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({ queryKey: ["marketing-campaigns"], queryFn: getCampaigns });

  const channels: MarketingChannel[] = Array.from(new Set(selectedContent.map((c) => marketingTypeToChannel[c.type])));

  const mutation = useMutation({
    mutationFn: () => {
      if (!vehicle) throw new Error("No vehicle selected");
      return createCampaign({
        name: campaignName,
        vehicleId: vehicle.id,
        vehicleLabel: `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}`,
        channels,
      });
    },
    onSuccess: (campaign) => {
      queryClient.invalidateQueries({ queryKey: ["marketing-campaigns"] });
      toast.success(`${campaign.name} ${t("aiMarketing.campaignCreatedToast")}`);
      onCreated();
    },
  });

  const canCreate = Boolean(vehicle) && campaignName.trim().length > 0 && selectedContent.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Rocket className="size-4" /> {t("aiMarketing.createCampaign")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder={t("aiMarketing.campaignNamePlaceholder")}
            value={campaignName}
            onChange={(e) => onCampaignNameChange(e.target.value)}
            className="flex-1"
          />
          <Button
            disabled={!canCreate || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="shrink-0 gap-1.5"
          >
            <Rocket className="size-3.5" />
            {t("aiMarketing.createCampaign")}
          </Button>
        </div>

        {selectedContent.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>
              {selectedContent.length} {t("aiMarketing.piecesSelected")}:
            </span>
            {channels.map((ch) => (
              <StatusBadge key={ch} label={t(`aiMarketing.channels.${ch}`)} tone="neutral" />
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("aiMarketing.pastCampaigns")}
          </span>
          {isLoading ? null : isError ? (
            <InlineError error={error} onRetry={() => refetch()} />
          ) : !campaigns || campaigns.length === 0 ? (
            <EmptyState icon={Rocket} title={t("common.noResults")} />
          ) : (
            campaigns.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <div className="flex flex-col overflow-hidden">
                  <span className="truncate text-foreground">{c.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {c.vehicleLabel} · {new Date(c.createdAt).toLocaleDateString(locale)}
                  </span>
                </div>
                <StatusBadge label={t(`aiMarketing.statuses.${c.status}`)} tone={statusTone[c.status]} />
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
