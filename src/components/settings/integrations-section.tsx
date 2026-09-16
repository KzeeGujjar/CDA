"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Mail, MessageCircle, Plug, Workflow, Calculator } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { LucideIcon } from "lucide-react";

const integrationKeys = ["whatsapp", "calendar", "email", "zapier", "accounting"] as const;
type IntegrationKey = (typeof integrationKeys)[number];

const integrationIcons: Record<IntegrationKey, LucideIcon> = {
  whatsapp: MessageCircle,
  calendar: CalendarDays,
  email: Mail,
  zapier: Workflow,
  accounting: Calculator,
};

export function IntegrationsSection() {
  const { t } = useTranslation();
  const [connected, setConnected] = useState<Record<IntegrationKey, boolean>>({
    whatsapp: true,
    calendar: false,
    email: true,
    zapier: false,
    accounting: false,
  });

  function toggle(key: IntegrationKey) {
    setConnected((prev) => {
      const next = !prev[key];
      toast.success(next ? t("settings.integrations.connectedToast") : t("settings.integrations.disconnectedToast"));
      return { ...prev, [key]: next };
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="size-4" /> {t("settings.nav.integrations")}
        </CardTitle>
        <CardDescription>{t("settings.integrations.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {integrationKeys.map((key) => {
          const Icon = integrationIcons[key];
          const isConnected = connected[key];
          return (
            <div key={key} className="flex items-center justify-between gap-3 rounded-lg border border-border p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4.5" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">{t(`settings.integrations.items.${key}`)}</span>
                  <span className={`text-xs ${isConnected ? "text-primary" : "text-muted-foreground"}`}>
                    {isConnected ? t("settings.marketplaceConnections.connected") : t("settings.marketplaceConnections.notConnected")}
                  </span>
                </div>
              </div>
              <Button variant={isConnected ? "outline" : "default"} size="sm" onClick={() => toggle(key)}>
                {isConnected ? t("settings.marketplaceConnections.disconnect") : t("settings.marketplaceConnections.connect")}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
