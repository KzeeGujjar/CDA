"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function VehiclePhotoUploader({ existingImages }: { existingImages: string[] }) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [newImages, setNewImages] = useState<string[]>([]);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const newUrls = Array.from(files).map((file) => URL.createObjectURL(file));
    setNewImages((prev) => [...prev, ...newUrls]);
  }

  function removeAt(index: number) {
    setNewImages((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {existingImages.map((src, i) => (
          <div key={`existing-${i}`} className="relative aspect-square overflow-hidden rounded-lg bg-muted">
            <Image src={src} alt={`Photo ${i + 1}`} fill className="object-cover" unoptimized />
          </div>
        ))}
        {newImages.map((src, i) => (
          <div key={`new-${i}`} className="group relative aspect-square overflow-hidden rounded-lg bg-muted ring-2 ring-primary/40">
            <Image src={src} alt={`New photo ${i + 1}`} fill className="object-cover" unoptimized />
            <button
              type="button"
              onClick={() => removeAt(i)}
              className="absolute end-1 top-1 flex size-5 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 transition-opacity group-hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          <ImagePlus className="size-5" />
          <span className="text-[11px]">{t("aiMarketing.addPhotos")}</span>
        </button>
      </div>
    </div>
  );
}
