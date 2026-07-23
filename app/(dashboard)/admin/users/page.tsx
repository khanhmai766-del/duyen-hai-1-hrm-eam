"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Eye, FileSpreadsheet, History, ImageUp, KeyRound, Pencil, PenLine, Plus, Search, ShieldAlert, Trash2, UploadCloud, X, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RoleBadge } from "@/components/devices/status-badge";
import { AvatarPicker } from "@/components/shared/avatar-picker";
import { SignaturePad } from "@/components/shared/signature-pad";
import { useAdminUserDetail, useAdminUsers, useCreateUser, useUpdateUser, useDeleteUser, usePermanentDeleteUser, usePositions } from "@/hooks/useUsers";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { apiGet, apiMutate } from "@/lib/fetcher";
import { ROLES, type RoleKey } from "@/lib/constants";
import { passwordPolicyMessage } from "@/lib/password-policy";
import { cn, formatDateTime, initials } from "@/lib/utils";
import type { SafeUser } from "@/types";

const ROLE_KEYS = Object.keys(ROLES) as RoleKey[];
const PERMANENT_DELETE_CONFIRMATION = "xác nhận xóa";
const ROLE_PROFILE_PERMISSION = "__ROLE_PROFILE__";
const NO_ROLE_PROFILE = "__none__";
type ActivityCategory = "SYSTEM" | "SECURITY" | "ATTENDANCE" | "USER";
type PermissionValue = "full" | "manage" | "approve" | "create" | "own" | "read" | "none";
type RbacRoleProfile = {
  id: string;
  label: string;
  desc: string;
  scope: string;
  accent: string;
  custom?: boolean;
};
type RbacPermissionRow = {
  id: string;
  group: string;
  feature: string;
  note: string;
  matrix: Record<string, PermissionValue>;
};
type UserPermissionOverride = {
  id: string;
  userId: string;
  permissionId: string;
  roleId?: string;
  value: PermissionValue;
  note?: string;
  createdAt: string;
};
type RbacConfig = {
  permissions: RbacPermissionRow[];
  roles: RbacRoleProfile[];
  userOverrides: UserPermissionOverride[];
};
type ActivityLogRow = {
  id: string;
  action: string;
  category: ActivityCategory;
  entity: string;
  entityId: string | null;
  detail: string | null;
  createdAt: string;
  user?: { name: string | null } | null;
};
type SystemAuditLogRow = {
  id: string;
  actorUserId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string | null;
  beforeData: unknown;
  afterData: unknown;
  changedFields: string[];
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};
type AuditMeta = { page: number; pageSize: number; total: number; totalPages: number };

const CATEGORY_BADGE: Record<ActivityCategory, string> = {
  SYSTEM: "border-orange-200 bg-orange-100 text-orange-800",
  ATTENDANCE: "border-blue-200 bg-blue-100 text-blue-800",
  SECURITY: "border-violet-200 bg-violet-100 text-violet-800",
  USER: "border-slate-200 bg-slate-100 text-slate-700",
};

/** Trì hoãn giá trị tìm kiếm — tránh bắn 1 request API cho mỗi phím gõ. */
function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function compactDetail(value: unknown, max = 90) {
  const text = typeof value === "string" ? value : value == null ? "" : JSON.stringify(value);
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function formatJson(value: unknown) {
  if (value == null) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const rbac = useRbacAccess();
  const canManageUsers = rbac.can("user-manage", ["manage", "full"]);
  const canResetViewerPassword = rbac.can("user-reset-viewer-password", ["approve", "manage", "full"]);
  const canViewActivityLog = rbac.can("system_audit_log:view", ["read", "manage", "full"]);
  const canManageRbac = rbac.can("rbac-manage", ["full"]);
  const canOpenPage = canManageUsers || canResetViewerPassword || canViewActivityLog || canManageRbac;
  const queryClient = useQueryClient();
  const create = useCreateUser();
  const update = useUpdateUser();
  const del = useDeleteUser();
  const permanentDelete = usePermanentDeleteUser();
  const rbacQuery = useQuery({
    queryKey: ["rbac-config"],
    queryFn: () => apiGet<RbacConfig>("/api/rbac"),
    enabled: canManageUsers || canManageRbac,
  });
  const saveRbac = useMutation({
    mutationFn: (body: RbacConfig) => apiMutate<RbacConfig>("/api/rbac", "PUT", body),
    onSuccess: (saved) => {
      queryClient.setQueryData(["rbac-config"], { data: saved, meta: null });
      queryClient.invalidateQueries({ queryKey: ["rbac-me"] });
    },
  });

  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [positionFilter, setPositionFilter] = React.useState("ALL");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const [form, setForm] = React.useState({ name: "", email: "", workEmail: "", username: "", employeeId: "", position: "", secondaryPosition: "", secondaryPosition2: "", department: "", role: "VIEWER", password: "password123", avatarUrl: "", signatureUrl: "" });
  const [newUserRoleProfile, setNewUserRoleProfile] = React.useState("");
  const [editTarget, setEditTarget] = React.useState<SafeUser | null>(null);
  const [delTarget, setDelTarget] = React.useState<SafeUser | null>(null);
  const [permanentDelTarget, setPermanentDelTarget] = React.useState<SafeUser | null>(null);
  const [permanentConfirm, setPermanentConfirm] = React.useState("");
  const [resetTarget, setResetTarget] = React.useState<SafeUser | null>(null);
  const [resetPasswordForm, setResetPasswordForm] = React.useState({ newPassword: "", confirmPassword: "" });
  const [auditTab, setAuditTab] = React.useState<"activity" | "system">("activity");
  const [auditSearch, setAuditSearch] = React.useState("");
  const debouncedAuditSearch = useDebouncedValue(auditSearch);
  const [auditAction, setAuditAction] = React.useState("");
  const debouncedAuditAction = useDebouncedValue(auditAction);
  const [auditFrom, setAuditFrom] = React.useState("");
  const [auditTo, setAuditTo] = React.useState("");
  const [auditPage, setAuditPage] = React.useState(1);
  const [activityDetail, setActivityDetail] = React.useState<ActivityLogRow | null>(null);
  const [systemAuditDetail, setSystemAuditDetail] = React.useState<SystemAuditLogRow | null>(null);
  const auditParams = React.useMemo(() => {
    const params = new URLSearchParams({ page: String(auditPage), pageSize: "25" });
    if (debouncedAuditSearch.trim()) params.set("q", debouncedAuditSearch.trim());
    if (debouncedAuditAction.trim()) params.set("action", debouncedAuditAction.trim());
    if (auditFrom) params.set("from", `${auditFrom}T00:00:00+07:00`);
    if (auditTo) params.set("to", `${auditTo}T23:59:59.999+07:00`);
    return params.toString();
  }, [debouncedAuditAction, auditFrom, auditPage, debouncedAuditSearch, auditTo]);
  const audit = useQuery({
    queryKey: ["audit", auditParams],
    queryFn: () => apiGet<ActivityLogRow[]>(`/api/audit?${auditParams}`),
    enabled: canViewActivityLog && auditTab === "activity",
  });
  const systemAudit = useQuery({
    queryKey: ["system-audit", auditParams],
    queryFn: () => apiGet<SystemAuditLogRow[]>(`/api/system-audit?${auditParams}`),
    enabled: canViewActivityLog && auditTab === "system",
  });
  const usersQuery = useAdminUsers({
    page,
    pageSize,
    q: debouncedSearch,
    position: positionFilter,
    enabled: canOpenPage && !rbac.isLoading,
  });

  const usersPage = usersQuery.data?.data;
  const users = usersPage?.rows ?? [];
  const totalUsers = usersPage?.total ?? 0;
  const rbacConfig = rbacQuery.data?.data ?? { permissions: [], roles: [], userOverrides: [] };
  const roleProfiles = rbacConfig.roles ?? [];
  const roleProfileByUser = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const override of rbacConfig.userOverrides ?? []) {
      if (override.permissionId === ROLE_PROFILE_PERMISSION && override.roleId && !map.has(override.userId)) {
        map.set(override.userId, override.roleId);
      }
    }
    return map;
  }, [rbacConfig.userOverrides]);
  const positions = usePositions({ enabled: canOpenPage && !rbac.isLoading });
  const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize));
  const firstShown = totalUsers ? (page - 1) * pageSize + 1 : 0;
  const lastShown = Math.min(page * pageSize, totalUsers);
  const pagedUsers = users;
  const auditRows = audit.data?.data ?? [];
  const activityAuditMeta = audit.data?.meta as AuditMeta | null;
  const systemAuditRows = (systemAudit.data?.data ?? []).slice(0, 100);
  const systemAuditMeta = systemAudit.data?.meta as AuditMeta | null;

  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch, positionFilter, pageSize]);

  React.useEffect(() => {
    setAuditPage(1);
  }, [debouncedAuditSearch, debouncedAuditAction, auditFrom, auditTo, auditTab]);

  React.useEffect(() => {
    setPage((current) => Math.min(Math.max(1, current), totalPages));
  }, [totalPages]);

  if (session && !canOpenPage && !rbac.isLoading) {
    return (
      <Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center">
        <ShieldAlert className="h-10 w-10 text-destructive" />
        <p className="font-medium text-ink">Bạn không có quyền truy cập trang này</p>
        <p className="text-sm text-muted-foreground">Bạn chưa được cấp quyền quản trị người dùng hoặc xem nhật ký hệ thống.</p>
      </CardContent></Card>
    );
  }

  async function createUser() {
    if (!form.name || !form.email || !form.employeeId || !form.username.trim()) return toast.error("Nhập đủ thông tin bắt buộc");
    try {
      const created = await create.mutateAsync(form);
      if (newUserRoleProfile) {
        await changeRoleProfile(created.id, newUserRoleProfile, { silent: true });
      }
      toast.success("Đã tạo người dùng");
      setOpen(false);
      setForm({ name: "", email: "", workEmail: "", username: "", employeeId: "", position: "", secondaryPosition: "", secondaryPosition2: "", department: "", role: "VIEWER", password: "password123", avatarUrl: "", signatureUrl: "" });
      setNewUserRoleProfile("");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function changeRole(id: string, role: string) {
    try { await update.mutateAsync({ id, role }); toast.success("Đã cập nhật vai trò"); }
    catch (e) { toast.error((e as Error).message); }
  }
  function openResetPassword(user: SafeUser) {
    setResetTarget(user);
    setResetPasswordForm({ newPassword: "", confirmPassword: "" });
  }
  async function changeRoleProfile(userId: string, roleId: string, options: { silent?: boolean } = {}) {
    const normalizedRoleId = roleId === NO_ROLE_PROFILE ? "" : roleId;
    if (normalizedRoleId && !roleProfiles.some((role) => role.id === normalizedRoleId)) {
      toast.error("Phân quyền mở rộng không còn tồn tại");
      return;
    }
    if (!rbacConfig.permissions.length) {
      toast.error("Chưa có cấu hình RBAC để lưu phân quyền mở rộng");
      return;
    }
    const nextOverrides = [
      ...(rbacConfig.userOverrides ?? []).filter(
        (item) => !(item.userId === userId && item.permissionId === ROLE_PROFILE_PERMISSION)
      ),
      ...(normalizedRoleId
        ? [{
            id: `override-${Date.now()}`,
            userId,
            permissionId: ROLE_PROFILE_PERMISSION,
            roleId: normalizedRoleId,
            value: "read" as PermissionValue,
            note: "Gán từ trang Quản lý người dùng",
            createdAt: new Date().toISOString(),
          }]
        : []),
    ];
    try {
      await saveRbac.mutateAsync({ ...rbacConfig, userOverrides: nextOverrides });
      if (!options.silent) toast.success(normalizedRoleId ? "Đã gán phân quyền mở rộng" : "Đã gỡ phân quyền mở rộng");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function toggleActive(id: string, isActive: boolean) {
    try { await update.mutateAsync({ id, isActive }); toast.success(isActive ? "Đã kích hoạt" : "Đã vô hiệu hoá"); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="QUẢN LÝ NGƯỜI DÙNG" description="Tài khoản & phân quyền hệ thống">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm tên hoặc mã nhân viên..."
            className="h-9 w-56 pl-9 pr-8 sm:w-64"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-ink"
              aria-label="Xoá tìm kiếm"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Select value={positionFilter} onValueChange={setPositionFilter}>
          <SelectTrigger className="h-9 w-52" aria-label="Lọc theo chức vụ"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả chức vụ</SelectItem>
            {positions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        {canManageUsers && (
          <>
            <Button variant="outline" onClick={() => window.open("/admin/export-users", "_blank")}>
              <Download className="h-4 w-4" /> Xuất danh sách
            </Button>
            <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Thêm người dùng</Button>
          </>
        )}
      </PageHeader>

      {canManageUsers && <AdminUserUploadPanel />}

      {usersQuery.isLoading ? <TableSkeleton /> : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow className="[&_th]:whitespace-nowrap">
                <TableHead className="text-center">Hình ảnh</TableHead>
                <TableHead className="min-w-[200px]">Nhân viên</TableHead><TableHead>Mã NV</TableHead><TableHead>User</TableHead><TableHead>Email công ty</TableHead><TableHead>Email làm việc</TableHead>
                <TableHead className="text-center">Chữ ký số</TableHead>
                <TableHead>Phân quyền</TableHead><TableHead>Mở rộng</TableHead><TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                    Không tìm thấy người dùng phù hợp với điều kiện lọc.
                  </TableCell>
                </TableRow>
              )}
              {pagedUsers.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="mx-auto flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-navy text-sm font-semibold text-white ring-1 ring-border">
                      {u.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u.avatarUrl} alt={u.name} className="h-full w-full object-cover" />
                      ) : (
                        initials(u.name)
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="whitespace-nowrap font-medium text-ink">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.position || "—"}</div>
                    {u.secondaryPosition && (
                      <div className="mt-0.5 inline-flex max-w-[220px] items-center rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                        Phụ 1: <span className="ml-1 truncate">{u.secondaryPosition}</span>
                      </div>
                    )}
                    {u.secondaryPosition2 && (
                      <div className="ml-1 mt-0.5 inline-flex max-w-[220px] items-center rounded bg-fuchsia-50 px-1.5 py-0.5 text-[11px] font-medium text-fuchsia-700">
                        Phụ 2: <span className="ml-1 truncate">{u.secondaryPosition2}</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{u.employeeId}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{u.username ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.workEmail ?? "—"}</TableCell>
                  <TableCell className="text-center">
                    {u.signatureUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={u.signatureUrl}
                        alt={`Chữ ký ${u.name}`}
                        className="mx-auto h-10 max-w-[120px] rounded bg-white object-contain px-1 ring-1 ring-border"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Select value={u.role} onValueChange={(v) => changeRole(u.id, v)} disabled={!canManageUsers}>
                      <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROLE_KEYS.map((r) => <SelectItem key={r} value={r}>{ROLES[r].label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <RoleProfileSelect
                      value={roleProfileByUser.get(u.id) ?? ""}
                      profiles={roleProfiles}
                      disabled={!canManageUsers || rbacQuery.isLoading || saveRbac.isPending}
                      onChange={(value) => changeRoleProfile(u.id, value)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1.5">
                      <button
                        onClick={() => toggleActive(u.id, !u.isActive)}
                        disabled={!canManageUsers}
                        title={u.isActive ? "Đang hoạt động" : "Ngừng hoạt động"}
                        className={`relative h-7 w-12 rounded-full shadow-inner ring-1 transition-all duration-300 ${
                          u.isActive
                            ? "bg-gradient-to-b from-emerald-400 to-green-600 ring-green-700/30"
                            : "bg-gradient-to-b from-slate-200 to-slate-400 ring-slate-400/40"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-black/5 transition-all duration-300 ${
                            u.isActive ? "translate-x-[22px]" : "translate-x-0.5"
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${u.isActive ? "bg-green-500" : "bg-slate-400"}`} />
                        </span>
                      </button>
                      {u.lockedAt && (
                        <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                          Bị khóa
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {canManageUsers && (
                        <Button variant="ghost" size="icon" title="Chỉnh sửa" onClick={() => setEditTarget(u)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {(canManageUsers || (canResetViewerPassword && u.role === "VIEWER")) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title={u.role === "VIEWER" ? "Reset mật khẩu Người xem" : "Reset mật khẩu"}
                          onClick={() => openResetPassword(u)}
                        >
                          <KeyRound className="h-4 w-4 text-amber-600" />
                        </Button>
                      )}
                      {canManageUsers && (
                        <>
                          <Button variant="ghost" size="icon" title="Xoá an toàn / ngừng hoạt động" onClick={() => setDelTarget(u)}>
                            <Archive className="h-4 w-4 text-amber-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Xoá vĩnh viễn"
                            onClick={() => {
                              setPermanentDelTarget(u);
                              setPermanentConfirm("");
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-red-700" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div>
              Hiển thị {firstShown}-{lastShown} trong tổng số {totalUsers} bản ghi
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <span>Hiển thị</span>
              <select
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
                className="h-8 rounded-md border border-input bg-white px-2 text-sm font-medium text-ink shadow-none"
                aria-label="Số dòng hiển thị"
              >
                {[10, 20, 50].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <span>dòng</span>
              <PageButton icon={ChevronsLeft} label="Trang đầu" disabled={page <= 1} onClick={() => setPage(1)} />
              <PageButton icon={ChevronLeft} label="Trang trước" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} />
              <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-bold text-ink">
                {page}/{totalPages}
              </span>
              <PageButton icon={ChevronRight} label="Trang sau" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} />
              <PageButton icon={ChevronsRight} label="Trang cuối" disabled={page >= totalPages} onClick={() => setPage(totalPages)} />
            </div>
          </div>
        </Card>
      )}

      {/* Audit log */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2"><History className="h-4 w-4" /> Nhật ký hoạt động</CardTitle>
          <div className="inline-flex rounded-lg border border-border bg-muted p-1">
            <button
              type="button"
              onClick={() => setAuditTab("activity")}
              className={cn("rounded-md px-3 py-1.5 text-sm font-semibold transition-colors", auditTab === "activity" ? "bg-white text-ink shadow-sm" : "text-muted-foreground hover:text-ink")}
            >
              Activity Log
            </button>
            <button
              type="button"
              onClick={() => setAuditTab("system")}
              className={cn("rounded-md px-3 py-1.5 text-sm font-semibold transition-colors", auditTab === "system" ? "bg-white text-ink shadow-sm" : "text-muted-foreground hover:text-ink")}
            >
              Audit hệ thống
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid gap-3 border-b border-border bg-slate-50/70 p-4 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_220px_170px_170px_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} className="bg-white pl-9" placeholder={auditTab === "activity" ? "Người dùng, đối tượng hoặc nội dung" : "Người thao tác, đối tượng, mã hoặc IP"} aria-label={auditTab === "activity" ? "Tìm kiếm nhật ký hoạt động" : "Tìm kiếm audit hệ thống"} />
              </div>
              <Input value={auditAction} onChange={(event) => setAuditAction(event.target.value)} className="bg-white font-mono text-xs" placeholder="Hành động, ví dụ UPDATE_USER" aria-label="Lọc theo hành động" />
              <Input type="date" value={auditFrom} onChange={(event) => setAuditFrom(event.target.value)} className="bg-white" aria-label="Từ ngày" />
              <Input type="date" value={auditTo} min={auditFrom || undefined} onChange={(event) => setAuditTo(event.target.value)} className="bg-white" aria-label="Đến ngày" />
              <Button type="button" variant="outline" disabled={!auditSearch && !auditAction && !auditFrom && !auditTo} onClick={() => { setAuditSearch(""); setAuditAction(""); setAuditFrom(""); setAuditTo(""); }}>
                <X className="mr-2 h-4 w-4" /> Xóa lọc
              </Button>
            </div>
          {auditTab === "activity" ? (
            <Table wrapperClassName="max-h-[460px]">
              <TableHeader>
                <TableRow>
                  {["Thời gian", "Người dùng", "Hành động", "Phân loại", "Đối tượng", "Chi tiết"].map((h) => (
                    <TableHead key={h} className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_hsl(var(--border))]">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditRows.map((a) => (
                  <TableRow key={a.id} className={cn(a.category === "SYSTEM" && "bg-orange-50/45 hover:bg-orange-50")}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(a.createdAt)}</TableCell>
                    <TableCell className="text-sm">{a.user?.name ?? "—"}</TableCell>
                    <TableCell><span className={cn("rounded border px-2 py-0.5 font-mono text-xs font-semibold", CATEGORY_BADGE[a.category])}>{a.action}</span></TableCell>
                    <TableCell><span className={cn("rounded-full border px-2 py-0.5 text-xs font-bold", CATEGORY_BADGE[a.category])}>{a.category}</span></TableCell>
                    <TableCell className="text-sm">{a.entity}</TableCell>
                    <TableCell className="max-w-[360px] text-sm text-muted-foreground">
                      <button type="button" onClick={() => setActivityDetail(a)} className="text-left hover:text-ink hover:underline">
                        {compactDetail(a.detail)}
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
                {auditRows.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">Chưa có nhật ký</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          ) : (
            <Table wrapperClassName="max-h-[460px]">
              <TableHeader>
                <TableRow>
                  {["Thời gian", "Người thao tác", "Hành động", "Đối tượng", "Trường thay đổi", "Chi tiết"].map((h) => (
                    <TableHead key={h} className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_hsl(var(--border))]">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {systemAuditRows.map((a) => (
                  <TableRow key={a.id} className="bg-orange-50/45 hover:bg-orange-50">
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(a.createdAt)}</TableCell>
                    <TableCell className="text-sm font-medium text-ink">{a.actorName}</TableCell>
                    <TableCell><span className="rounded border border-orange-200 bg-orange-100 px-2 py-0.5 font-mono text-xs font-semibold text-orange-800">{a.action}</span></TableCell>
                    <TableCell className="text-sm">{a.targetType}{a.targetId ? ` · ${a.targetId}` : ""}</TableCell>
                    <TableCell className="max-w-[260px] truncate text-sm text-muted-foreground">{a.changedFields?.join(", ") || "—"}</TableCell>
                    <TableCell>
                      <Button type="button" variant="outline" size="sm" onClick={() => setSystemAuditDetail(a)}>
                        Xem before/after
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {systemAuditRows.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">Chưa có audit hệ thống</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
          {canViewActivityLog && (
            <div className="flex flex-col gap-2 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>{(auditTab === "activity" ? activityAuditMeta?.total : systemAuditMeta?.total) ?? 0} bản ghi phù hợp</span>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" disabled={auditPage <= 1 || audit.isFetching || systemAudit.isFetching} onClick={() => setAuditPage((value) => Math.max(1, value - 1))}><ChevronLeft className="mr-1 h-4 w-4" /> Trước</Button>
                <span className="rounded-md bg-muted px-3 py-1 font-semibold text-ink">{auditPage}/{(auditTab === "activity" ? activityAuditMeta?.totalPages : systemAuditMeta?.totalPages) ?? 1}</span>
                <Button type="button" variant="outline" size="sm" disabled={auditPage >= ((auditTab === "activity" ? activityAuditMeta?.totalPages : systemAuditMeta?.totalPages) ?? 1) || audit.isFetching || systemAudit.isFetching} onClick={() => setAuditPage((value) => value + 1)}>Sau <ChevronRight className="ml-1 h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Thêm người dùng</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hình ảnh" className="col-span-2">
              <AvatarPicker value={form.avatarUrl} onChange={(v) => setForm({ ...form, avatarUrl: v })} name={form.name} />
            </Field>
            <Field label="Chữ ký số" className="col-span-2">
              <SignaturePad value={form.signatureUrl} onChange={(v) => setForm({ ...form, signatureUrl: v })} />
            </Field>
            <Field label="Họ tên *" className="col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Email công ty *"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Email làm việc"><Input type="email" value={form.workEmail} onChange={(e) => setForm({ ...form, workEmail: e.target.value })} /></Field>
            <Field label="User *"><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
            <Field label="Mã NV *"><Input value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} /></Field>
            <Field label="Chức vụ chính"><PositionSelect value={form.position} onChange={(v) => setForm({ ...form, position: v })} /></Field>
            <Field label="Chức vụ phụ 1"><PositionSelect value={form.secondaryPosition} onChange={(v) => setForm({ ...form, secondaryPosition: v })} /></Field>
            <Field label="Chức vụ phụ 2"><PositionSelect value={form.secondaryPosition2} onChange={(v) => setForm({ ...form, secondaryPosition2: v })} /></Field>
            <Field label="Bộ phận"><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></Field>
            <Field label="Vai trò">
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROLE_KEYS.map((r) => <SelectItem key={r} value={r}>{ROLES[r].label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Phân quyền mở rộng">
              <RoleProfileSelect
                value={newUserRoleProfile}
                profiles={roleProfiles}
                disabled={rbacQuery.isLoading}
                onChange={(value) => setNewUserRoleProfile(value === NO_ROLE_PROFILE ? "" : value)}
              />
            </Field>
            <Field label="Mật khẩu"><Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button onClick={createUser} disabled={create.isPending}>Tạo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit user */}
      <EditUserDialog target={editTarget} onClose={() => setEditTarget(null)} />

      {/* Reset password */}
      <Dialog
        open={!!resetTarget}
        onOpenChange={(o) => {
          if (!o) {
            setResetTarget(null);
            setResetPasswordForm({ newPassword: "", confirmPassword: "" });
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset mật khẩu</DialogTitle>
            <DialogDescription>
              Đặt mật khẩu tạm cho tài khoản &quot;{resetTarget?.name}&quot;. Người dùng sẽ phải đổi mật khẩu sau khi đăng nhập.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Mật khẩu tạm">
              <Input
                type="password"
                autoComplete="new-password"
                value={resetPasswordForm.newPassword}
                onChange={(e) => setResetPasswordForm((current) => ({ ...current, newPassword: e.target.value }))}
              />
            </Field>
            <Field label="Xác nhận mật khẩu tạm">
              <Input
                type="password"
                autoComplete="new-password"
                value={resetPasswordForm.confirmPassword}
                onChange={(e) => setResetPasswordForm((current) => ({ ...current, confirmPassword: e.target.value }))}
              />
            </Field>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Mật khẩu cần tối thiểu 8 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt. Mật khẩu không được ghi vào nhật ký hệ thống.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)} disabled={update.isPending}>Huỷ</Button>
            <Button
              onClick={async () => {
                if (!resetTarget) return;
                const policyError = passwordPolicyMessage(resetPasswordForm.newPassword);
                if (policyError) return toast.error(policyError);
                if (resetPasswordForm.newPassword !== resetPasswordForm.confirmPassword) {
                  return toast.error("Xác nhận mật khẩu tạm không khớp");
                }
                try {
                  await update.mutateAsync({
                    id: resetTarget.id,
                    resetPassword: true,
                    newPassword: resetPasswordForm.newPassword,
                  });
                  toast.success("Đã reset mật khẩu", { description: "Người dùng sẽ phải đổi mật khẩu sau khi đăng nhập." });
                  setResetTarget(null);
                  setResetPasswordForm({ newPassword: "", confirmPassword: "" });
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
              disabled={update.isPending}
            >
              Reset mật khẩu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete user */}
      <ConfirmDialog
        open={!!delTarget}
        onOpenChange={(o) => !o && setDelTarget(null)}
        title="Xoá người dùng?"
        description={`Xoá tài khoản "${delTarget?.name}" (${delTarget?.employeeId})? Nếu người dùng có dữ liệu liên quan sẽ được chuyển sang trạng thái ngừng hoạt động.`}
        confirmLabel="Xoá"
        loading={del.isPending}
        onConfirm={async () => {
          if (!delTarget) return;
          try {
            const result = await del.mutateAsync(delTarget.id);
            toast.success(result.deactivated ? "Đã chuyển người dùng sang trạng thái ngừng hoạt động" : "Đã xoá người dùng", {
              description: result.message,
            });
            setDelTarget(null);
          } catch (e) {
            toast.error((e as Error).message);
            setDelTarget(null);
          }
        }}
      />

      <Dialog
        open={!!permanentDelTarget}
        onOpenChange={(open) => {
          if (open) return;
          setPermanentDelTarget(null);
          setPermanentConfirm("");
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Xoá vĩnh viễn người dùng?</DialogTitle>
            <DialogDescription>
              Thao tác này xoá hoàn toàn tài khoản "{permanentDelTarget?.name}" ({permanentDelTarget?.employeeId}) và các dữ liệu liên quan khỏi hệ thống. Không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="permanent-delete-confirm">Nhập "xác nhận xóa" để tiếp tục</Label>
            <Input
              id="permanent-delete-confirm"
              value={permanentConfirm}
              onChange={(event) => setPermanentConfirm(event.target.value)}
              placeholder="xác nhận xóa"
              autoComplete="off"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setPermanentDelTarget(null);
                setPermanentConfirm("");
              }}
              disabled={permanentDelete.isPending}
            >
              Huỷ
            </Button>
            <Button
              variant="destructive"
              disabled={permanentDelete.isPending || permanentConfirm.trim().toLocaleLowerCase("vi") !== PERMANENT_DELETE_CONFIRMATION}
              onClick={async () => {
                if (!permanentDelTarget) return;
                try {
                  await permanentDelete.mutateAsync({ id: permanentDelTarget.id, confirmation: permanentConfirm });
                  toast.success("Đã xoá vĩnh viễn người dùng");
                  setPermanentDelTarget(null);
                  setPermanentConfirm("");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Xoá vĩnh viễn
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!activityDetail} onOpenChange={(open) => !open && setActivityDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Chi tiết Activity Log</DialogTitle>
            <DialogDescription>
              {activityDetail?.action} · {activityDetail?.entity}
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[55vh] overflow-auto rounded-lg border border-border bg-muted p-4 text-xs leading-5 text-ink">
            {activityDetail?.detail || "Không có chi tiết"}
          </pre>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivityDetail(null)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!systemAuditDetail} onOpenChange={(open) => !open && setSystemAuditDetail(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Audit hệ thống</DialogTitle>
            <DialogDescription>
              {systemAuditDetail?.action} · {systemAuditDetail?.targetType}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-bold uppercase text-muted-foreground">Before</div>
              <pre className="max-h-[56vh] overflow-auto rounded-lg border border-border bg-slate-50 p-4 text-xs leading-5 text-ink">
                {formatJson(systemAuditDetail?.beforeData)}
              </pre>
            </div>
            <div>
              <div className="mb-1 text-xs font-bold uppercase text-muted-foreground">After</div>
              <pre className="max-h-[56vh] overflow-auto rounded-lg border border-orange-200 bg-orange-50 p-4 text-xs leading-5 text-ink">
                {formatJson(systemAuditDetail?.afterData)}
              </pre>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-white px-3 py-2 text-xs text-muted-foreground">
            IP: <span className="font-medium text-ink">{systemAuditDetail?.ipAddress ?? "—"}</span> · User-Agent:{" "}
            <span className="font-medium text-ink">{compactDetail(systemAuditDetail?.userAgent, 140)}</span>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSystemAuditDetail(null)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PageButton({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="h-8 w-8 rounded-lg disabled:cursor-not-allowed disabled:opacity-45"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}

type ImportReport = {
  preview: boolean;
  mode: string;
  import_key: string | null;
  total_rows: number;
  success_rows: number;
  error_rows: number;
  created: number;
  updated: number;
  rows: Array<{
    row: number;
    employee_code: string | null;
    email: string | null;
    work_email: string | null;
    action: string;
    status: string;
    errors: string[];
  }>;
};

type ZipReport = {
  total_files: number;
  success_files: number;
  error_files: number;
  errors: Array<{ file: string; reason: string }>;
};

async function postForm<T>(url: string, formData: FormData): Promise<T> {
  const res = await fetch(url, { method: "POST", body: formData });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || "Thao tác thất bại");
  return json.data as T;
}

function AdminUserUploadPanel() {
  const enabled = process.env.NEXT_PUBLIC_USER_IMPORT_ENABLED === "true";
  const qc = useQueryClient();
  const [mode, setMode] = React.useState("upsert");
  const [employeeCode, setEmployeeCode] = React.useState("");
  const [importFile, setImportFile] = React.useState<File | null>(null);
  const [avatarFile, setAvatarFile] = React.useState<File | null>(null);
  const [signatureFile, setSignatureFile] = React.useState<File | null>(null);
  const [avatarZip, setAvatarZip] = React.useState<File | null>(null);
  const [signatureZip, setSignatureZip] = React.useState<File | null>(null);
  const [importReport, setImportReport] = React.useState<ImportReport | null>(null);
  const [zipReport, setZipReport] = React.useState<ZipReport | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function refreshAfterMutation() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["users"] }),
      qc.invalidateQueries({ queryKey: ["audit"] }),
      qc.invalidateQueries({ queryKey: ["me-dashboard"] }),
    ]);
  }

  async function submitImport(preview: boolean) {
    if (!importFile) return toast.error("Chọn file Excel hoặc CSV trước khi import");
    const fd = new FormData();
    fd.append("file", importFile);
    fd.append("mode", mode);
    fd.append("preview", String(preview));
    setBusy(preview ? "preview" : "import");
    try {
      const report = await postForm<ImportReport>("/admin/import-users", fd);
      setImportReport(report);
      toast.success(preview ? "Đã đọc thử file import" : "Đã import người dùng");
      if (!preview) await refreshAfterMutation();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function submitSingle(kind: "avatar" | "signature") {
    const file = kind === "avatar" ? avatarFile : signatureFile;
    if (!employeeCode.trim()) return toast.error("Nhập mã nhân viên để map file");
    if (!file) return toast.error(kind === "avatar" ? "Chọn ảnh đại diện" : "Chọn file chữ ký");
    const fd = new FormData();
    fd.append("employee_code", employeeCode.trim());
    fd.append("file", file);
    setBusy(kind);
    try {
      await postForm(kind === "avatar" ? "/admin/upload-avatar" : "/admin/upload-signature", fd);
      toast.success(kind === "avatar" ? "Đã upload ảnh đại diện" : "Đã upload chữ ký");
      await refreshAfterMutation();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function submitZip(kind: "avatar" | "signature") {
    const file = kind === "avatar" ? avatarZip : signatureZip;
    if (!file) return toast.error(kind === "avatar" ? "Chọn avatar.zip" : "Chọn signature.zip");
    const fd = new FormData();
    fd.append("file", file);
    setBusy(`${kind}-zip`);
    try {
      const report = await postForm<ZipReport>(kind === "avatar" ? "/admin/upload-avatars-zip" : "/admin/upload-signatures-zip", fd);
      setZipReport(report);
      toast.success(`Đã xử lý ${report.success_files}/${report.total_files} file`);
      await refreshAfterMutation();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="overflow-hidden border-sky-200/70">
      <CardHeader className="border-b bg-[linear-gradient(135deg,#f8fbff_0%,#eef8f5_100%)]">
        <CardTitle className="flex items-center gap-2 text-base">
          <UploadCloud className="h-4 w-4 text-navy" />
          Nhập liệu người dùng
        </CardTitle>
      </CardHeader>
      {!enabled ? (
        <CardContent className="p-4">
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-muted-foreground">
            Chức năng import/upload người dùng đang tắt trên môi trường này.
          </div>
        </CardContent>
      ) : (
      <CardContent className="grid gap-4 p-4 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-3 rounded-lg border border-border bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-ink">Import người dùng từ Excel/CSV</p>
              <p className="text-xs text-muted-foreground">Xem trước dữ liệu trước khi ghi vào hệ thống.</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => window.open("/admin/import-users?format=xlsx", "_blank")}>
              <Download className="h-4 w-4" /> Tải mẫu
            </Button>
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr_180px]">
            <Input type="file" accept=".xlsx,.csv" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="create">Chỉ thêm mới</SelectItem>
                <SelectItem value="update">Chỉ cập nhật</SelectItem>
                <SelectItem value="upsert">Thêm mới/cập nhật</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => submitImport(true)} disabled={!!busy}>
              <Eye className="h-4 w-4" /> Xem trước
            </Button>
            <Button type="button" onClick={() => submitImport(false)} disabled={!!busy}>
              <FileSpreadsheet className="h-4 w-4" /> Import
            </Button>
          </div>
          {importReport && <ImportReportView report={importReport} />}
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-white p-3">
          <div>
            <p className="text-sm font-semibold text-ink">Upload ảnh/chữ ký theo mã nhân viên</p>
            <p className="text-xs text-muted-foreground">Gắn file theo mã nhân viên để cập nhật hồ sơ hàng loạt.</p>
          </div>
          <Input value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} placeholder="Mã nhân viên, ví dụ NV001" />
          <MediaUploadRow icon={ImageUp} label="Ảnh đại diện" accept=".jpg,.jpeg,.png,.webp" onFile={setAvatarFile} onSubmit={() => submitSingle("avatar")} busy={busy === "avatar"} />
          <MediaUploadRow icon={PenLine} label="Chữ ký" accept=".png,.jpg,.jpeg,.pdf" onFile={setSignatureFile} onSubmit={() => submitSingle("signature")} busy={busy === "signature"} />
          <div className="grid gap-2 border-t pt-3 md:grid-cols-2">
            <ZipUploadBox label="avatar.zip" onFile={setAvatarZip} onSubmit={() => submitZip("avatar")} busy={busy === "avatar-zip"} />
            <ZipUploadBox label="signature.zip" onFile={setSignatureZip} onSubmit={() => submitZip("signature")} busy={busy === "signature-zip"} />
          </div>
          {zipReport && <ZipReportView report={zipReport} />}
        </div>
      </CardContent>
      )}
    </Card>
  );
}

function MediaUploadRow({ icon: Icon, label, accept, onFile, onSubmit, busy }: { icon: LucideIcon; label: string; accept: string; onFile: (file: File | null) => void; onSubmit: () => void; busy: boolean }) {
  return (
    <div className="grid gap-2 rounded-md bg-muted/40 p-2 md:grid-cols-[auto_1fr_auto] md:items-center">
      <div className="flex items-center gap-2 text-sm font-medium text-ink"><Icon className="h-4 w-4 text-navy" /> {label}</div>
      <Input type="file" accept={accept} onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      <Button type="button" size="sm" onClick={onSubmit} disabled={busy}>
        <UploadCloud className="h-4 w-4" /> Upload
      </Button>
    </div>
  );
}

function ZipUploadBox({ label, onFile, onSubmit, busy }: { label: string; onFile: (file: File | null) => void; onSubmit: () => void; busy: boolean }) {
  return (
    <div className="space-y-2 rounded-md bg-muted/40 p-2">
      <div className="flex items-center gap-2 text-sm font-medium text-ink"><Archive className="h-4 w-4 text-navy" /> {label}</div>
      <Input type="file" accept=".zip" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      <Button type="button" variant="outline" size="sm" onClick={onSubmit} disabled={busy} className="w-full">
        <UploadCloud className="h-4 w-4" /> Upload ZIP
      </Button>
    </div>
  );
}

function ImportReportView({ report }: { report: ImportReport }) {
  const errorRows = report.rows.filter((row) => row.status === "error").slice(0, 8);
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
      <div className="grid gap-2 sm:grid-cols-4">
        <Metric label="Tổng dòng" value={report.total_rows} />
        <Metric label="Thành công" value={report.success_rows} />
        <Metric label="Tạo mới" value={report.created} />
        <Metric label="Lỗi" value={report.error_rows} tone={report.error_rows ? "danger" : "normal"} />
      </div>
      {errorRows.length > 0 && (
        <div className="mt-3 max-h-44 overflow-auto rounded border bg-white">
          {errorRows.map((row) => (
            <div key={row.row} className="border-b px-3 py-2 last:border-b-0">
              <span className="font-mono text-xs">Dòng {row.row}</span>
              <span className="ml-2 text-xs text-muted-foreground">{row.employee_code ?? "Chưa có mã"}</span>
              <p className="mt-1 text-xs text-destructive">{row.errors.join("; ")}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ZipReportView({ report }: { report: ZipReport }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
      <div className="grid gap-2 sm:grid-cols-3">
        <Metric label="Tổng file" value={report.total_files} />
        <Metric label="Thành công" value={report.success_files} />
        <Metric label="Lỗi" value={report.error_files} tone={report.error_files ? "danger" : "normal"} />
      </div>
      {report.errors.length > 0 && (
        <div className="mt-3 max-h-36 overflow-auto rounded border bg-white">
          {report.errors.slice(0, 8).map((item) => (
            <div key={item.file} className="border-b px-3 py-2 text-xs last:border-b-0">
              <span className="font-mono">{item.file}</span>
              <span className="ml-2 text-destructive">{item.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, tone = "normal" }: { label: string; value: number; tone?: "normal" | "danger" }) {
  return (
    <div className="rounded-md bg-white px-3 py-2 ring-1 ring-border">
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
      <div className={tone === "danger" ? "text-lg font-bold text-destructive" : "text-lg font-bold text-ink"}>{value}</div>
    </div>
  );
}

function EditUserDialog({ target, onClose }: { target: SafeUser | null; onClose: () => void }) {
  const update = useUpdateUser();
  const detail = useAdminUserDetail(target?.id, !!target);
  const activeTarget = detail.data?.data ?? target;
  const [form, setForm] = React.useState<any>(null);

  React.useEffect(() => {
    if (activeTarget)
      setForm({
        name: activeTarget.name,
        email: activeTarget.email,
        workEmail: activeTarget.workEmail ?? "",
        username: activeTarget.username ?? "",
        employeeId: activeTarget.employeeId,
        phone: activeTarget.phone ?? "",
        position: activeTarget.position ?? "",
        secondaryPosition: activeTarget.secondaryPosition ?? "",
        secondaryPosition2: activeTarget.secondaryPosition2 ?? "",
        department: activeTarget.department ?? "",
        avatarUrl: activeTarget.avatarUrl ?? "",
        signatureUrl: activeTarget.signatureUrl ?? "",
        role: activeTarget.role,
      });
    else setForm(null);
  }, [activeTarget]);

  async function save() {
    if (!target || !form) return;
    try {
      await update.mutateAsync({ id: target.id, ...form });
      toast.success("Đã cập nhật người dùng");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Chỉnh sửa: {target?.name}</DialogTitle></DialogHeader>
        {detail.isLoading && (
          <div className="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
            Đang tải thông tin người dùng...
          </div>
        )}
        {form && !detail.isLoading && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hình ảnh" className="col-span-2">
              <AvatarPicker value={form.avatarUrl} onChange={(v) => setForm({ ...form, avatarUrl: v })} name={form.name} />
            </Field>
            <Field label="Chữ ký số" className="col-span-2">
              <SignaturePad value={form.signatureUrl} onChange={(v) => setForm({ ...form, signatureUrl: v })} />
            </Field>
            <Field label="Họ tên" className="col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Email công ty"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Email làm việc"><Input type="email" value={form.workEmail} onChange={(e) => setForm({ ...form, workEmail: e.target.value })} /></Field>
            <Field label="User"><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
            <Field label="Mã NV"><Input value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} /></Field>
            <Field label="SĐT"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Chức vụ chính"><PositionSelect value={form.position} onChange={(v) => setForm({ ...form, position: v })} /></Field>
            <Field label="Chức vụ phụ 1"><PositionSelect value={form.secondaryPosition} onChange={(v) => setForm({ ...form, secondaryPosition: v })} /></Field>
            <Field label="Chức vụ phụ 2"><PositionSelect value={form.secondaryPosition2} onChange={(v) => setForm({ ...form, secondaryPosition2: v })} /></Field>
            <Field label="Bộ phận"><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></Field>
            <Field label="Vai trò">
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROLE_KEYS.map((r) => <SelectItem key={r} value={r}>{ROLES[r].label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Huỷ</Button>
          <Button onClick={save} disabled={update.isPending}>Lưu</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoleProfileSelect({
  value,
  profiles,
  disabled,
  onChange,
}: {
  value: string;
  profiles: RbacRoleProfile[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value || NO_ROLE_PROFILE} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="h-8 w-48">
        <SelectValue placeholder="Chọn phân quyền mở rộng" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_ROLE_PROFILE}>Không gán</SelectItem>
        {profiles.map((profile) => (
          <SelectItem key={profile.id} value={profile.id}>
            {profile.label}
          </SelectItem>
        ))}
        {profiles.length === 0 && (
          <SelectItem value="__empty__" disabled>
            Chưa có phân quyền mở rộng
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><Label className="mb-1.5 block">{label}</Label>{children}</div>;
}

const NO_POSITION = "__none__";

/** Dropdown chọn Chức vụ — lấy từ data chức vụ hiện có (bỏ trùng). */
function PositionSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const positions = usePositions();
  // Đảm bảo giá trị hiện tại (vd khi sửa) luôn có trong danh sách.
  const options = value && !positions.includes(value) ? [value, ...positions] : positions;
  return (
    <Select value={value || NO_POSITION} onValueChange={(v) => onChange(v === NO_POSITION ? "" : v)}>
      <SelectTrigger><SelectValue placeholder="Chọn chức vụ" /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_POSITION}>— Không chọn —</SelectItem>
        {options.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
