"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Users as UsersIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { FormField } from "@/components/forms/form-field";
import { getDealershipUsers, inviteDealershipUser, removeDealershipUser } from "@/services/dealershipUserService";
import { roleKeys, type RoleKey } from "@/lib/settings-roles";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { DealershipUser } from "@/types/settings";
import { InlineError } from "@/components/shared/inline-state";

export function UsersSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const {
    data: users = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({ queryKey: ["dealership-users"], queryFn: getDealershipUsers });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<RoleKey>("salesperson");

  const inviteMutation = useMutation({
    mutationFn: () => inviteDealershipUser({ name, email, role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dealership-users"] });
      toast.success(t("settings.users.invited").replace("{name}", name));
      setName("");
      setEmail("");
      setRole("salesperson");
      setInviteOpen(false);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeDealershipUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dealership-users"] });
      toast.success(t("settings.users.removed"));
    },
  });

  const columns: DataTableColumn<DealershipUser>[] = [
    { key: "name", header: t("settings.users.name"), render: (u) => u.name },
    { key: "email", header: t("settings.users.email"), render: (u) => u.email },
    { key: "role", header: t("settings.users.role"), render: (u) => t(`settings.rolesPermissions.roles.${u.role}`) },
    {
      key: "status",
      header: t("common.status"),
      render: (u) => (
        <StatusBadge
          label={t(`settings.users.status.${u.status}`)}
          tone={u.status === "active" ? "success" : "warning"}
        />
      ),
    },
    {
      key: "actions",
      header: t("common.actions"),
      render: (u) => (
        <Button
          variant="ghost"
          size="sm"
          disabled={removeMutation.isPending}
          onClick={() => removeMutation.mutate(u.id)}
        >
          {t("common.delete")}
        </Button>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <UsersIcon className="size-4" /> {t("settings.nav.users")}
          </CardTitle>
          <CardDescription>{t("settings.users.subtitle")}</CardDescription>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setInviteOpen(true)}>
          <Plus className="size-3.5" />
          {t("settings.users.invite")}
        </Button>
      </CardHeader>
      <CardContent>
        {isError ? (
          <InlineError error={error} onRetry={() => refetch()} />
        ) : (
          <DataTable columns={columns} rows={users} loading={isLoading} emptyTitle={t("common.noResults")} />
        )}
      </CardContent>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.users.inviteTitle")}</DialogTitle>
            <DialogDescription>{t("settings.users.inviteDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <FormField label={t("settings.users.name")} htmlFor="invite-name">
              <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <FormField label={t("settings.users.email")} htmlFor="invite-email">
              <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </FormField>
            <FormField label={t("settings.users.role")} htmlFor="invite-role">
              <Select value={role} onValueChange={(v) => setRole(v as RoleKey)}>
                <SelectTrigger id="invite-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleKeys.map((r) => (
                    <SelectItem key={r} value={r}>
                      {t(`settings.rolesPermissions.roles.${r}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => inviteMutation.mutate()}
              disabled={!name.trim() || !email.trim() || inviteMutation.isPending}
            >
              {t("settings.users.sendInvite")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
