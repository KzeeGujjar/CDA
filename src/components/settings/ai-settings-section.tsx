"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { FormField } from "@/components/forms/form-field";
import { getActiveAIProvider, setActiveAIProvider } from "@/lib/ai/ai-service";
import { aiProviders } from "@/types/ai";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { AIProvider } from "@/types/ai";

const toggleKeys = ["autoReplyChat", "requireApproval", "autoLeadScoring", "autoFollowUps"] as const;

export function AiSettingsSection() {
  const { t } = useTranslation();
  const [toggles, setToggles] = useState<Record<(typeof toggleKeys)[number], boolean>>({
    autoReplyChat: true,
    requireApproval: true,
    autoLeadScoring: true,
    autoFollowUps: false,
  });
  const [tone, setTone] = useState("professional");
  const [provider, setProvider] = useState<AIProvider>(getActiveAIProvider());

  function handleSave() {
    setActiveAIProvider(provider);
    toast.success(t("settings.aiSettings.saved"));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4" /> {t("settings.nav.aiSettings")}
        </CardTitle>
        <CardDescription>{t("settings.aiSettings.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {toggleKeys.map((key, i) => (
          <div key={key}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">{t(`settings.aiSettings.toggles.${key}.label`)}</span>
                <span className="text-xs text-muted-foreground">{t(`settings.aiSettings.toggles.${key}.description`)}</span>
              </div>
              <Switch
                checked={toggles[key]}
                onCheckedChange={(v) => setToggles((prev) => ({ ...prev, [key]: v }))}
              />
            </div>
            {i < toggleKeys.length - 1 && <Separator className="mt-5" />}
          </div>
        ))}
        <Separator />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={t("settings.aiSettings.tone")} htmlFor="ai-tone">
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger id="ai-tone" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">{t("settings.aiSettings.tones.professional")}</SelectItem>
                <SelectItem value="friendly">{t("settings.aiSettings.tones.friendly")}</SelectItem>
                <SelectItem value="concise">{t("settings.aiSettings.tones.concise")}</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label={t("settings.aiSettings.provider")} htmlFor="ai-provider">
            <Select value={provider} onValueChange={(v) => setProvider(v as AIProvider)}>
              <SelectTrigger id="ai-provider" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {aiProviders.map((p) => (
                  <SelectItem key={p} value={p}>
                    {t(`settings.aiSettings.providers.${p}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">{t("settings.aiSettings.providerNote")}</span>
          </FormField>
        </div>
        <div>
          <Button size="sm" onClick={handleSave}>
            {t("common.saveChanges")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
