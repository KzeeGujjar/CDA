"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, DownloadCloud, ExternalLink, FileSpreadsheet, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/forms/form-field";
import { FetchDubizzleInventoryDialog } from "./fetch-dubizzle-inventory-dialog";
import { ImportDubizzleCsvDialog } from "./import-dubizzle-csv-dialog";
import { InlineEmpty, InlineError } from "@/components/shared/inline-state";
import {
  connectMarketplace,
  disconnectMarketplace,
  getMarketplaceConnections,
} from "@/services/marketplaceConnectionService";
import {
  marketplaceConnectionSchema,
  type MarketplaceConnectionValues,
} from "@/lib/validation/marketplace-connection-schema";
import { marketplaceSourceLabel, marketplaceSourceTone } from "@/lib/marketplace-sources";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

function ConnectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MarketplaceConnectionValues>({
    resolver: zodResolver(marketplaceConnectionSchema),
    defaultValues: { accountUrl: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: MarketplaceConnectionValues) => connectMarketplace("dubizzle", values.accountUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketplace-connections"] });
      toast.success(t("settings.marketplaceConnections.connectedToast"));
      reset({ accountUrl: "" });
      onOpenChange(false);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset({ accountUrl: "" });
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("settings.marketplaceConnections.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("settings.marketplaceConnections.dialogDescription")}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
          <FormField
            label={t("settings.marketplaceConnections.fieldLabel")}
            htmlFor="dubizzle-url"
            error={errors.accountUrl?.message}
          >
            <Input
              id="dubizzle-url"
              type="url"
              placeholder={t("settings.marketplaceConnections.fieldPlaceholder")}
              {...register("accountUrl")}
            />
          </FormField>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? t("settings.marketplaceConnections.connecting")
                : t("settings.marketplaceConnections.connect")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MarketplaceConnectionsCard() {
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fetchDialogOpen, setFetchDialogOpen] = useState(false);
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);

  const {
    data: connections,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["marketplace-connections"],
    queryFn: getMarketplaceConnections,
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectMarketplace("dubizzle"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketplace-connections"] });
      toast.success(t("settings.marketplaceConnections.disconnectedToast"));
    },
  });

  const dubizzle = connections?.find((c) => c.source === "dubizzle");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="size-4" /> {t("settings.marketplaceConnections.title")}
        </CardTitle>
        <CardDescription>{t("settings.marketplaceConnections.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : isError ? (
          <InlineError error={error} onRetry={() => refetch()} />
        ) : !dubizzle ? (
          <InlineEmpty />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3.5">
            <div className="flex items-center gap-3">
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${marketplaceSourceTone.dubizzle}`}
              >
                {marketplaceSourceLabel.dubizzle.charAt(0)}
              </span>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">{marketplaceSourceLabel.dubizzle}</span>
                {dubizzle.connected ? (
                  <div className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-1 text-xs text-primary">
                      <CheckCircle2 className="size-3" /> {t("settings.marketplaceConnections.connected")}
                      {dubizzle.connectedAt && ` · ${new Date(dubizzle.connectedAt).toLocaleDateString(locale)}`}
                    </span>
                    {dubizzle.accountUrl && (
                      <a
                        href={dubizzle.accountUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                      >
                        <ExternalLink className="size-3" />
                        <span className="max-w-56 truncate">{dubizzle.accountUrl}</span>
                      </a>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {t("settings.marketplaceConnections.notConnected")}
                  </span>
                )}
              </div>
            </div>
            {dubizzle.connected ? (
              <div className="flex items-center gap-2">
                <Button size="sm" className="gap-1.5" onClick={() => setFetchDialogOpen(true)}>
                  <DownloadCloud className="size-3.5" />
                  {t("settings.marketplaceConnections.fetchInventory")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disconnectMutation.isPending}
                  onClick={() => disconnectMutation.mutate()}
                >
                  {t("settings.marketplaceConnections.disconnect")}
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                {t("settings.marketplaceConnections.connect")}
              </Button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border p-3.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">
              {t("settings.marketplaceConnections.csvRowTitle")}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("settings.marketplaceConnections.csvRowDescription")}
            </span>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCsvDialogOpen(true)}>
            <FileSpreadsheet className="size-3.5" />
            {t("settings.marketplaceConnections.csvButton")}
          </Button>
        </div>
      </CardContent>

      <ConnectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <FetchDubizzleInventoryDialog open={fetchDialogOpen} onOpenChange={setFetchDialogOpen} />
      <ImportDubizzleCsvDialog open={csvDialogOpen} onOpenChange={setCsvDialogOpen} />
    </Card>
  );
}
