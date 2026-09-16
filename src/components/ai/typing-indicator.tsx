import { Bot } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function TypingIndicator() {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-2.5" role="status">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Bot className="size-3.5" />
      </div>
      <div className="flex items-center gap-1 rounded-2xl bg-muted px-3.5 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden="true"
            className="size-1.5 animate-typing-dot rounded-full bg-muted-foreground/60"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
        <span className="sr-only">{t("aiAssistant.thinking")}</span>
      </div>
    </div>
  );
}
