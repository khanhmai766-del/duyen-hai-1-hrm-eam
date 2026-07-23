"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { apiGet } from "@/lib/fetcher";
import type { NodeAccess } from "@/lib/position-system-scopes";

/**
 * Quyền của NGƯỜI DÙNG hiện tại trên MỘT seq của cây thiết bị (theo cương vị).
 * Gọi API nhẹ /api/equipment-tree/access thay vì tải toàn bộ cây (3MB) về client
 * chỉ để ẩn/hiện nút Sửa. Quản trị viên luôn "edit".
 */
export function useSeqAccess(seq: string | null | undefined) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const query = useQuery({
    queryKey: ["equipment-access", seq],
    queryFn: () => apiGet<{ access: NodeAccess }>(`/api/equipment-tree/access?seq=${encodeURIComponent(seq!)}`),
    enabled: !!seq && !isAdmin,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const access: NodeAccess = isAdmin ? "edit" : query.data?.data?.access ?? "none";
  return {
    isAdmin,
    ready: isAdmin || !seq || !query.isLoading,
    access,
    canView: access !== "none",
    canEdit: access === "edit",
  };
}
