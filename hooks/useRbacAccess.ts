"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { apiGet } from "@/lib/fetcher";
import { DEFAULT_RBAC_MATRIX, type RbacLevel } from "@/lib/rbac-defaults";

const RANK: Record<RbacLevel, number> = {
  none: 0,
  read: 1,
  own: 2,
  create: 3,
  approve: 4,
  manage: 5,
  full: 6,
};

type RbacMe = {
  role?: string | null;
  permissions?: Record<string, RbacLevel>;
};

let lastPermissionIdentity = "";

function level(value: string | null | undefined): RbacLevel {
  return value && value in RANK ? (value as RbacLevel) : "none";
}

export function useRbacAccess() {
  const { data: session } = useSession();
  const user = session?.user;
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["rbac-me", user?.id],
    queryFn: () => apiGet<RbacMe>("/api/rbac/me"),
    enabled: !!user,
    staleTime: 10_000,
    refetchInterval: 30_000,
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
      if (user?.role === "ADMIN") return "full";
      if (!user?.id) return "none";
      return level(permissions?.[permissionId] ?? DEFAULT_RBAC_MATRIX[permissionId]?.[user.role ?? ""]);
    },
    [permissions, user?.id, user?.role]
  );

  const can = React.useCallback(
    (permissionId: string, levels: RbacLevel[]) => levels.includes(permissionLevel(permissionId)),
    [permissionLevel]
  );

  return { can, permissionLevel, isLoading: query.isLoading };
}
