"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { FormField } from "@/components/forms/form-field";
import { EmptyState } from "@/components/shared/empty-state";
import { createDashboardAd, deleteDashboardAd, getDashboardAds, updateDashboardAd } from "@/services/dashboard-ads";
import { dashboardAdSchema, type DashboardAdValues } from "@/lib/validation/dashboard-ad-schema";
import type { DashboardAd } from "@/types/dashboard-ad";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

const emptyValues: DashboardAdValues = {
  title: "",
  description: "",
  ctaLabel: "",
  ctaUrl: "",
  badge: "",
  active: true,
};

function AdFormDialog({
  ad,
  open,
  onOpenChange,
}: {
  ad?: DashboardAd;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<DashboardAdValues>({
    resolver: zodResolver(dashboardAdSchema),
    values: ad
      ? { title: ad.title, description: ad.description, ctaLabel: ad.ctaLabel, ctaUrl: ad.ctaUrl, badge: ad.badge ?? "", active: ad.active }
      : emptyValues,
  });

  const mutation = useMutation({
    mutationFn: (values: DashboardAdValues) => (ad ? updateDashboardAd(ad.id, values) : createDashboardAd(values)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-ads"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-ads-active"] });
      toast.success(t("common.saveChanges"));
      reset(emptyValues);
      onOpenChange(false);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset(emptyValues);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{ad ? t("settings.dashboardAds.editAd") : t("settings.dashboardAds.addAd")}</DialogTitle>
          <DialogDescription>{t("settings.dashboardAds.formHint")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
        >
          <FormField label={t("settings.dashboardAds.fieldTitle")} htmlFor="ad-title" error={errors.title?.message}>
            <Input id="ad-title" {...register("title")} />
          </FormField>
          <FormField label={t("settings.dashboardAds.fieldDescription")} htmlFor="ad-description" error={errors.description?.message}>
            <Textarea id="ad-description" rows={2} {...register("description")} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("settings.dashboardAds.fieldCtaLabel")} htmlFor="ad-cta-label" error={errors.ctaLabel?.message}>
              <Input id="ad-cta-label" {...register("ctaLabel")} />
            </FormField>
            <FormField label={t("settings.dashboardAds.fieldBadge")} htmlFor="ad-badge">
              <Input id="ad-badge" placeholder="New" {...register("badge")} />
            </FormField>
          </div>
          <FormField label={t("settings.dashboardAds.fieldCtaUrl")} htmlFor="ad-cta-url" error={errors.ctaUrl?.message}>
            <Input id="ad-cta-url" placeholder="/inventory" {...register("ctaUrl")} />
          </FormField>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <span className="text-sm font-medium text-foreground">{t("settings.dashboardAds.fieldActive")}</span>
            <Controller
              control={control}
              name="active"
              render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {t("common.saveChanges")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DashboardAdsManager() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAd, setEditingAd] = useState<DashboardAd | undefined>(undefined);

  const { data: ads, isLoading } = useQuery({ queryKey: ["dashboard-ads"], queryFn: getDashboardAds });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => updateDashboardAd(id, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-ads"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-ads-active"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDashboardAd(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-ads"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-ads-active"] });
      toast.success(t("settings.dashboardAds.deleted"));
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="size-4" /> {t("settings.dashboardAds.title")}
          </CardTitle>
          <CardDescription>{t("settings.dashboardAds.subtitle")}</CardDescription>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => {
            setEditingAd(undefined);
            setDialogOpen(true);
          }}
        >
          <Plus className="size-3.5" /> {t("settings.dashboardAds.addAd")}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !ads || ads.length === 0 ? (
          <EmptyState icon={Megaphone} title={t("settings.dashboardAds.empty")} description={t("settings.dashboardAds.emptyDescription")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("settings.dashboardAds.fieldTitle")}</TableHead>
                <TableHead>{t("settings.dashboardAds.fieldCtaLabel")}</TableHead>
                <TableHead>{t("settings.dashboardAds.fieldActive")}</TableHead>
                <TableHead className="text-end">{t("common.edit")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ads.map((ad) => (
                <TableRow key={ad.id}>
                  <TableCell>
                    <div className="flex max-w-xs flex-col gap-0.5">
                      <span className="flex items-center gap-1.5 truncate font-medium text-foreground">
                        {ad.title}
                        {ad.badge && (
                          <Badge variant="secondary" className="shrink-0">
                            {ad.badge}
                          </Badge>
                        )}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">{ad.description}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{ad.ctaLabel}</TableCell>
                  <TableCell>
                    <Switch
                      checked={ad.active}
                      onCheckedChange={(checked) => toggleMutation.mutate({ id: ad.id, active: checked })}
                    />
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setEditingAd(ad);
                          setDialogOpen(true);
                        }}
                        aria-label={t("common.edit")}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon-sm" className="text-destructive" aria-label={t("common.delete")}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("settings.dashboardAds.confirmDeleteTitle")}</AlertDialogTitle>
                            <AlertDialogDescription>{t("settings.dashboardAds.confirmDeleteDescription")}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate(ad.id)}>
                              {t("common.delete")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <AdFormDialog ad={editingAd} open={dialogOpen} onOpenChange={setDialogOpen} />
    </Card>
  );
}
