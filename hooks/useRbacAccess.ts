"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { apiGet } from "@/lib/fetcher";
import { DEFAULT_RBAC_MATRIX, type RbacLevel } from "@/lib/rbac-defaults";

const ROLE_PROFILE_PERMISSION = "__ROLE_PROFILE__";
const RANK: Record<RbacLevel, number> = {
  none: 0,
  read: 1,
  own: 2,
  create: 3,
  approve: 4,
  manage: 5,
  full: 6,
};

type RbacConfig = {
  permissions?: Array<{ id: string; matrix?: Record<string, string> }>;
  userOverrides?: Array<{ userId: string; permissionId: string; roleId?: string; value?: string }>;
};

function level(value: string | null | undefined): RbacLevel {
  return value && value in RANK ? (value as RbacLevel) : "none";
}

function strongest(values: Array<string | null | undefined>): RbacLevel {
  return values.map(level).reduce<RbacLevel>((best, value) => (RANK[value] > RANK[best] ? value : best), "none");
}

export function useRbacAccess() {
  const { data: session } = useSession();
  const user = session?.user;
  const query = useQuery({
    queryKey: ["rbac-config"],
    queryFn: () => apiGet<RbacConfig>("/api/rbac"),
    enabled: !!user,
    staleTime: 30_000,
  });
  const config = query.data?.data;

  const permissionLevel = React.useCallback(
    (permissionId: string): RbacLevel => {
      if (user?.role === "ADMIN") return "full";
      if (!user?.id) return "none";
      const permission = config?.permissions?.find((item) => item.id === permissionId);
      const roleValue = permission?.matrix?.[user.role ?? ""] ?? DEFAULT_RBAC_MATRIX[permissionId]?.[user.role ?? ""];
      const overrideValues = (config?.userOverrides ?? [])
        .filter((override) => override.userId === user.id)
        .flatMap((override) => {
          if (override.permissionId === permissionId) return [override.value];
          if (override.permissionId !== ROLE_PROFILE_PERMISSION || !override.roleId) return [];
          return [override.value, permission?.matrix?.[override.roleId] ?? DEFAULT_RBAC_MATRIX[permissionId]?.[override.roleId]];
        });
      return strongest([roleValue, ...overrideValues]);
    },
    [config?.permissions, config?.userOverrides, user?.id, user?.role]
  );

  const can = React.useCallback(
    (permissionId: string, levels: RbacLevel[]) => levels.includes(permissionLevel(permissionId)),
    [permissionLevel]
  );

  return { can, permissionLevel, isLoading: query.isLoading };
}
