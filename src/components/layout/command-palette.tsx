"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search, Car, UserRound, Target, Handshake, FileText, ListChecks, MessageSquare, Bot, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { navGroups } from "@/constants";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { globalSearch, type GroupedSearchResults, type SearchResultItem } from "@/services/searchService";
import { getDeals } from "@/services/dealService";

// Deals has no backend search yet (the deals module itself is demo data only, §0.17/§0.29) — kept exactly as
// it was: fetched and filtered client-side, unlike the other 7 groups below.
const DEAL_CAP = 5;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 250);
  const router = useRouter();
  const { t } = useTranslation();

  const searching = query.trim().length > 0;
  const debouncedSearching = debouncedQuery.trim().length > 0;

  const { data: results } = useQuery({
    meta: { banner: true },
    queryKey: ["search", "palette", debouncedQuery],
    queryFn: () => globalSearch(debouncedQuery),
    enabled: open && debouncedSearching,
  });
  const groups: GroupedSearchResults = results ?? {
    vehicles: [],
    customers: [],
    leads: [],
    documents: [],
    tasks: [],
    messages: [],
    aiConversations: [],
  };

  const { data: deals = [] } = useQuery({
    meta: { banner: true },
    queryKey: ["deals", "palette"],
    queryFn: () => getDeals(),
    enabled: open && searching,
  });
  const dealMatches = deals
    .filter((d) => `${d.reference} ${d.customerName} ${d.vehicleLabel}`.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, DEAL_CAP);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }

  function go(href: string) {
    handleOpenChange(false);
    router.push(href);
  }

  function resultGroup(heading: string, icon: LucideIcon, items: SearchResultItem[]) {
    if (!searching || items.length === 0) return null;
    const Icon = icon;
    return (
      <>
        <CommandSeparator />
        <CommandGroup heading={heading}>
          {items.map((item) => (
            <CommandItem key={item.id} value={`${item.title} ${item.subtitle ?? ""}`} onSelect={() => go(item.link)}>
              <Icon className="size-4" />
              {item.title}
              {item.subtitle && <span className="truncate text-muted-foreground">{item.subtitle}</span>}
            </CommandItem>
          ))}
        </CommandGroup>
      </>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="hidden w-64 items-center justify-between gap-2 text-muted-foreground sm:flex"
      >
        <span className="flex items-center gap-2">
          <Search className="size-3.5" />
          {t("common.search")}
        </span>
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="sm:hidden"
        aria-label={t("common.search")}
      >
        <Search className="size-4.5" />
      </Button>
      <CommandDialog open={open} onOpenChange={handleOpenChange} title={t("common.search")}>
        <CommandInput value={query} onValueChange={setQuery} placeholder={t("common.searchPlaceholder")} />
        <CommandList>
          <CommandEmpty>{t("common.noResults")}</CommandEmpty>

          {!searching && (
            <CommandGroup heading={t("nav.groups.overview")}>
              {navGroups
                .flatMap((g) => g.items)
                .map((item) => (
                  <CommandItem key={item.key} value={t(item.labelKey)} onSelect={() => go(item.href)}>
                    <item.icon className="size-4" />
                    {t(item.labelKey)}
                  </CommandItem>
                ))}
            </CommandGroup>
          )}

          {resultGroup(t("inventory.title"), Car, groups.vehicles)}
          {resultGroup(t("nav.customers"), UserRound, groups.customers)}
          {resultGroup(t("nav.leads"), Target, groups.leads)}

          {searching && dealMatches.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={t("nav.deals")}>
                {dealMatches.map((d) => (
                  <CommandItem
                    key={d.id}
                    value={`${d.reference} ${d.customerName} ${d.vehicleLabel}`}
                    onSelect={() => go(`/deals/${d.id}`)}
                  >
                    <Handshake className="size-4" />
                    <span className="font-mono">{d.reference}</span>
                    <span className="text-muted-foreground">{d.customerName}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {resultGroup(t("contractsDocuments.title"), FileText, groups.documents)}
          {resultGroup(t("tasks.title"), ListChecks, groups.tasks)}
          {resultGroup(t("messages.title"), MessageSquare, groups.messages)}
          {resultGroup(t("common.aiConversations"), Bot, groups.aiConversations)}
        </CommandList>
      </CommandDialog>
    </>
  );
}
