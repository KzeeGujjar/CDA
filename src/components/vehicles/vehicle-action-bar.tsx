"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bookmark, Copy, FileSignature, FileText, GitCompare, Pencil, Printer, Sparkles, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateVehicle } from "@/services/vehicleService";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { Vehicle } from "@/types/vehicle";

export function VehicleActionBar({ vehicle, onAiAnalyze }: { vehicle: Vehicle; onAiAnalyze: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const reserveMutation = useMutation({
    mutationFn: () => updateVehicle(vehicle.id, { status: "reserved" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicle", vehicle.id] });
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      toast.success(`${vehicle.make} ${vehicle.model} marked as reserved`);
    },
  });

  function handleShare() {
    const url = typeof window !== "undefined" ? `${window.location.origin}/inventory/${vehicle.id}` : "";
    navigator.clipboard?.writeText(url).then(() => toast.success(t("inventory.actions.linkCopied")));
  }

  function handlePrint() {
    window.print();
  }

  function handleGenerateContract() {
    toast.info(t("inventory.actions.contractComingSoon"));
  }

  const canTransact = vehicle.status !== "sold" && vehicle.status !== "archived";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild size="sm" variant="outline" className="gap-1.5">
        <Link href={`/inventory/${vehicle.id}/edit`}>
          <Pencil className="size-3.5" />
          {t("inventory.actions.edit")}
        </Link>
      </Button>
      {canTransact && (
        <Button asChild size="sm" className="gap-1.5">
          <Link href={`/deals/new?vehicleId=${vehicle.id}`}>
            <Tag className="size-3.5" />
            {t("inventory.actions.sell")}
          </Link>
        </Button>
      )}
      {canTransact && (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={vehicle.status === "reserved" || reserveMutation.isPending}
          onClick={() => reserveMutation.mutate()}
        >
          <Bookmark className="size-3.5" />
          {t("inventory.actions.reserve")}
        </Button>
      )}
      {canTransact && (
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <Link href={`/deals/new?vehicleId=${vehicle.id}`}>
            <FileText className="size-3.5" />
            {t("inventory.actions.generateQuote")}
          </Link>
        </Button>
      )}
      <Button size="sm" variant="outline" className="gap-1.5" onClick={handleGenerateContract}>
        <FileSignature className="size-3.5" />
        {t("inventory.actions.generateContract")}
      </Button>
      <Button size="sm" variant="outline" className="gap-1.5 text-primary" onClick={onAiAnalyze}>
        <Sparkles className="size-3.5" />
        {t("inventory.actions.aiAnalyze")}
      </Button>
      <Button asChild size="sm" variant="outline" className="gap-1.5">
        <Link href={`/valuation/compare?vehicleId=${vehicle.id}`}>
          <GitCompare className="size-3.5" />
          {t("inventory.actions.compare")}
        </Link>
      </Button>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={handleShare}>
        <Copy className="size-3.5" />
        {t("inventory.actions.share")}
      </Button>
      <Button size="sm" variant="ghost" className="gap-1.5" onClick={handlePrint}>
        <Printer className="size-3.5" />
        {t("inventory.actions.print")}
      </Button>
    </div>
  );
}
