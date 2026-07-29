"use client";

import type { ReactNode } from "react";
import { Loader2, ShieldX } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRbacAccess } from "@/hooks/useRbacAccess";

const VIEW_LEVELS = ["read", "own", "create", "approve", "manage", "full"] as const;

export function RbacProtectedRoute({
  permissionId,
  featureLabel,
  children,
}: {
  permissionId: string;
  featureLabel: string;
  children: ReactNode;
}) {
  const { status } = useSession();
  const rbac = useRbacAccess();

  if (status === "loading" || rbac.isLoading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Đang kiểm tra quyền truy cập...
      </div>
    );
  }

  if (!rbac.can(permissionId, [...VIEW_LEVELS])) {
    return (
      <div className="flex min-h-[420px] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-amber-50/80 p-8 text-center shadow-sm">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-amber-600 shadow-sm ring-1 ring-amber-200">
            <ShieldX className="h-7 w-7" />
          </span>
          <h1 className="mt-4 text-lg font-bold text-slate-900">Không có quyền truy cập</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Tài khoản của bạn chưa được cấp quyền xem mục {featureLabel}. Vui lòng liên hệ Quản trị viên để được phân quyền.
          </p>
        </div>
      </div>
    );
  }

  return children;
}
