"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, MonitorSmartphone, Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { FormField } from "@/components/forms/form-field";
import { getSecuritySessions, signOutSession } from "@/services/securityService";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { InlineEmpty, InlineError } from "@/components/shared/inline-state";

export function SecuritySection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [twoFactor, setTwoFactor] = useState(false);
  const {
    data: sessions = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({ queryKey: ["security-sessions"], queryFn: getSecuritySessions });

  const signOutMutation = useMutation({
    mutationFn: (id: string) => signOutSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["security-sessions"] });
      toast.success(t("settings.security.signedOut"));
    },
  });

  function handleChangePassword() {
    toast.success(t("settings.security.passwordChanged"));
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="size-4" /> {t("settings.nav.security")}
          </CardTitle>
          <CardDescription>{t("settings.security.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={t("settings.security.currentPassword")} htmlFor="current-password">
              <Input id="current-password" type="password" placeholder="••••••••" />
            </FormField>
            <FormField label={t("settings.security.newPassword")} htmlFor="new-password">
              <Input id="new-password" type="password" placeholder="••••••••" />
            </FormField>
          </div>
          <div>
            <Button size="sm" onClick={handleChangePassword}>
              {t("settings.security.updatePassword")}
            </Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">{t("settings.security.twoFactor")}</span>
              <span className="text-xs text-muted-foreground">{t("settings.security.twoFactorDescription")}</span>
            </div>
            <Switch checked={twoFactor} onCheckedChange={setTwoFactor} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MonitorSmartphone className="size-4" /> {t("settings.security.activeSessions")}
          </CardTitle>
          <CardDescription>{t("settings.security.activeSessionsSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : isError ? (
            <InlineError error={error} onRetry={() => refetch()} />
          ) : sessions.length === 0 ? (
            <InlineEmpty />
          ) : (
            sessions.map((s, i) => (
              <div key={s.id}>
                <div className="flex items-center justify-between py-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">
                      {s.device}{" "}
                      {s.current && <span className="text-primary">({t("settings.security.thisDevice")})</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">{s.location}</span>
                  </div>
                  {!s.current && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      disabled={signOutMutation.isPending}
                      onClick={() => signOutMutation.mutate(s.id)}
                    >
                      <LogOut className="size-3.5" />
                      {t("settings.security.signOut")}
                    </Button>
                  )}
                </div>
                {i < sessions.length - 1 && <Separator />}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
