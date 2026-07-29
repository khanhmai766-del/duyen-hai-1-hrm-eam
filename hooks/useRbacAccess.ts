"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { apiGet } from "@/lib/fetcher";
import { DEFAULT_RBAC_MATRIX, type RbacLevel } from "@/lib/rbac-defaults";
import { useAdminMode } from "@/hooks/useAdminMode";

const RANK: Record<RbacLevel, number> = {
  none: 0,
  read: 1,
  personal: 2,
  manage: 3,
  full: 4,
};

type RbacMe = {
  role?: string | null;
  permissions?: Record<string, RbacLevel>;
};

let lastPermissionIdentity = "";

function level(value: string | null | undefined): RbacLevel {
  if (value === "approve") return "manage";
  if (value === "create" || value === "own") return "personal";
  return value && value in RANK ? (value as RbacLevel) : "none";
}

function satisfiesAllowedLevels(current: RbacLevel, allowed: RbacLevel[]) {
  if (allowed.includes(current)) return true;
  if (current === "full") return allowed.some((required) => required !== "none");
  if (current === "manage") {
    return allowed.some((required) => ["read", "personal", "manage"].includes(required));
  }
  return false;
}

export function useRbacAccess() {
  const { data: session } = useSession();
  const user = session?.user;
  const [adminMode] = useAdminMode();
  const effectiveRole = user?.role === "ADMIN" && !adminMode ? "MANAGER" : user?.role;
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["rbac-me", user?.id, adminMode],
    queryFn: () => apiGet<RbacMe>("/api/rbac/me"),
    enabled: !!user,
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
  });
  const permissions = query.data?.data?.permissions;
  const permissionSignature = React.useMemo(
    () =>
      Object.entries(permissions ?? {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([permissionId, permissionLevel]) => `${permissionId}:${permissionLevel}`)
        .join("|"),
    [permissions]
  );

  React.useEffect(() => {
    if (!user?.id || !permissionSignature) return;
    const identity = `${user.id}|${permissionSignature}`;
    if (lastPermissionIdentity === identity) return;
    lastPermissionIdentity = identity;
    void queryClient.invalidateQueries({ queryKey: ["materials"] });
    void queryClient.invalidateQueries({ queryKey: ["replacements"] });
    void queryClient.invalidateQueries({ queryKey: ["replacement-history"] });
    void queryClient.invalidateQueries({ queryKey: ["devices"] });
    void queryClient.invalidateQueries({ queryKey: ["equipment-tree"] });
  }, [permissionSignature, queryClient, user?.id]);

  const permissionLevel = React.useCallback(
    (permissionId: string): RbacLevel => {
      if (user?.role === "ADMIN" && adminMode) return "full";
      if (!user?.id) return "none";
      return level(permissions?.[permissionId] ?? DEFAULT_RBAC_MATRIX[permissionId]?.[effectiveRole ?? ""]);
    },
    [adminMode, effectiveRole, permissions, user?.id, user?.role]
  );

  const can = React.useCallback(
    (permissionId: string, levels: RbacLevel[]) => satisfiesAllowedLevels(permissionLevel(permissionId), levels),
    [permissionLevel]
  );

  return { can, permissionLevel, isLoading: query.isLoading };
}
