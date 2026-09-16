"use client";

import { useState } from "react";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { dealerships } from "@/constants";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function DealershipSelector() {
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState(dealerships[0].id);
  const active = dealerships.find((d) => d.id === activeId)!;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="hidden max-w-52 gap-1.5 lg:flex">
          <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{active.name}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{t("common.switchDealership")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {dealerships.map((d) => (
          <DropdownMenuItem key={d.id} onClick={() => setActiveId(d.id)}>
            <span className="flex-1">{d.name}</span>
            {d.id === activeId && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
