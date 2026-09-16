"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getRolePermissions, roleCanAccessModule } from "@/services/permissions";
import type { ModuleKey } from "@/lib/settings-roles";

export function usePermissions() {
  const { user } = useAuth();
  const { data: matrix, isLoading } = useQuery({ queryKey: ["role-permissions"], queryFn: getRolePermissions });

  function can(module: ModuleKey): boolean {
    if (!user || !matrix) return false;
    return roleCanAccessModule(matrix, user.role, module);
  }

  return { can, isLoading, role: user?.role };
}
