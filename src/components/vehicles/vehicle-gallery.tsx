"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/utils";

export function VehicleGallery({ images, alt }: { images: string[]; alt: string }) {
  const [active, setActive] = useState(0);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
        <Image src={images[active] ?? images[0]} alt={alt} fill className="object-cover" unoptimized />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={img}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                "relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-transparent transition-all",
                active === i && "ring-2 ring-primary"
              )}
            >
              <Image src={img} alt="" fill className="object-cover" unoptimized />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
