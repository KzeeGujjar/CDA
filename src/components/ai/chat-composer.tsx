"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/utils";
import { Globe, Image as ImageIcon, Mic, Paperclip, Send, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function ChatComposer({ disabled, onSend }: { disabled?: boolean; onSend: (text: string) => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [listening, setListening] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>, kind: "file" | "photo") {
    const file = e.target.files?.[0];
    if (file) {
      toast.success(
        kind === "photo"
          ? `${t("aiAssistant.composer.photoAttached")}: ${file.name}`
          : `${t("aiAssistant.composer.fileAttached")}: ${file.name}`
      );
    }
    e.target.value = "";
  }

  function handleVoiceClick() {
    setListening(true);
    setTimeout(() => setListening(false), 2500);
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border p-3">
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              className="text-primary"
              disabled={disabled}
              onClick={() => onSend(t("aiAssistant.marketplace.prompt"))}
              aria-label={t("aiAssistant.marketplace.fetchButton")}
            >
              <Store className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("aiAssistant.marketplace.fetchButton")}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
              aria-label={t("aiAssistant.composer.attachFile")}
            >
              <Paperclip className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("aiAssistant.composer.attachFile")}</TooltipContent>
        </Tooltip>
        <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => handleFileSelected(e, "file")} />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={disabled}
              onClick={() => photoInputRef.current?.click()}
              aria-label={t("aiAssistant.composer.uploadPhoto")}
            >
              <ImageIcon className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("aiAssistant.composer.uploadPhoto")}</TooltipContent>
        </Tooltip>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFileSelected(e, "photo")}
        />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={disabled}
              className={cn(listening && "border-destructive/40 text-destructive")}
              onClick={handleVoiceClick}
              aria-label={listening ? t("aiAssistant.composer.listening") : t("aiAssistant.composer.voiceInput")}
            >
              <Mic className={cn("size-3.5", listening && "animate-pulse")} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{listening ? t("aiAssistant.composer.listening") : t("aiAssistant.composer.voiceInput")}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={disabled}
              className={cn(webSearchEnabled && "border-primary/40 bg-primary/10 text-primary")}
              onClick={() => setWebSearchEnabled((v) => !v)}
              aria-label={t("aiAssistant.composer.searchWeb")}
              aria-pressed={webSearchEnabled}
            >
              <Globe className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("aiAssistant.composer.searchWeb")}</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex items-end gap-2">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={t("aiAssistant.placeholder")}
          aria-label={t("aiAssistant.placeholder")}
          rows={1}
          className="max-h-32 min-h-9 flex-1 resize-none"
          disabled={disabled}
        />
        <Button size="icon" onClick={submit} disabled={disabled || !value.trim()} aria-label={t("common.send")}>
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
