"use client";

import { useState } from "react";
import { Check, Loader2, ShieldAlert, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { ChatToolCall } from "@/types/conversation";

const knownTools = new Set([
  "searchVehicles",
  "getVehicle",
  "searchCustomers",
  "getCustomer",
  "searchLeads",
  "getInventory",
  "calculateProfit",
  "getValuation",
  "requestBankFinancingEvaluation",
  "requestCompanyQuotation",
  "createTask",
]);
const knownStatuses = new Set(["ok", "error", "denied", "awaiting_confirmation", "executed", "rejected", "expired"]);

/**
 * What the AI agent did for an answer (lookups it made, actions it proposed). Proposals are only that: nothing
 * changes until the user presses Approve, and the server checks the user's permissions again at that moment.
 */
export function AgentToolActivity({
  toolCalls,
  onDecide,
}: {
  toolCalls: ChatToolCall[];
  onDecide?: (actionId: string, decision: "approve" | "reject") => Promise<void>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<string | null>(null);

  const label = (tool: string) => (knownTools.has(tool) ? t(`aiAssistant.agent.tools.${tool}`) : tool);
  const statusLabel = (status: string) =>
    knownStatuses.has(status) ? t(`aiAssistant.agent.status.${status}`) : status;

  const decide = async (id: string, decision: "approve" | "reject") => {
    if (!onDecide) return;
    setBusy(id);
    try {
      await onDecide(id, decision);
    } finally {
      setBusy(null);
    }
  };

  return (
    <ul className="flex max-w-[75%] flex-col gap-1.5 ps-9" aria-label={t("aiAssistant.agent.activity")}>
      {toolCalls.map((call) =>
        call.status === "awaiting_confirmation" ? (
          <li
            key={call.id}
            className="flex flex-col gap-2 rounded-xl border border-primary/40 bg-primary/5 p-3 text-xs"
          >
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <ShieldAlert className="size-3.5 text-primary" />
              {t("aiAssistant.agent.proposed")} · {label(call.tool)}
            </span>
            {call.summary && <span className="text-muted-foreground">{call.summary}</span>}
            <span className="flex gap-2">
              <Button size="sm" disabled={busy === call.id || !onDecide} onClick={() => decide(call.id, "approve")}>
                {busy === call.id ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                {t("aiAssistant.agent.approve")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy === call.id || !onDecide}
                onClick={() => decide(call.id, "reject")}
              >
                <X className="size-3.5" />
                {t("aiAssistant.agent.reject")}
              </Button>
            </span>
          </li>
        ) : (
          <li
            key={call.id}
            className={cn(
              "flex items-center gap-1.5 text-xs text-muted-foreground",
              (call.status === "error" || call.status === "denied") && "text-destructive"
            )}
          >
            <Wrench className="size-3 shrink-0" />
            <span className="truncate">
              {label(call.tool)} · {statusLabel(call.status)}
            </span>
          </li>
        )
      )}
    </ul>
  );
}
