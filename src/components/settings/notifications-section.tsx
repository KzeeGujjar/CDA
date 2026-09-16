"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

const notificationTypes = ["newLead", "taskDue", "documentSigned", "aiNeedsReview", "newMessage", "dealWon"] as const;
type NotificationType = (typeof notificationTypes)[number];
const channels = ["email", "sms", "push"] as const;
type Channel = (typeof channels)[number];

const defaultPrefs: Record<NotificationType, Record<Channel, boolean>> = {
  newLead: { email: true, sms: false, push: true },
  taskDue: { email: true, sms: false, push: true },
  documentSigned: { email: true, sms: false, push: false },
  aiNeedsReview: { email: true, sms: true, push: true },
  newMessage: { email: false, sms: false, push: true },
  dealWon: { email: true, sms: true, push: true },
};

export function NotificationsSection() {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState(defaultPrefs);

  function toggle(type: NotificationType, channel: Channel) {
    setPrefs((prev) => ({ ...prev, [type]: { ...prev[type], [channel]: !prev[type][channel] } }));
  }

  function handleSave() {
    toast.success(t("settings.notifications.saved"));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-4" /> {t("settings.nav.notifications")}
        </CardTitle>
        <CardDescription>{t("settings.notifications.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("settings.notifications.event")}</TableHead>
                {channels.map((c) => (
                  <TableHead key={c} className="text-center">
                    {t(`settings.notifications.channels.${c}`)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {notificationTypes.map((type) => (
                <TableRow key={type}>
                  <TableCell className="font-medium text-foreground">{t(`settings.notifications.events.${type}`)}</TableCell>
                  {channels.map((channel) => (
                    <TableCell key={channel} className="text-center">
                      <Switch size="sm" checked={prefs[type][channel]} onCheckedChange={() => toggle(type, channel)} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
