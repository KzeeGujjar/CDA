"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search, Car, UserRound, Target, Handshake, FileText, ListChecks, MessageSquare, Bot } from "lucide-react";
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
import { getVehicles } from "@/services/vehicleService";
import { getCustomers } from "@/services/customerService";
import { getLeads } from "@/services/leadService";
import { getDeals } from "@/services/dealService";
import { getDocuments } from "@/services/documentService";
import { getTasks } from "@/services/taskService";
import { getConversations } from "@/services/messageService";
import { getChatThreads } from "@/services/aiService";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const { t } = useTranslation();

  const searching = query.trim().length > 0;
  const queryOpts = { enabled: open && searching };

  const { data: vehicles = [] } = useQuery({
    meta: { banner: true },
    queryKey: ["vehicles", "palette"],
    queryFn: () => getVehicles(),
    ...queryOpts,
  });
  const { data: customers = [] } = useQuery({
    meta: { banner: true },
    queryKey: ["customers", "palette"],
    queryFn: () => getCustomers(),
    ...queryOpts,
  });
  const { data: leads = [] } = useQuery({
    meta: { banner: true },
    queryKey: ["leads", "palette"],
    queryFn: () => getLeads(),
    ...queryOpts,
  });
  const { data: deals = [] } = useQuery({
    meta: { banner: true },
    queryKey: ["deals", "palette"],
    queryFn: () => getDeals(),
    ...queryOpts,
  });
  const { data: documents = [] } = useQuery({
    meta: { banner: true },
    queryKey: ["documents", "palette"],
    queryFn: () => getDocuments(),
    ...queryOpts,
  });
  const { data: tasks = [] } = useQuery({
    meta: { banner: true },
    queryKey: ["tasks", "palette"],
    queryFn: () => getTasks(),
    ...queryOpts,
  });
  const { data: conversations = [] } = useQuery({
    meta: { banner: true },
    queryKey: ["conversations", "palette"],
    queryFn: () => getConversations(),
    ...queryOpts,
  });
  const { data: chatThreads = [] } = useQuery({
    meta: { banner: true },
    queryKey: ["chat-threads", "palette"],
    queryFn: () => getChatThreads(),
    ...queryOpts,
  });

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

          {searching && vehicles.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={t("inventory.title")}>
                {vehicles.map((v) => (
                  <CommandItem
                    key={v.id}
                    value={`${v.year} ${v.make} ${v.model} ${v.trim} ${v.stockNumber} ${v.spec.vin}`}
                    onSelect={() => go(`/inventory/${v.id}`)}
                  >
                    <Car className="size-4" />
                    {v.year} {v.make} {v.model} <span className="text-muted-foreground">{v.trim}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {searching && customers.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={t("nav.customers")}>
                {customers.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${c.name} ${c.email} ${c.phone}`}
                    onSelect={() => go(`/customers/${c.id}`)}
                  >
                    <UserRound className="size-4" />
                    {c.name} <span className="text-muted-foreground">{c.email}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {searching && leads.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={t("nav.leads")}>
                {leads.map((l) => (
                  <CommandItem
                    key={l.id}
                    value={`${l.customerName} ${l.interestedVehicleLabel ?? ""}`}
                    onSelect={() => go(`/leads/${l.id}`)}
                  >
                    <Target className="size-4" />
                    {l.customerName}
                    {l.interestedVehicleLabel && (
                      <span className="text-muted-foreground">{l.interestedVehicleLabel}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {searching && deals.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={t("nav.deals")}>
                {deals.map((d) => (
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

          {searching && documents.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={t("contractsDocuments.title")}>
                {documents.map((doc) => (
                  <CommandItem
                    key={doc.id}
                    value={`${doc.title} ${doc.customerName ?? ""} ${doc.vehicleLabel ?? ""}`}
                    onSelect={() => go("/contracts-documents")}
                  >
                    <FileText className="size-4" />
                    {doc.title}
                    {doc.customerName && <span className="text-muted-foreground">{doc.customerName}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {searching && tasks.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={t("tasks.title")}>
                {tasks.map((task) => (
                  <CommandItem
                    key={task.id}
                    value={`${task.title} ${task.customerName ?? ""} ${task.assignedToName}`}
                    onSelect={() => go("/tasks")}
                  >
                    <ListChecks className="size-4" />
                    {task.title}
                    <span className="text-muted-foreground">{task.assignedToName}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {searching && conversations.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={t("messages.title")}>
                {conversations.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${c.contactName} ${c.lastMessagePreview}`}
                    onSelect={() => go("/messages")}
                  >
                    <MessageSquare className="size-4" />
                    {c.contactName}
                    <span className="truncate text-muted-foreground">{c.lastMessagePreview}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {searching && chatThreads.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={t("common.aiConversations")}>
                {chatThreads.map((thread) => (
                  <CommandItem
                    key={thread.id}
                    value={`${thread.title} ${thread.lastMessagePreview}`}
                    onSelect={() => go("/ai-assistant")}
                  >
                    <Bot className="size-4" />
                    {thread.title}
                    <span className="truncate text-muted-foreground">{thread.lastMessagePreview}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
