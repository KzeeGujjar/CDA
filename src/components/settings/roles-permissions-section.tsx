"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getRolePermissions, updateRolePermissions } from "@/services/permissionService";
import {
  fullAccessRoles,
  moduleKeys,
  roleKeys,
  type ModuleKey,
  type PermissionMatrix,
  type RoleKey,
} from "@/lib/settings-roles";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { InlineEmpty, InlineError } from "@/components/shared/inline-state";

export function RolesPermissionsSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const {
    data: savedMatrix,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({ queryKey: ["role-permissions"], queryFn: getRolePermissions });
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const active = matrix ?? savedMatrix;

  const saveMutation = useMutation({
    mutationFn: (next: PermissionMatrix) => updateRolePermissions(next),
    onSuccess: (next) => {
      queryClient.setQueryData(["role-permissions"], next);
      toast.success(t("settings.rolesPermissions.saved"));
    },
  });

  function toggle(module: ModuleKey, role: RoleKey) {
    if (fullAccessRoles.includes(role) || !active) return;
    setMatrix({ ...active, [module]: { ...active[module], [role]: !active[module][role] } });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" /> {t("settings.nav.rolesPermissions")}
          </CardTitle>
          <CardDescription>{t("settings.rolesPermissions.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {roleKeys.map((role) => (
            <div key={role} className="flex flex-col gap-1 rounded-lg border border-border p-4">
              <span className="text-sm font-medium text-foreground">
                {t(`settings.rolesPermissions.roles.${role}`)}
              </span>
              <span className="text-xs text-muted-foreground">
                {t(`settings.rolesPermissions.roleDescriptions.${role}`)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.rolesPermissions.matrixTitle")}</CardTitle>
          <CardDescription>{t("settings.rolesPermissions.matrixSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : isError ? (
            <InlineError error={error} onRetry={() => refetch()} />
          ) : !active ? (
            <InlineEmpty />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("settings.rolesPermissions.module")}</TableHead>
                    {roleKeys.map((role) => (
                      <TableHead key={role} className="text-center">
                        {t(`settings.rolesPermissions.roles.${role}`)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {moduleKeys.map((module) => (
                    <TableRow key={module}>
                      <TableCell className="font-medium text-foreground">
                        {t(`settings.rolesPermissions.modules.${module}`)}
                      </TableCell>
                      {roleKeys.map((role) => (
                        <TableCell key={role} className="text-center">
                          <Checkbox
                            checked={active[module][role]}
                            disabled={fullAccessRoles.includes(role)}
                            onCheckedChange={() => toggle(module, role)}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div>
            <Button
              size="sm"
              disabled={!matrix || saveMutation.isPending}
              onClick={() => matrix && saveMutation.mutate(matrix)}
            >
              {t("common.saveChanges")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
