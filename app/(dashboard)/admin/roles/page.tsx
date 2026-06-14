"use client";

import {
  CheckCircle2,
  CircleDot,
  Eye,
  KeyRound,
  Lock,
  PencilLine,
  ShieldCheck,
  UserCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleBadge } from "@/components/devices/status-badge";
import { ROLES, type RoleKey } from "@/lib/constants";
import { cn } from "@/lib/utils";

type PermissionValue = "full" | "manage" | "approve" | "create" | "own" | "read" | "none";

interface PermissionRow {
  group: string;
  feature: string;
  note: string;
  matrix: Record<RoleKey, PermissionValue>;
}

const ROLE_ORDER: RoleKey[] = ["ADMIN", "SUPERVISOR", "TECHNICIAN", "VIEWER"];

const ROLE_SUMMARY: Record<RoleKey, { desc: string; scope: string; accent: string }> = {
  ADMIN: {
    desc: "Toàn quyền cấu hình, dữ liệu và người dùng.",
    scope: "Quản trị hệ thống",
    accent: "from-[#1E3A5F] to-[#2563EB]",
  },
  SUPERVISOR: {
    desc: "Duyệt ca, điều phối vận hành và theo dõi sửa chữa.",
    scope: "Trưởng ca / điều hành",
    accent: "from-blue-500 to-cyan-600",
  },
  TECHNICIAN: {
    desc: "Ghi nhận khiếm khuyết, sửa chữa và cập nhật phiếu của mình.",
    scope: "Kỹ thuật hiện trường",
    accent: "from-amber-500 to-orange-600",
  },
  VIEWER: {
    desc: "Chỉ xem dữ liệu đã công bố, không thay đổi hồ sơ.",
    scope: "Tra cứu / báo cáo",
    accent: "from-slate-400 to-slate-600",
  },
};

const PERMISSIONS: PermissionRow[] = [
  {
    group: "Tổng quan",
    feature: "Xem dashboard, báo cáo và tra cứu dữ liệu",
    note: "Bao gồm overview, báo cáo, danh sách thiết bị, lịch sử, vật tư.",
    matrix: { ADMIN: "read", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" },
  },
  {
    group: "Nhân sự / Ca trực",
    feature: "Điểm danh theo sơ đồ tổ chức ca",
    note: "Tự chọn cương vị trực hoặc xem phân công theo ca.",
    matrix: { ADMIN: "create", SUPERVISOR: "create", TECHNICIAN: "create", VIEWER: "read" },
  },
  {
    group: "Nhân sự / Ca trực",
    feature: "Duyệt điểm danh và chấm công hành chính",
    note: "Áp dụng cho ca trực, check-in hành chính và danh sách cần xác nhận.",
    matrix: { ADMIN: "approve", SUPERVISOR: "approve", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    group: "Nhân sự / Ca trực",
    feature: "Quản lý người dùng và phân quyền",
    note: "Tạo tài khoản, đổi vai trò, khoá/mở nhân sự.",
    matrix: { ADMIN: "full", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    group: "Thiết bị",
    feature: "Thêm, sửa và nhập danh mục thiết bị",
    note: "Cập nhật lý lịch thiết bị, ảnh, QR và thông tin đính kèm.",
    matrix: { ADMIN: "manage", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" },
  },
  {
    group: "Thiết bị",
    feature: "Xoá thiết bị",
    note: "Xoá thiết bị sẽ xoá lịch sử sửa chữa liên quan.",
    matrix: { ADMIN: "full", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    group: "Sửa chữa",
    feature: "Tạo phiếu sửa chữa",
    note: "Lập phiếu từ trang thiết bị hoặc lịch sử sửa chữa.",
    matrix: { ADMIN: "create", SUPERVISOR: "create", TECHNICIAN: "create", VIEWER: "none" },
  },
  {
    group: "Sửa chữa",
    feature: "Sửa phiếu sửa chữa",
    note: "Trưởng ca sửa được mọi phiếu; kỹ thuật viên chỉ sửa phiếu do mình tạo.",
    matrix: { ADMIN: "manage", SUPERVISOR: "manage", TECHNICIAN: "own", VIEWER: "none" },
  },
  {
    group: "Sửa chữa",
    feature: "Xoá phiếu sửa chữa",
    note: "Quản trị xoá mọi phiếu; người tạo được xoá phiếu của mình.",
    matrix: { ADMIN: "full", SUPERVISOR: "own", TECHNICIAN: "own", VIEWER: "none" },
  },
  {
    group: "Sửa chữa",
    feature: "Duyệt phiếu sửa chữa",
    note: "Xác nhận kết quả xử lý và trạng thái sau sửa chữa.",
    matrix: { ADMIN: "approve", SUPERVISOR: "approve", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    group: "Khiếm khuyết",
    feature: "Ghi nhận và cập nhật khiếm khuyết thiết bị",
    note: "Theo dõi tình trạng, mức độ, yêu cầu xử lý và hình ảnh hiện trường.",
    matrix: { ADMIN: "manage", SUPERVISOR: "manage", TECHNICIAN: "create", VIEWER: "read" },
  },
  {
    group: "Khiếm khuyết",
    feature: "Xoá / đóng hồ sơ khiếm khuyết",
    note: "Chỉ cấp quản lý vận hành thực hiện các thao tác kết thúc hoặc xoá.",
    matrix: { ADMIN: "full", SUPERVISOR: "approve", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    group: "Vật tư",
    feature: "Quản lý danh mục vật tư",
    note: "Thêm, sửa, xoá, nhập dữ liệu và cập nhật tồn kho vật tư.",
    matrix: { ADMIN: "full", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" },
  },
  {
    group: "Vật tư",
    feature: "Quản lý lịch thay thế vật tư",
    note: "Tạo điểm thay thế, ghi nhận thay thế và theo dõi cảnh báo đến hạn.",
    matrix: { ADMIN: "manage", SUPERVISOR: "manage", TECHNICIAN: "read", VIEWER: "read" },
  },
  {
    group: "Thông tin vận hành",
    feature: "Mệnh lệnh sản xuất / thông báo",
    note: "Đăng, sửa, xoá thông báo và tài liệu đính kèm.",
    matrix: { ADMIN: "full", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" },
  },
  {
    group: "Thông tin vận hành",
    feature: "Lịch diễn tập và thông tin nội bộ",
    note: "Cập nhật lịch diễn tập sự cố, PCCC và ghi chú vận hành trong 3 tháng gần nhất.",
    matrix: { ADMIN: "manage", SUPERVISOR: "manage", TECHNICIAN: "read", VIEWER: "read" },
  },
  {
    group: "Thiết bị - QR",
    feature: "Chỉnh sửa mã thiết bị",
    note: "Chỉ quản trị viên được đổi mã thiết bị; mã này liên quan tới QR và liên kết công khai.",
    matrix: { ADMIN: "full", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    group: "Thiết bị - QR",
    feature: "Xem thông tin thiết bị qua QR công khai",
    note: "Người quét QR có thể xem thông tin thiết bị công khai, kể cả khi không có tài khoản hệ thống.",
    matrix: { ADMIN: "read", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" },
  },
  {
    group: "Tài liệu số",
    feature: "Danh mục quy trình vận hành",
    note: "Quản trị viên được thêm, sửa, xoá quy trình; các vai trò khác được tra cứu tài liệu.",
    matrix: { ADMIN: "full", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" },
  },
  {
    group: "Tài liệu số",
    feature: "Danh mục sơ đồ P&ID",
    note: "Quản trị viên được thêm, sửa, xoá bản vẽ; các vai trò khác được tra cứu sơ đồ.",
    matrix: { ADMIN: "full", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" },
  },
  {
    group: "Tài liệu số",
    feature: "Forum kỹ thuật - tạo chủ đề và phản hồi",
    note: "Tài khoản nội bộ có thể trao đổi kỹ thuật, chia sẻ tài liệu, quy trình, sơ đồ và bản vẽ.",
    matrix: { ADMIN: "create", SUPERVISOR: "create", TECHNICIAN: "create", VIEWER: "create" },
  },
  {
    group: "Tài liệu số",
    feature: "Forum kỹ thuật - gỡ nội dung không phù hợp",
    note: "Quản trị viên được xoá chủ đề hoặc phản hồi nếu nội dung không phù hợp.",
    matrix: { ADMIN: "full", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  },
];

const PERMISSION_META: Record<PermissionValue, { label: string; icon: LucideIcon; className: string; title: string }> = {
  full: {
    label: "Toàn quyền",
    icon: ShieldCheck,
    className: "bg-gradient-to-b from-emerald-400 to-green-600 text-white shadow-green-500/30",
    title: "Toàn quyền",
  },
  manage: {
    label: "Quản lý",
    icon: KeyRound,
    className: "bg-gradient-to-b from-blue-400 to-blue-600 text-white shadow-blue-500/30",
    title: "Được thêm, sửa hoặc quản lý nghiệp vụ",
  },
  approve: {
    label: "Duyệt",
    icon: UserCheck,
    className: "bg-gradient-to-b from-teal-400 to-emerald-600 text-white shadow-emerald-500/30",
    title: "Được duyệt / xác nhận",
  },
  create: {
    label: "Tạo",
    icon: PencilLine,
    className: "bg-gradient-to-b from-sky-400 to-cyan-600 text-white shadow-cyan-500/30",
    title: "Được tạo mới",
  },
  own: {
    label: "Của mình",
    icon: CircleDot,
    className: "bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 shadow-amber-500/30",
    title: "Chỉ thao tác với dữ liệu do mình tạo",
  },
  read: {
    label: "Chỉ xem",
    icon: Eye,
    className: "bg-gradient-to-b from-slate-100 to-slate-300 text-slate-700 shadow-slate-400/20",
    title: "Chỉ xem / tra cứu",
  },
  none: {
    label: "Không",
    icon: XCircle,
    className: "bg-gradient-to-b from-rose-50 to-slate-200 text-slate-500 shadow-slate-400/10",
    title: "Không được phép",
  },
};

export default function RolesPage() {
  const groupedRows = PERMISSIONS.reduce<Array<{ group: string; rows: PermissionRow[] }>>((acc, row) => {
    const current = acc[acc.length - 1];
    if (current?.group === row.group) current.rows.push(row);
    else acc.push({ group: row.group, rows: [row] });
    return acc;
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Phân quyền (RBAC)"
        description="Ma trận quyền truy cập theo vai trò và nghiệp vụ quản lý"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ROLE_ORDER.map((role) => (
          <Card key={role} className="overflow-hidden">
            <CardContent className="relative p-4">
              <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", ROLE_SUMMARY[role].accent)} />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <RoleBadge role={role} />
                  <p className="mt-2 text-sm font-semibold text-ink">{ROLE_SUMMARY[role].scope}</p>
                </div>
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg", ROLE_SUMMARY[role].accent)}>
                  <Lock className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">{ROLE_SUMMARY[role].desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="gap-3 border-b border-border">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Ma trận phân quyền quản lý</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Dấu quyền phản ánh hành vi hiện tại của các màn hình và API trong hệ thống.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(PERMISSION_META) as PermissionValue[]).map((key) => (
                <PermissionPill key={key} value={key} compact />
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="w-[170px] px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">
                    Nhóm
                  </th>
                  <th className="min-w-[340px] px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">
                    Chức năng
                  </th>
                  {ROLE_ORDER.map((role) => (
                    <th key={role} className="min-w-[138px] px-4 py-3 text-center text-xs font-semibold uppercase text-muted-foreground">
                      {ROLES[role].label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupedRows.map(({ group, rows }) =>
                  rows.map((row, index) => (
                    <tr key={`${group}-${row.feature}`} className="border-b border-border last:border-0">
                      {index === 0 && (
                        <td rowSpan={rows.length} className="border-r border-border bg-muted/25 px-4 py-4 align-top">
                          <div className="sticky top-16 font-semibold text-ink">{group}</div>
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="font-semibold text-ink">{row.feature}</div>
                        <div className="mt-0.5 max-w-xl text-xs leading-5 text-muted-foreground">{row.note}</div>
                      </td>
                      {ROLE_ORDER.map((role) => (
                        <td key={role} className="px-4 py-3 text-center">
                          <PermissionPill value={row.matrix[role]} />
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <span className="font-semibold text-ink">Ghi chú:</span> các quyền thao tác dữ liệu nhạy cảm như người dùng, phân quyền,
        danh mục thiết bị và danh mục vật tư đang giới hạn cho Quản trị. Trưởng ca tập trung ở luồng duyệt và điều phối vận hành.
      </div>
    </div>
  );
}

function PermissionPill({ value, compact = false }: { value: PermissionValue; compact?: boolean }) {
  const meta = PERMISSION_META[value];
  const Icon = meta.icon;
  return (
    <span
      title={meta.title}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full font-semibold ring-1 ring-white/50",
        compact ? "px-2.5 py-1 text-[11px]" : "min-w-[98px] px-3 py-1.5 text-xs shadow-md",
        meta.className
      )}
    >
      {value === "full" ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : (
        <Icon className="h-3.5 w-3.5" />
      )}
      {meta.label}
    </span>
  );
}
