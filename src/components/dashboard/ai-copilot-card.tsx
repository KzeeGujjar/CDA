"use client";

import Link from "next/link";
import { ArrowRight, Bot } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function AiCopilotCard() {
  const { t } = useTranslation();

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-primary">
          <Bot className="size-4.5" />
          <span className="text-sm font-medium">{t("dashboard.aiCopilotPrompt")}</span>
        </div>
        <div className="flex items-center gap-2">
          <Input placeholder={t("dashboard.aiCopilotPlaceholder")} className="bg-background" />
          <Button asChild size="sm" className="shrink-0 gap-1.5">
            <Link href="/ai-assistant">
              {t("common.askAi")}
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
