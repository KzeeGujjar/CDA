"use client";

import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { generateApiKey, getApiKeys, revokeApiKey } from "@/services/api-keys";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function ApiKeysSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: keys = [], isLoading } = useQuery({ queryKey: ["api-keys"], queryFn: getApiKeys });

  const generateMutation = useMutation({
    mutationFn: () => generateApiKey(t("settings.apiKeys.newKeyName")),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success(t("settings.apiKeys.generated"));
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success(t("settings.apiKeys.revoked"));
    },
  });

  function handleCopy(key: string) {
    navigator.clipboard?.writeText(key).then(() => toast.success(t("settings.apiKeys.copied")));
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4" /> {t("settings.nav.apiKeys")}
          </CardTitle>
          <CardDescription>{t("settings.apiKeys.subtitle")}</CardDescription>
        </div>
        <Button size="sm" className="gap-1.5" disabled={generateMutation.isPending} onClick={() => generateMutation.mutate()}>
          <Plus className="size-3.5" />
          {t("settings.apiKeys.generate")}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("settings.apiKeys.name")}</TableHead>
                  <TableHead>{t("settings.apiKeys.key")}</TableHead>
                  <TableHead>{t("settings.apiKeys.created")}</TableHead>
                  <TableHead>{t("settings.apiKeys.lastUsed")}</TableHead>
                  <TableHead>{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium text-foreground">{k.name}</TableCell>
                    <TableCell className="font-mono">{k.key}</TableCell>
                    <TableCell>{k.createdAt}</TableCell>
                    <TableCell>{k.lastUsed}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => handleCopy(k.key)}
                          aria-label={t("common.copy")}
                        >
                          <Copy className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive"
                          disabled={revokeMutation.isPending}
                          onClick={() => revokeMutation.mutate(k.id)}
                          aria-label={t("settings.apiKeys.revoke")}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
