"use client";

import { Copy, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { useMockStream } from "@/hooks/use-mock-stream";
import { marketingContentMeta, marketingTypeToChannel } from "@/lib/marketing-content-meta";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { GeneratedMarketingContent } from "@/types/marketing";

function ContentItemCard({
  item,
  isNewest,
  isSelected,
  onToggleSelect,
}: {
  item: GeneratedMarketingContent;
  isNewest: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const { t, locale } = useTranslation();
  const meta = marketingContentMeta[item.type];
  const Icon = meta.icon;
  const revealed = useMockStream(item.content, isNewest, 8);

  function handleCopy() {
    navigator.clipboard?.writeText(item.content).then(() => toast.success(t("aiMarketing.copied")));
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-3.5" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground">
                {t(`aiMarketing.types.${meta.labelKey}`)}
                {item.targetLanguage && ` · ${item.targetLanguage.toUpperCase()}`}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(item.createdAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-xs" onClick={handleCopy} aria-label={t("common.copy")}>
              <Copy className="size-3.5" />
            </Button>
          </div>
        </div>

        <pre dir="auto" className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 font-sans text-sm text-foreground">
          {revealed}
        </pre>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect(item.id)} />
          {t("aiMarketing.includeInCampaign")}
          <span className="text-muted-foreground/70">· {t(`aiMarketing.channels.${marketingTypeToChannel[item.type]}`)}</span>
        </label>
      </CardContent>
    </Card>
  );
}

export function GeneratedContentList({
  items,
  selectedIds,
  onToggleSelect,
  newestId,
}: {
  items: GeneratedMarketingContent[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  newestId: string | null;
}) {
  const { t } = useTranslation();

  if (items.length === 0) {
    return <EmptyState icon={Sparkles} title={t("aiMarketing.emptyState")} description={t("aiMarketing.emptyStateDescription")} />;
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <ContentItemCard
          key={item.id}
          item={item}
          isNewest={item.id === newestId}
          isSelected={selectedIds.has(item.id)}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  );
}
