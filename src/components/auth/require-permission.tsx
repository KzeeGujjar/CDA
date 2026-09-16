"use client";

import { ShieldAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { usePermissions } from "@/lib/permissions/use-permissions";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { ModuleKey } from "@/lib/settings-roles";

/**
 * Gates its children behind the current user's role permissions. There is no
 * real backend yet, so `usePermissions()` reads the mock role-permission
 * matrix — but the check itself, and this fallback UI, are the real seam a
 * future authorization system plugs into.
 */
export function RequirePermission({ module, children }: { module: ModuleKey; children: React.ReactNode }) {
  const { t } = useTranslation();
  const { can, isLoading } = usePermissions();

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  if (!can(module)) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title={t("common.permissionDeniedTitle")}
        description={t("common.permissionDeniedDescription")}
      />
    );
  }

  return <>{children}</>;
}
