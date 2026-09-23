"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Car, ChevronLeft, ChevronRight, ImagePlus, Loader2, RefreshCw, Star, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { VehicleGallery } from "@/components/vehicles/vehicle-gallery";
import { useBackendMode } from "@/hooks/use-backend-mode";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { cn } from "@/utils";
import {
  deleteVehiclePhoto,
  getVehiclePhotos,
  reorderVehiclePhoto,
  replaceVehiclePhoto,
  setVehiclePhotoPrimary,
  uploadVehiclePhoto,
  type VehiclePhoto,
} from "@/services/vehicleService";
import type { ApiError } from "@/types/common";

function errorMessage(error: unknown): string {
  const message = (error as Partial<ApiError> | undefined)?.message;
  return typeof message === "string" ? message : "Something went wrong.";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

/**
 * Real image/file architecture for a vehicle's photos (§0.19): upload, multiple photos, ordering, a primary
 * (cover) photo, delete, replace and per-photo metadata — all backed by object storage via
 * /api/v1/vehicles/:id/photos, never by the database itself (server/storage/object-storage.ts). There is no
 * demo equivalent for uploading (a fixture vehicle has no real Storage object to point at), so this only offers
 * the management controls in live mode; otherwise it falls back to the same read-only gallery used before.
 */
export function VehiclePhotoManager({
  vehicleId,
  fallbackImages,
  alt,
}: {
  vehicleId: string;
  fallbackImages: string[];
  alt: string;
}) {
  const { t } = useTranslation();
  const mode = useBackendMode();
  const queryClient = useQueryClient();
  const addInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<VehiclePhoto | null>(null);
  const [pendingUploads, setPendingUploads] = useState(0);

  const photosQuery = useQuery({
    queryKey: ["vehiclePhotos", vehicleId],
    queryFn: () => getVehiclePhotos(vehicleId),
    enabled: mode === "live",
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["vehiclePhotos", vehicleId] });
    // The vehicle list/detail cache also carries a thumbnail (primaryPhotoUrl); keep it in step.
    queryClient.invalidateQueries({ queryKey: ["vehicle", vehicleId] });
    queryClient.invalidateQueries({ queryKey: ["vehicles"] });
  }

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadVehiclePhoto(vehicleId, file),
    onSuccess: invalidate,
    onError: (error) => toast.error(t("inventory.photos.uploadFailed"), { description: errorMessage(error) }),
  });
  const primaryMutation = useMutation({
    mutationFn: (photoId: string) => setVehiclePhotoPrimary(vehicleId, photoId),
    onSuccess: invalidate,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const reorderMutation = useMutation({
    mutationFn: ({ photoId, sortOrder }: { photoId: string; sortOrder: number }) =>
      reorderVehiclePhoto(vehicleId, photoId, sortOrder),
    onSuccess: invalidate,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: (photoId: string) => deleteVehiclePhoto(vehicleId, photoId),
    onSuccess: invalidate,
    onError: (error) => toast.error(t("inventory.photos.deleteFailed"), { description: errorMessage(error) }),
  });
  const replaceMutation = useMutation({
    mutationFn: ({ photo, file }: { photo: VehiclePhoto; file: File }) => replaceVehiclePhoto(vehicleId, photo, file),
    onSuccess: invalidate,
    onError: (error) => toast.error(t("inventory.photos.replaceFailed"), { description: errorMessage(error) }),
  });

  async function handleAddFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    setPendingUploads(list.length);
    for (const file of list) {
      await uploadMutation.mutateAsync(file).catch(() => undefined);
      setPendingUploads((n) => Math.max(0, n - 1));
    }
  }

  function movePhoto(index: number, direction: -1 | 1) {
    const target = index + direction;
    // Index 0 is always the primary photo (pinned first); reordering only applies to the rest.
    if (target <= 0 || target >= photos.length) return;
    const a = photos[index];
    const b = photos[target];
    reorderMutation.mutate({ photoId: a.id, sortOrder: b.sortOrder });
    reorderMutation.mutate({ photoId: b.id, sortOrder: a.sortOrder });
  }

  if (mode !== "live") {
    return (
      <div className="flex flex-col gap-2">
        <VehicleGallery images={fallbackImages} alt={alt} />
        {mode === "demo" && <p className="text-xs text-muted-foreground">{t("inventory.photos.demoNotice")}</p>}
      </div>
    );
  }

  const photos = photosQuery.data ?? [];
  const busy = uploadMutation.isPending || deleteMutation.isPending || replaceMutation.isPending || pendingUploads > 0;

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={addInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleAddFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const photo = replaceTarget.current;
          if (file && photo) replaceMutation.mutate({ photo, file });
          e.target.value = "";
        }}
      />

      {photosQuery.isLoading ? (
        <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-muted">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : photos.length === 0 && pendingUploads === 0 ? (
        <button
          type="button"
          onClick={() => addInputRef.current?.click()}
          className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          <Car className="size-8" />
          <span className="text-sm">{t("inventory.photos.empty")}</span>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
            <ImagePlus className="size-3.5" />
            {t("inventory.photos.addPhotos")}
          </span>
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {photos.map((photo, index) => (
            <Tooltip key={photo.id}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "group relative aspect-video overflow-hidden rounded-lg bg-muted ring-1 ring-transparent",
                    photo.isPrimary && "ring-2 ring-primary"
                  )}
                >
                  {photo.url ? (
                    <Image src={photo.url} alt={photo.fileName} fill className="object-cover" unoptimized />
                  ) : (
                    <div className="flex size-full items-center justify-center">
                      <Car className="size-6 text-muted-foreground/40" />
                    </div>
                  )}

                  {photo.isPrimary && (
                    <span className="absolute start-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-primary/90 px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                      <Star className="size-2.5 fill-current" />
                      {t("inventory.photos.primary")}
                    </span>
                  )}

                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-0.5 bg-gradient-to-t from-black/70 to-transparent p-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <div className="flex items-center gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-white hover:bg-white/20 hover:text-white disabled:opacity-40"
                        disabled={index <= 1}
                        onClick={() => movePhoto(index, -1)}
                        aria-label={t("inventory.photos.moveEarlier")}
                      >
                        <ChevronLeft className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-white hover:bg-white/20 hover:text-white disabled:opacity-40"
                        disabled={index === 0 || index === photos.length - 1}
                        onClick={() => movePhoto(index, 1)}
                        aria-label={t("inventory.photos.moveLater")}
                      >
                        <ChevronRight className="size-3.5" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {!photo.isPrimary && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="text-white hover:bg-white/20 hover:text-white"
                          onClick={() => primaryMutation.mutate(photo.id)}
                          aria-label={t("inventory.photos.setPrimary")}
                        >
                          <Star className="size-3.5" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-white hover:bg-white/20 hover:text-white"
                        onClick={() => {
                          replaceTarget.current = photo;
                          replaceInputRef.current?.click();
                        }}
                        aria-label={t("inventory.photos.replace")}
                      >
                        <RefreshCw className="size-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="text-white hover:bg-white/20 hover:text-white"
                            aria-label={t("inventory.photos.delete")}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("inventory.photos.deleteConfirmTitle")}</AlertDialogTitle>
                            <AlertDialogDescription>{t("inventory.photos.deleteConfirm")}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate(photo.id)}>
                              {t("common.delete")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {photo.fileName} · {formatBytes(photo.sizeBytes)}
              </TooltipContent>
            </Tooltip>
          ))}

          {Array.from({ length: pendingUploads }).map((_, i) => (
            <div
              key={`pending-${i}`}
              className="flex aspect-video items-center justify-center rounded-lg bg-muted"
            >
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ))}

          <button
            type="button"
            onClick={() => addInputRef.current?.click()}
            disabled={busy}
            className="flex aspect-video flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:pointer-events-none disabled:opacity-50"
          >
            <ImagePlus className="size-5" />
            <span className="text-[11px]">{t("inventory.photos.addPhotos")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
