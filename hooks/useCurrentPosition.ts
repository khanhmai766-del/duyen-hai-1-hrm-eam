"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { useUsers } from "@/hooks/useUsers";
import { availableUserPositions, effectiveUserPosition } from "@/lib/current-position";

export function useCurrentPosition() {
  const { data: session } = useSession();
  const usersQuery = useUsers();
  const profile = React.useMemo(
    () => usersQuery.data?.data?.find((user) => user.id === session?.user?.id) ?? null,
    [usersQuery.data, session?.user?.id]
  );
  const fallback = {
    position: session?.user?.position,
    secondaryPosition: session?.user?.secondaryPosition,
    currentPosition: session?.user?.currentPosition,
  };
  const source = profile ?? fallback;

  return {
    profile,
    options: availableUserPositions(source),
    position: effectiveUserPosition(source) ?? "",
    isLoading: usersQuery.isLoading,
  };
}
