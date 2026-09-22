"use client";

import { Bot, Briefcase, Car, Bell, CheckSquare, FileStack, RotateCcw, Users, type LucideIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getDemoStats, type DemoStat } from "@/services/demoDataService";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

const statIcon: Record<DemoStat["key"], LucideIcon> = {
  vehicles: Car,
  customers: Users,
  leads: Briefcase,
  deals: FileStack,
  aiConversations: Bot,
  documents: FileStack,
  tasks: CheckSquare,
  notifications: Bell,
};

export function DemoDataSection() {
  const { t } = useTranslation();
  const stats = getDemoStats();

  function handleReset() {
    window.location.reload();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RotateCcw className="size-4" /> {t("settings.nav.demoData")}
        </CardTitle>
        <CardDescription>{t("settings.demoData.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((stat) => {
            const Icon = statIcon[stat.key];
            return (
              <div key={stat.key} className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
                <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="size-3.5" />
                </div>
                <span className="font-mono text-xl font-semibold text-foreground">{stat.count}</span>
                <span className="text-xs text-muted-foreground">{t(`settings.demoData.stats.${stat.key}`)}</span>
              </div>
            );
          })}
        </div>

        <div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <RotateCcw className="size-3.5" />
                {t("settings.demoData.resetButton")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("settings.demoData.resetConfirmTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("settings.demoData.resetConfirmDescription")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleReset}>{t("settings.demoData.resetConfirmAction")}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
