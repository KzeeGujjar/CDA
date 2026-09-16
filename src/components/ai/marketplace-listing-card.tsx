"use client";

import Image from "next/image";
import { toast } from "sonner";
import { Gauge, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/components/shared/currency";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { marketplaceSourceLabel as sourceLabel, marketplaceSourceTone as sourceTone } from "@/lib/marketplace-sources";
import type { MarketplaceListing } from "@/types/marketplace";

export function MarketplaceListingCard({ listing }: { listing: MarketplaceListing }) {
  const { t } = useTranslation();

  return (
    <div className="flex w-56 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        <Image src={listing.images[0]} alt={`${listing.make} ${listing.model}`} fill className="object-cover" sizes="224px" />
        <Badge className={`absolute top-2 start-2 border-0 ${sourceTone[listing.source]}`}>{sourceLabel[listing.source]}</Badge>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-foreground">
            {listing.year} {listing.make} {listing.model}
          </span>
          <span className="truncate text-xs text-muted-foreground">{listing.trim}</span>
        </div>
        <span className="text-sm font-semibold text-primary">{formatMoney(listing.price)}</span>
        <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Gauge className="size-3" /> {listing.mileageKm.toLocaleString()} km
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="size-3" /> {listing.location}
          </span>
        </div>
        <div className="mt-1 flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => toast.info(`${t("aiAssistant.marketplace.viewListingToast")} (${sourceLabel[listing.source]})`)}
          >
            {t("aiAssistant.marketplace.viewListing")}
          </Button>
          <Button
            size="sm"
            className="flex-1"
            onClick={() => toast.success(t("aiAssistant.marketplace.addedToInventory"))}
          >
            {t("aiAssistant.marketplace.addToInventory")}
          </Button>
        </div>
      </div>
    </div>
  );
}
