"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, FileSpreadsheet, Upload } from "lucide-react";
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
import { formatMoney } from "@/components/shared/currency";
import { parseCsv } from "@/lib/csv";
import { parseDubizzleRow, csvRowToVehicleInput, type CsvImportRow } from "@/lib/dubizzle-csv-import";
import { createVehicle } from "@/services/vehicleService";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function ImportDubizzleCsvDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<CsvImportRow[] | null>(null);
  const [excludedIndices, setExcludedIndices] = useState<Set<number>>(new Set());

  function reset() {
    setFileName(null);
    setRows(null);
    setExcludedIndices(new Set());
  }

  function handleFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const { rows: parsed } = parseCsv(text);
      setRows(parsed.map(parseDubizzleRow));
      setExcludedIndices(new Set());
    };
    reader.readAsText(file);
  }

  function toggle(index: number) {
    setExcludedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const selectedRows = (rows ?? [])
    .map((row, index) => ({ row, index }))
    .filter(({ row, index }) => row.valid && !excludedIndices.has(index));

  const importMutation = useMutation({
    mutationFn: () =>
      Promise.all(selectedRows.map(({ row, index }) => createVehicle(csvRowToVehicleInput(row, index)))),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      toast.success(`${created.length} ${t("settings.marketplaceConnections.importedToast")}`);
      reset();
      onOpenChange(false);
    },
  });

  const validCount = (rows ?? []).filter((r) => r.valid).length;
  const invalidCount = (rows ?? []).length - validCount;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("settings.marketplaceConnections.csvDialogTitle")}</DialogTitle>
          <DialogDescription>{t("settings.marketplaceConnections.csvDialogDescription")}</DialogDescription>
        </DialogHeader>

        {!rows ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-8 text-center transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <Upload className="size-6 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              {t("settings.marketplaceConnections.csvChooseFile")}
            </span>
            <span className="text-xs text-muted-foreground">{t("settings.marketplaceConnections.csvHint")}</span>
          </button>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-xs">
              <span className="flex items-center gap-1.5 truncate text-foreground">
                <FileSpreadsheet className="size-3.5 shrink-0" />
                {fileName}
              </span>
              <Button variant="ghost" size="sm" onClick={reset}>
                {t("settings.marketplaceConnections.csvChooseDifferent")}
              </Button>
            </div>

            {invalidCount > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  {invalidCount} {t("settings.marketplaceConnections.csvInvalidRows")}
                </span>
              </div>
            )}

            <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
              {rows.map((row, index) => (
                <label
                  key={index}
                  className={`flex items-center gap-3 rounded-lg border p-2.5 transition-colors ${
                    row.valid
                      ? "cursor-pointer border-border hover:bg-muted/50"
                      : "border-destructive/20 bg-destructive/5 opacity-70"
                  }`}
                >
                  <Checkbox
                    checked={row.valid && !excludedIndices.has(index)}
                    disabled={!row.valid}
                    onCheckedChange={() => toggle(index)}
                  />
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-md bg-muted">
                    <Image src={row.images[0]} alt="" fill className="object-cover" unoptimized />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">
                      {row.year ?? "—"} {row.make ?? "Unknown make"} {row.model ?? "Unknown model"} {row.trim ?? ""}
                    </span>
                    {row.valid ? (
                      <span className="text-xs text-muted-foreground">
                        {row.price !== undefined ? formatMoney({ amount: row.price, currency: "AED" }) : "—"}
                        {row.mileageKm !== undefined ? ` · ${row.mileageKm.toLocaleString()} km` : ""}
                      </span>
                    ) : (
                      <span className="text-xs text-destructive">{row.errors.join(", ")}</span>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />

        {rows && (
          <DialogFooter>
            <Button
              disabled={selectedRows.length === 0 || importMutation.isPending}
              onClick={() => importMutation.mutate()}
            >
              {importMutation.isPending
                ? t("settings.marketplaceConnections.importing")
                : `${t("settings.marketplaceConnections.addToInventory")} (${selectedRows.length})`}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
