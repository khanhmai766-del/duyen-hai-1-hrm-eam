"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { useEquipmentTree } from "@/hooks/useEquipment";
import { usePositionSystemScopes } from "@/hooks/usePositionSystemScopes";
import {
  deviceAccessForPosition,
  nodeAccessForPosition,
  type NodeAccess,
} from "@/lib/position-system-scopes";

type DeviceLike = {
  code: string;
  system?: string | null;
  systemSeq?: string | null;
  managingPosition?: string | null;
};

/**
 * Quyền của NGƯỜI DÙNG hiện tại trên cây thiết bị (theo cương vị của họ).
 * Quản trị viên luôn "edit". Dùng để ẩn nút Sửa, chặn form khi chỉ có quyền Xem.
 */
export function useSystemAccess() {
  const { data: session } = useSession();
  const treeQuery = useEquipmentTree();
  const scopesQuery = usePositionSystemScopes();

  const isAdmin = session?.user?.role === "ADMIN";
  const position = session?.user?.position ?? "";
  const nodes = React.useMemo(() => treeQuery.data?.data ?? [], [treeQuery.data]);
  const scopes = React.useMemo(() => scopesQuery.data?.data ?? [], [scopesQuery.data]);

  const accessForSeq = React.useCallback(
    (seq: string | null | undefined): NodeAccess => {
      if (isAdmin) return "edit";
      if (!seq) return "edit";
      return nodeAccessForPosition(seq, position, nodes, scopes);
    },
    [isAdmin, position, nodes, scopes]
  );

  const accessForDevice = React.useCallback(
    (device: DeviceLike | null | undefined): NodeAccess => {
      if (isAdmin) return "edit";
      if (!device) return "edit";
      return deviceAccessForPosition(device, position, nodes, scopes);
    },
    [isAdmin, position, nodes, scopes]
  );

  return {
    isAdmin,
    position,
    ready: !treeQuery.isLoading && !scopesQuery.isLoading,
    accessForSeq,
    accessForDevice,
    canViewSeq: React.useCallback((seq?: string | null) => accessForSeq(seq) !== "none", [accessForSeq]),
    canEditSeq: React.useCallback((seq?: string | null) => accessForSeq(seq) === "edit", [accessForSeq]),
    canEditDevice: React.useCallback((device?: DeviceLike | null) => accessForDevice(device) === "edit", [accessForDevice]),
  };
}
