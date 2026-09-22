"use client";

import { useState } from "react";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { InlineError } from "@/components/shared/inline-state";
import { formatMoney } from "@/components/shared/currency";
import { getMarketplaceListingsBySource } from "@/services/marketplaceService";
import { createVehicle } from "@/services/vehicleService";
import { listingToVehicleInput } from "@/lib/marketplace-import";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { PackageSearch } from "lucide-react";

export function FetchDubizzleInventoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

  const {
    data: listings,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["dubizzle-listings"],
    queryFn: () => getMarketplaceListingsBySource("dubizzle"),
    enabled: open,
  });

  const selectedListings = (listings ?? []).filter((l) => !excludedIds.has(l.id));

  const importMutation = useMutation({
    mutationFn: () => Promise.all(selectedListings.map((listing) => createVehicle(listingToVehicleInput(listing)))),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      toast.success(`${created.length} ${t("settings.marketplaceConnections.importedToast")}`);
      setExcludedIds(new Set());
      onOpenChange(false);
    },
  });

  function toggle(id: string) {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("settings.marketplaceConnections.fetchDialogTitle")}</DialogTitle>
          <DialogDescription>{t("settings.marketplaceConnections.fetchDialogDescription")}</DialogDescription>
        </DialogHeader>

        <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
          ) : isError ? (
            <InlineError error={error} onRetry={() => refetch()} />
          ) : !listings || listings.length === 0 ? (
            <EmptyState icon={PackageSearch} title={t("common.noResults")} />
          ) : (
            listings.map((listing) => (
              <label
                key={listing.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-2.5 transition-colors hover:bg-muted/50"
              >
                <Checkbox checked={!excludedIds.has(listing.id)} onCheckedChange={() => toggle(listing.id)} />
                <div className="relative size-12 shrink-0 overflow-hidden rounded-md bg-muted">
                  <Image
                    src={listing.images[0]}
                    alt={`${listing.make} ${listing.model}`}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">
                    {listing.year} {listing.make} {listing.model} {listing.trim}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatMoney(listing.price)} · {listing.mileageKm.toLocaleString()} km
                  </span>
                </div>
              </label>
            ))
          )}
        </div>

        <DialogFooter>
          <Button
            disabled={selectedListings.length === 0 || importMutation.isPending}
            onClick={() => importMutation.mutate()}
          >
            {importMutation.isPending
              ? t("settings.marketplaceConnections.importing")
              : `${t("settings.marketplaceConnections.addToInventory")} (${selectedListings.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
