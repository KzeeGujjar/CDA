"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, Copy, Download, Send, Sparkles, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AiSuggestionChip } from "@/components/ai/ai-suggestion-chip";
import { useMockStream } from "@/hooks/use-mock-stream";
import { getVehicles } from "@/services/vehicleService";
import { getCustomers } from "@/services/customerService";
import { getDocumentAssistantResponse } from "@/lib/document-assistant";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { cn } from "@/utils";
import type { DocumentType } from "@/types/document";

interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface GeneratedDoc {
  title: string;
  content: string;
  type: DocumentType;
}

const suggestedPromptKeys = [
  "createPurchaseAgreement",
  "prepareQuotation",
  "summarizeInspection",
  "translateArabic",
  "findMissingInfo",
] as const;

function downloadText(title: string, content: string) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `${title.replace(/[^a-z0-9]+/gi, "-")}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function AssistantBubble({ message, streaming }: { message: AssistantMessage; streaming: boolean }) {
  const isUser = message.role === "user";
  const revealed = useMockStream(message.content, streaming && !isUser);
  return (
    <div className={cn("flex items-start gap-2.5", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
        )}
      >
        {isUser ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
      </div>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
        )}
      >
        {revealed}
      </div>
    </div>
  );
}

export function DocumentAssistantPanel() {
  const { t } = useTranslation();
  const [vehicleId, setVehicleId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [lastDocument, setLastDocument] = useState<GeneratedDoc | null>(null);
  const [streamingId, setStreamingId] = useState<string | null>(null);

  const { data: vehicles = [] } = useQuery({
    meta: { banner: true },
    queryKey: ["vehicles"],
    queryFn: () => getVehicles(),
  });
  const { data: customers = [] } = useQuery({
    meta: { banner: true },
    queryKey: ["customers"],
    queryFn: () => getCustomers(),
  });

  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const customer = customers.find((c) => c.id === customerId);
  const messageIdCounter = useRef(0);

  function nextMessageId(): string {
    messageIdCounter.current += 1;
    return `m-${messageIdCounter.current}`;
  }

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const userMessage: AssistantMessage = { id: nextMessageId(), role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    setTimeout(() => {
      const result = getDocumentAssistantResponse(trimmed, {
        vehicle,
        customer,
        lastDocument: lastDocument ?? undefined,
      });
      const assistantMessage: AssistantMessage = {
        id: nextMessageId(),
        role: "assistant",
        content: result.reply,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setStreamingId(assistantMessage.id);
      if (result.documentTitle && result.documentContent && result.documentType) {
        setLastDocument({ title: result.documentTitle, content: result.documentContent, type: result.documentType });
      }
    }, 700);
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardContent className="flex h-[520px] flex-col gap-3 py-4">
          <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder={t("contractsDocuments.fields.vehicle")} />
              </SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.year} {v.make} {v.model} {v.trim}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder={t("contractsDocuments.fields.customer")} />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div
            className="flex flex-1 flex-col gap-3 overflow-y-auto"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
          >
            {messages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Sparkles className="size-5" />
                </div>
                <p className="max-w-xs text-sm text-muted-foreground">{t("contractsDocuments.aiAssistant.intro")}</p>
              </div>
            ) : (
              messages.map((m) => <AssistantBubble key={m.id} message={m} streaming={m.id === streamingId} />)
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {suggestedPromptKeys.map((key) => (
              <AiSuggestionChip
                key={key}
                label={t(`contractsDocuments.aiAssistant.prompts.${key}`)}
                onClick={() => send(t(`contractsDocuments.aiAssistant.prompts.${key}`))}
              />
            ))}
          </div>

          <div className="flex items-end gap-2 border-t border-border pt-3">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder={t("contractsDocuments.aiAssistant.placeholder")}
              aria-label={t("contractsDocuments.aiAssistant.placeholder")}
              rows={1}
              className="max-h-32 min-h-9 flex-1 resize-none"
            />
            <Button size="icon" onClick={() => send(input)} disabled={!input.trim()} aria-label={t("common.send")}>
              <Send className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex h-[520px] flex-col gap-3 py-4">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("contractsDocuments.aiAssistant.previewTitle")}
          </span>
          {!lastDocument ? (
            <div className="flex flex-1 items-center justify-center text-center text-sm text-muted-foreground">
              {t("contractsDocuments.aiAssistant.noPreview")}
            </div>
          ) : (
            <>
              <span className="text-sm font-medium text-foreground">{lastDocument.title}</span>
              <pre
                dir="auto"
                className="flex-1 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 font-sans text-xs leading-relaxed text-foreground"
              >
                {lastDocument.content}
              </pre>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() =>
                    navigator.clipboard
                      ?.writeText(lastDocument.content)
                      .then(() => toast.success(t("contractsDocuments.actions.copied")))
                  }
                >
                  <Copy className="size-3.5" /> {t("contractsDocuments.actions.copy")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => downloadText(lastDocument.title, lastDocument.content)}
                >
                  <Download className="size-3.5" /> {t("contractsDocuments.actions.download")}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
