"use client";

import { Bot, LayoutGrid, User } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

function BrowserFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card ring-1 ring-foreground/10">
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-destructive/60" />
        <span className="size-2.5 rounded-full bg-accent/60" />
        <span className="size-2.5 rounded-full bg-primary/60" />
      </div>
      {children}
    </div>
  );
}

function DashboardMock() {
  return (
    <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
      {["AED 6.4M", "20", "AED 617K", "24.5%"].map((value, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-xl border border-border p-3.5">
          <span className="h-2 w-14 rounded-full bg-muted" />
          <span className="font-mono text-lg font-semibold text-foreground">{value}</span>
        </div>
      ))}
      <div className="col-span-2 flex h-28 items-end gap-1.5 rounded-xl border border-border p-3.5 sm:col-span-4">
        {[40, 55, 48, 70, 62, 85, 78].map((h, i) => (
          <span key={i} className="flex-1 rounded-t-sm bg-primary/70" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

function AiAgentMock() {
  return (
    <div className="flex flex-col gap-3 p-5">
      <div className="flex items-start gap-2.5">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <User className="size-3.5" />
        </div>
        <div className="max-w-[75%] rounded-2xl bg-primary px-3.5 py-2.5 text-start text-sm text-primary-foreground">
          What&apos;s my top aging inventory?
        </div>
      </div>
      <div className="flex items-start gap-2.5">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bot className="size-3.5" />
        </div>
        <div className="max-w-[80%] rounded-2xl bg-muted px-3.5 py-2.5 text-start text-sm text-foreground">
          Here are your top 3 aging vehicles — consider a targeted price adjustment to move them faster.
        </div>
      </div>
      <div className="h-9 rounded-lg border border-border bg-muted/30" />
    </div>
  );
}

function InventoryMock() {
  return (
    <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 overflow-hidden rounded-xl border border-border">
          <div className="aspect-video bg-muted" />
          <div className="flex flex-col gap-1.5 p-2.5">
            <span className="h-2 w-3/4 rounded-full bg-muted" />
            <span className="h-2 w-1/2 rounded-full bg-primary/40" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ScreenshotsSection() {
  const { t } = useTranslation();

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-20 md:px-8">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">{t("landing.screenshots.title")}</h2>
        <p className="text-muted-foreground">{t("landing.screenshots.subtitle")}</p>
      </div>

      <Tabs defaultValue="dashboard" className="mt-10 items-center">
        <TabsList className="h-auto flex-wrap p-1">
          <TabsTrigger value="dashboard" className="gap-1.5 px-3 py-1.5">
            <LayoutGrid className="size-3.5" />
            {t("landing.screenshots.dashboardLabel")}
          </TabsTrigger>
          <TabsTrigger value="aiAgent" className="gap-1.5 px-3 py-1.5">
            <Bot className="size-3.5" />
            {t("landing.screenshots.aiAgentLabel")}
          </TabsTrigger>
          <TabsTrigger value="inventory" className="gap-1.5 px-3 py-1.5">
            <LayoutGrid className="size-3.5" />
            {t("landing.screenshots.inventoryLabel")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-6 w-full max-w-4xl flex-none">
          <BrowserFrame>
            <DashboardMock />
          </BrowserFrame>
          <p className="mt-3 text-center text-sm text-muted-foreground">{t("landing.screenshots.dashboardCaption")}</p>
        </TabsContent>
        <TabsContent value="aiAgent" className="mt-6 w-full max-w-4xl flex-none">
          <BrowserFrame>
            <AiAgentMock />
          </BrowserFrame>
          <p className="mt-3 text-center text-sm text-muted-foreground">{t("landing.screenshots.aiAgentCaption")}</p>
        </TabsContent>
        <TabsContent value="inventory" className="mt-6 w-full max-w-4xl flex-none">
          <BrowserFrame>
            <InventoryMock />
          </BrowserFrame>
          <p className="mt-3 text-center text-sm text-muted-foreground">{t("landing.screenshots.inventoryCaption")}</p>
        </TabsContent>
      </Tabs>
    </section>
  );
}
