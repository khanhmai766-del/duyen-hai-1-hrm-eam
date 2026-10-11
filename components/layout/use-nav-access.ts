"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { useUsers } from "@/hooks/useUsers";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { useAdminMode } from "@/hooks/useAdminMode";
import { NAV_SECTIONS, navItemAllowedForPosition, navQuickItems, navSectionsForPosition, type NavItem } from "@/lib/nav";
import { lookupNavSections } from "@/lib/lookup-access";
import { gridTint, launcherItems } from "@/components/layout/nav-tints";

const NAV_ACCESS_LEVELS = ["read", "personal", "manage", "full"] as const;

export function pathActive(pathname: string, href: string, exact = false) {
  if (href === "/") return pathname === "/";
  const base = href.split("?")[0];
  if (exact || href.includes("?")) return pathname === base;
  return pathname === base || pathname.startsWith(base + "/");
}

// Active theo cả query: các mục con cùng path chỉ khác tham số (vd /materials?may=S1)
// phải so tham số, nếu không cả nhóm sáng cùng lúc.
export function hrefActive(pathname: string, search: URLSearchParams, href: string, exact = false) {
  if (!pathActive(pathname, href, exact)) return false;
  const query = href.split("?")[1];
  if (!query) return true;
  return Array.from(new URLSearchParams(query)).every(([key, value]) => search.get(key) === value);
}

export function navItemAllowed(
  item: NavItem,
  role: string | undefined,
  can: ReturnType<typeof useRbacAccess>["can"],
  adminMode: boolean,
  position: Parameters<typeof navItemAllowedForPosition>[1]
) {
  if (!navItemAllowedForPosition(item, position, role)) return false;
  if (role === "ADMIN" && adminMode) return true;
  if (item.adminOnly) return false;
  if (item.permissionIds?.length) {
    return item.permissionIds.some((permissionId) => can(permissionId, [...NAV_ACCESS_LEVELS]));
  }
  return !item.adminOnly;
}

/**
 * Điều hướng theo quyền của người đang đăng nhập — dùng chung cho thanh bên và thanh nổi "Thường dùng":
 * các nhóm mục, mục "Thường dùng" được phép, và màu ô icon (components/layout/nav-tints.ts).
 */
export function useNavAccess() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const rbac = useRbacAccess();
  const [adminMode] = useAdminMode();
  const readOnlyDefects = session?.user?.accessMode === "DEFECT_READ_ONLY";
  const { data: usersData } = useUsers({ enabled: !readOnlyDefects });
  const currentProfile = React.useMemo(
    () => usersData?.data?.find((user) => user.id === session?.user?.id) ?? null,
    [session?.user?.id, usersData?.data]
  );
  const positionCarrier = React.useMemo(
    () => ({
      position: currentProfile?.position ?? session?.user?.position,
      secondaryPosition: currentProfile?.secondaryPosition ?? session?.user?.secondaryPosition,
      secondaryPosition2: currentProfile?.secondaryPosition2 ?? session?.user?.secondaryPosition2,
      currentPosition: currentProfile?.currentPosition ?? session?.user?.currentPosition,
    }),
    [
      currentProfile?.currentPosition,
      currentProfile?.position,
      currentProfile?.secondaryPosition,
      currentProfile?.secondaryPosition2,
      session?.user?.currentPosition,
      session?.user?.position,
      session?.user?.secondaryPosition,
      session?.user?.secondaryPosition2,
    ]
  );
  const sections = React.useMemo(() => {
    if (readOnlyDefects) return lookupNavSections(NAV_SECTIONS, rbac.lookupModules);
    return navSectionsForPosition(positionCarrier);
  }, [positionCarrier, readOnlyDefects, rbac.lookupModules]);
  const allowed = (item: NavItem) => navItemAllowed(item, role, rbac.can, adminMode, positionCarrier);

  // Tài khoản chỉ đọc khiếm khuyết chỉ thấy các mục /defects như phần còn lại của thanh bên.
  const quickItems = navQuickItems(positionCarrier).filter((item) => rbac.canReadPage(item.href)).filter(allowed);
  const launcherIndex = new Map(launcherItems(sections, allowed).map((item, index) => [item.href, index]));
  const tintOf = (href: string) => (launcherIndex.has(href) ? gridTint(launcherIndex.get(href)!) : undefined);

  return { session, role, rbac, adminMode, readOnlyDefects, usersData, positionCarrier, sections, allowed, quickItems, tintOf };
}
