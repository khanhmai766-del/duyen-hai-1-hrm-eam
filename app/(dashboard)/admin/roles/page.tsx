"use client";

import { Check, X } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleBadge } from "@/components/devices/status-badge";
import { ROLES } from "@/lib/constants";

const FEATURES: { label: string; matrix: Record<string, boolean | "own"> }[] = [
  { label: "Xem tất cả trang", matrix: { ADMIN: true, SUPERVISOR: true, TECHNICIAN: true, VIEWER: true } },
  { label: "Tạo phiếu sửa chữa", matrix: { ADMIN: true, SUPERVISOR: true, TECHNICIAN: true, VIEWER: false } },
  { label: "Sửa/Xoá phiếu sửa chữa", matrix: { ADMIN: true, SUPERVISOR: "own", TECHNICIAN: "own", VIEWER: false } },
  { label: "Duyệt phiếu sửa chữa", matrix: { ADMIN: true, SUPERVISOR: true, TECHNICIAN: false, VIEWER: false } },
  { label: "Duyệt điểm danh", matrix: { ADMIN: true, SUPERVISOR: true, TECHNICIAN: false, VIEWER: false } },
  { label: "Quản lý người dùng / phân quyền", matrix: { ADMIN: true, SUPERVISOR: false, TECHNICIAN: false, VIEWER: false } },
  { label: "Xoá thiết bị", matrix: { ADMIN: true, SUPERVISOR: false, TECHNICIAN: false, VIEWER: false } },
  { label: "Quản lý vật tư", matrix: { ADMIN: true, SUPERVISOR: true, TECHNICIAN: false, VIEWER: false } },
];

const ROLE_ORDER = ["ADMIN", "SUPERVISOR", "TECHNICIAN", "VIEWER"];

export default function RolesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Phân quyền (RBAC)" description="Ma trận quyền truy cập theo vai trò" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {ROLE_ORDER.map((r) => (
          <Card key={r}>
            <CardContent className="p-4">
              <RoleBadge role={r} />
              <p className="mt-2 text-sm text-muted-foreground">
                {r === "ADMIN" && "Toàn quyền quản trị hệ thống."}
                {r === "SUPERVISOR" && "Trưởng ca: duyệt và quản lý vận hành."}
                {r === "TECHNICIAN" && "Kỹ thuật viên: ghi nhận sửa chữa."}
                {r === "VIEWER" && "Chỉ xem dữ liệu."}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Ma Trận Phân Quyền Quản Lý</CardTitle></CardHeader>
        <CardContent className="overflow-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Chức năng</th>
                {ROLE_ORDER.map((r) => (
                  <th key={r} className="px-4 py-3 text-center text-xs font-semibold uppercase text-muted-foreground">
                    {ROLES[r as keyof typeof ROLES].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((f) => (
                <tr key={f.label} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{f.label}</td>
                  {ROLE_ORDER.map((r) => {
                    const v = f.matrix[r];
                    return (
                      <td key={r} className="px-4 py-3 text-center">
                        {v === true ? (
                          <span
                            title="Được phép"
                            className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-b from-emerald-400 to-green-600 text-white shadow-md shadow-green-500/30 ring-1 ring-white/40 transition-transform hover:scale-110"
                          >
                            <Check className="h-4 w-4" strokeWidth={3} />
                          </span>
                        ) : v === "own" ? (
                          <span className="inline-flex items-center rounded-full bg-gradient-to-b from-amber-300 to-amber-500 px-2.5 py-1 text-xs font-semibold text-amber-950 shadow-md shadow-amber-500/30 ring-1 ring-white/40">
                            của mình
                          </span>
                        ) : (
                          <span
                            title="Không được phép"
                            className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-b from-slate-100 to-slate-300 text-slate-500 shadow-inner ring-1 ring-slate-300/60"
                          >
                            <X className="h-4 w-4" strokeWidth={3} />
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
