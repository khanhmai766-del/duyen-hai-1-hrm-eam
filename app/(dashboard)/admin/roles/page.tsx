"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  CheckCircle2,
  CircleDot,
  Eye,
  KeyRound,
  Lock,
  PencilLine,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RoleBadge } from "@/components/devices/status-badge";
import { PositionSystemScopeCard } from "@/components/admin/position-system-scope-card";
import { useUpdateUser, useUsers } from "@/hooks/useUsers";
import { ROLES, type RoleKey } from "@/lib/constants";
import { apiGet, apiMutate } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

type PermissionValue = "full" | "manage" | "approve" | "create" | "own" | "read" | "none";

interface PermissionRow {
  id: string;
  group: string;
  feature: string;
  note: string;
  matrix: Record<string, PermissionValue>;
}

interface UserPermissionOverride {
  id: string;
  userId: string;
  permissionId: string;
  roleId?: string;
  value: PermissionValue;
  note?: string;
  createdAt: string;
}

interface RoleColumn {
  id: string;
  label: string;
  desc: string;
  scope: string;
  accent: string;
  systemRole?: RoleKey;
  custom?: boolean;
}

interface RbacConfig {
  permissions: PermissionRow[];
  roles: RoleColumn[];
  userOverrides: UserPermissionOverride[];
}

const PERMISSION_VALUES: PermissionValue[] = ["full", "manage", "approve", "create", "own", "read", "none"];

const SYSTEM_ROLE_COLUMNS: RoleColumn[] = [
  {
    id: "ADMIN",
    label: ROLES.ADMIN.label,
    desc: "Toàn quyền cấu hình, dữ liệu và người dùng.",
    scope: "Quản trị hệ thống",
    accent: "from-[#1E3A5F] to-[#2563EB]",
    systemRole: "ADMIN",
  },
  {
    id: "SUPERVISOR",
    label: ROLES.SUPERVISOR.label,
    desc: "Duyệt ca, điều phối vận hành và theo dõi sửa chữa.",
    scope: "Trưởng ca / điều hành",
    accent: "from-blue-500 to-cyan-600",
    systemRole: "SUPERVISOR",
  },
  {
    id: "TECHNICIAN",
    label: ROLES.TECHNICIAN.label,
    desc: "Ghi nhận khiếm khuyết, sửa chữa và cập nhật phiếu của mình.",
    scope: "Kỹ thuật hiện trường",
    accent: "from-amber-500 to-orange-600",
    systemRole: "TECHNICIAN",
  },
  {
    id: "VIEWER",
    label: ROLES.VIEWER.label,
    desc: "Chỉ xem dữ liệu đã công bố, không thay đổi hồ sơ.",
    scope: "Tra cứu / báo cáo",
    accent: "from-slate-400 to-slate-600",
    systemRole: "VIEWER",
  },
];

const ROLE_ORDER: RoleKey[] = SYSTEM_ROLE_COLUMNS.map((role) => role.id as RoleKey);

const DEFAULT_MATRIX: Record<string, PermissionValue> = {
  ADMIN: "manage",
  SUPERVISOR: "read",
  TECHNICIAN: "read",
  VIEWER: "read",
};

const DEFAULT_PERMISSIONS: PermissionRow[] = [
  {
    id: "dashboard-read",
    group: "Tổng quan",
    feature: "Xem dashboard, báo cáo và tra cứu dữ liệu",
    note: "Bao gồm overview, báo cáo, danh sách thiết bị, lịch sử, vật tư.",
    matrix: { ADMIN: "read", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" },
  },
  {
    id: "shift-check-in",
    group: "Nhân sự / Ca trực",
    feature: "Điểm danh theo sơ đồ tổ chức ca",
    note: "Tự chọn cương vị trực hoặc xem phân công theo ca.",
    matrix: { ADMIN: "create", SUPERVISOR: "create", TECHNICIAN: "create", VIEWER: "read" },
  },
  {
    id: "shift-approve",
    group: "Nhân sự / Ca trực",
    feature: "Duyệt điểm danh, chấm công hành chính và chỉnh bảng công",
    note: "Áp dụng cho ca trực, check-in hành chính, danh sách cần xác nhận và các ô bảng công cần điều chỉnh thủ công.",
    matrix: { ADMIN: "approve", SUPERVISOR: "none", TECHNICIAN: "approve", VIEWER: "none" },
  },
  {
    id: "user-admin",
    group: "Nhân sự / Ca trực",
    feature: "Quản lý người dùng và phân quyền",
    note: "Tạo tài khoản, đổi vai trò, khóa/mở nhân sự.",
    matrix: { ADMIN: "full", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    id: "system_audit_log:view",
    group: "Quản trị hệ thống",
    feature: "Xem Audit hệ thống",
    note: "Tra cứu các thay đổi quan trọng về phân quyền, người dùng và cấu hình hệ thống.",
    matrix: { ADMIN: "read", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    id: "device-manage",
    group: "Thiết bị",
    feature: "Thêm, sửa và nhập danh mục thiết bị",
    note: "Cập nhật lý lịch thiết bị, ảnh, QR và thông tin đính kèm.",
    matrix: { ADMIN: "manage", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" },
  },
  {
    id: "device-delete",
    group: "Thiết bị",
    feature: "Xoá thiết bị",
    note: "Xoá thiết bị sẽ xoá lịch sử sửa chữa liên quan.",
    matrix: { ADMIN: "full", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    id: "repair-create",
    group: "Sửa chữa",
    feature: "Tạo phiếu sửa chữa",
    note: "Lập phiếu từ trang thiết bị hoặc lịch sử sửa chữa.",
    matrix: { ADMIN: "create", SUPERVISOR: "create", TECHNICIAN: "create", VIEWER: "none" },
  },
  {
    id: "repair-edit",
    group: "Sửa chữa",
    feature: "Sửa phiếu sửa chữa",
    note: "Trưởng ca sửa được mọi phiếu; kỹ thuật viên chỉ sửa phiếu do mình tạo.",
    matrix: { ADMIN: "manage", SUPERVISOR: "manage", TECHNICIAN: "own", VIEWER: "none" },
  },
  {
    id: "repair-delete",
    group: "Sửa chữa",
    feature: "Xoá phiếu sửa chữa",
    note: "Quản trị xoá mọi phiếu; người tạo được xoá phiếu của mình.",
    matrix: { ADMIN: "full", SUPERVISOR: "own", TECHNICIAN: "own", VIEWER: "none" },
  },
  {
    id: "repair-approve",
    group: "Sửa chữa",
    feature: "Duyệt phiếu sửa chữa",
    note: "Xác nhận kết quả xử lý và trạng thái sau sửa chữa.",
    matrix: { ADMIN: "approve", SUPERVISOR: "approve", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    id: "defect-manage",
    group: "Khiếm khuyết",
    feature: "Ghi nhận và cập nhật khiếm khuyết thiết bị",
    note: "Theo dõi tình trạng, mức độ, yêu cầu xử lý và hình ảnh hiện trường.",
    matrix: { ADMIN: "manage", SUPERVISOR: "manage", TECHNICIAN: "create", VIEWER: "read" },
  },
  {
    id: "defect-close",
    group: "Khiếm khuyết",
    feature: "Xoá / đóng hồ sơ khiếm khuyết",
    note: "Chỉ cấp quản lý vận hành thực hiện các thao tác kết thúc hoặc xoá.",
    matrix: { ADMIN: "full", SUPERVISOR: "approve", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    id: "material-manage",
    group: "Vật tư",
    feature: "Quản lý danh mục vật tư",
    note: "Thêm, sửa, xoá, nhập dữ liệu và cập nhật tồn kho vật tư.",
    matrix: { ADMIN: "full", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" },
  },
  {
    id: "replacement-manage",
    group: "Vật tư",
    feature: "Quản lý lịch thay thế vật tư",
    note: "Tạo điểm thay thế, ghi nhận thay thế và theo dõi cảnh báo đến hạn.",
    matrix: { ADMIN: "manage", SUPERVISOR: "manage", TECHNICIAN: "read", VIEWER: "read" },
  },
  {
    id: "announcement-manage",
    group: "Thông tin vận hành",
    feature: "Mệnh lệnh sản xuất / thông báo",
    note: "Đăng, sửa, xoá thông báo và tài liệu đính kèm.",
    matrix: { ADMIN: "full", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" },
  },
  {
    id: "operation-events",
    group: "Thông tin vận hành",
    feature: "Lịch diễn tập và thông tin nội bộ",
    note: "Cập nhật lịch diễn tập sự cố, PCCC và ghi chú vận hành trong 3 tháng gần nhất.",
    matrix: { ADMIN: "manage", SUPERVISOR: "manage", TECHNICIAN: "read", VIEWER: "read" },
  },
  {
    id: "device-code",
    group: "Thiết bị - QR",
    feature: "Chỉnh sửa mã thiết bị",
    note: "Chỉ quản trị viên được đổi mã thiết bị; mã này liên quan tới QR và liên kết công khai.",
    matrix: { ADMIN: "full", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    id: "device-public-qr",
    group: "Thiết bị - QR",
    feature: "Xem thông tin thiết bị qua QR công khai",
    note: "Người quét QR có thể xem thông tin thiết bị công khai, kể cả khi không có tài khoản hệ thống.",
    matrix: { ADMIN: "read", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" },
  },
  {
    id: "document-procedure",
    group: "Tài liệu số",
    feature: "Danh mục quy trình",
    note: "Quản trị viên được thêm, sửa, xoá quy trình; các vai trò khác được tra cứu tài liệu.",
    matrix: { ADMIN: "full", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" },
  },
  {
    id: "document-pid",
    group: "Tài liệu số",
    feature: "Sơ đồ P&ID",
    note: "Quản trị viên được thêm, sửa, xoá bản vẽ; các vai trò khác được tra cứu sơ đồ.",
    matrix: { ADMIN: "full", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" },
  },
  {
    id: "archive-read",
    group: "Tài liệu số",
    feature: "Thư mục lưu trữ - tra cứu dữ liệu",
    note: "Bao gồm dữ liệu tách lưới, dữ liệu khởi động và dữ liệu hiệu chỉnh lò theo từng năm.",
    matrix: { ADMIN: "read", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" },
  },
  {
    id: "archive-create-delete",
    group: "Tài liệu số",
    feature: "Thư mục lưu trữ - thêm mới và xoá hồ sơ",
    note: "Chỉ Quản trị viên được tạo hồ sơ lưu trữ mới hoặc xoá hồ sơ khỏi danh mục.",
    matrix: { ADMIN: "full", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    id: "archive-edit",
    group: "Tài liệu số",
    feature: "Thư mục lưu trữ - chỉnh sửa hồ sơ",
    note: "Quản trị, Trưởng ca và Kỹ thuật viên được chỉnh sửa dữ liệu đã ghi nhận; Người xem chỉ tra cứu.",
    matrix: { ADMIN: "manage", SUPERVISOR: "manage", TECHNICIAN: "manage", VIEWER: "read" },
  },
  {
    id: "archive-backup",
    group: "Tài liệu số",
    feature: "Thư mục lưu trữ - backup Excel/PDF theo năm",
    note: "Thanh công cụ backup năm chỉ hiển thị cho Quản trị viên, xuất file theo từng tab dữ liệu.",
    matrix: { ADMIN: "full", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    id: "forum-write",
    group: "Tài liệu số",
    feature: "Forum kỹ thuật - tạo chủ đề và phản hồi",
    note: "Tài khoản nội bộ có thể trao đổi kỹ thuật, chia sẻ tài liệu, quy trình, sơ đồ và bản vẽ.",
    matrix: { ADMIN: "create", SUPERVISOR: "create", TECHNICIAN: "create", VIEWER: "create" },
  },
  {
    id: "forum-moderate",
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

const EMPTY_NEW_ROLE = {
  label: "",
  scope: "",
  desc: "",
  defaultValue: "read" as PermissionValue,
};

export default function RolesPage() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const users = useUsers();
  const updateUser = useUpdateUser();
  const rbacQuery = useQuery({
    queryKey: ["rbac-config"],
    queryFn: () => apiGet<RbacConfig>("/api/rbac"),
  });
  const saveRbac = useMutation({
    mutationFn: (body: RbacConfig) => apiMutate<RbacConfig>("/api/rbac", "PUT", body),
    onSuccess: (data) => {
      queryClient.setQueryData(["rbac-config"], { data, meta: null });
      toast.success("Đã lưu cấu hình phân quyền");
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const [permissions, setPermissions] = React.useState<PermissionRow[]>(DEFAULT_PERMISSIONS);
  const [customRoles, setCustomRoles] = React.useState<RoleColumn[]>([]);
  const [userOverrides, setUserOverrides] = React.useState<UserPermissionOverride[]>([]);
  const [editMode, setEditMode] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [newRole, setNewRole] = React.useState(EMPTY_NEW_ROLE);
  const [assignment, setAssignment] = React.useState({
    userId: "",
    role: "" as RoleKey | "",
    profileId: "",
    permissionId: "",
    value: "read" as PermissionValue,
    note: "",
  });

  React.useEffect(() => {
    const config = rbacQuery.data?.data;
    if (!config) return;
    setPermissions(config.permissions?.length ? config.permissions : DEFAULT_PERMISSIONS);
    setCustomRoles(config.roles ?? []);
    setUserOverrides(config.userOverrides ?? []);
  }, [rbacQuery.data]);

  const roleColumns = React.useMemo(() => [...SYSTEM_ROLE_COLUMNS, ...customRoles], [customRoles]);

  const groupedRows = React.useMemo(
    () =>
      permissions.reduce<Array<{ group: string; rows: PermissionRow[] }>>((acc, row) => {
        const current = acc[acc.length - 1];
        if (current?.group === row.group) current.rows.push(row);
        else acc.push({ group: row.group, rows: [row] });
        return acc;
      }, []),
    [permissions]
  );

  const userList = users.data?.data ?? [];
  const permissionById = React.useMemo(() => new Map(permissions.map((item) => [item.id, item])), [permissions]);

  function saveCurrentConfig(nextPermissions = permissions, nextOverrides = userOverrides, nextRoles = customRoles) {
    saveRbac.mutate({ permissions: nextPermissions, roles: nextRoles, userOverrides: nextOverrides });
  }

  function updatePermissionValue(rowId: string, roleId: string, value: PermissionValue) {
    setPermissions((rows) =>
      rows.map((row) => (row.id === rowId ? { ...row, matrix: { ...row.matrix, [roleId]: value } } : row))
    );
  }

  function addRoleProfile() {
    const label = newRole.label.trim();
    if (!label) {
      toast.error("Vui lòng nhập tên phân quyền");
      return;
    }
    const roleId = `custom-role-${Date.now()}`;
    const role: RoleColumn = {
      id: roleId,
      label,
      scope: newRole.scope.trim() || label,
      desc: newRole.desc.trim() || `Phân quyền ${label} do Quản trị khởi tạo.`,
      accent: "from-cyan-500 to-blue-600",
      custom: true,
    };
    const nextRoles = [...customRoles, role];
    const nextPermissions = permissions.map((row) => ({
      ...row,
      matrix: { ...row.matrix, [roleId]: newRole.defaultValue },
    }));
    setCustomRoles(nextRoles);
    setPermissions(nextPermissions);
    setNewRole(EMPTY_NEW_ROLE);
    setAddOpen(false);
    saveCurrentConfig(nextPermissions, userOverrides, nextRoles);
  }

  async function assignUserPermission() {
    if (!assignment.userId) {
      toast.error("Vui lòng chọn user");
      return;
    }
    if (!assignment.role && !assignment.profileId && !assignment.permissionId) {
      toast.error("Vui lòng chọn vai trò hệ thống, phân quyền hoặc quyền riêng cần gán");
      return;
    }
    try {
      if (assignment.role) {
        await updateUser.mutateAsync({ id: assignment.userId, role: assignment.role });
      }
      const nextOverrides = assignment.permissionId || assignment.profileId
        ? [
            ...userOverrides.filter(
              (item) =>
                !(
                  item.userId === assignment.userId &&
                  item.permissionId === (assignment.permissionId || "__ROLE_PROFILE__") &&
                  item.roleId === (assignment.profileId || undefined)
                )
            ),
            {
              id: `override-${Date.now()}`,
              userId: assignment.userId,
              permissionId: assignment.permissionId || "__ROLE_PROFILE__",
              roleId: assignment.profileId || undefined,
              value: assignment.value,
              note: assignment.note.trim() || undefined,
              createdAt: new Date().toISOString(),
            },
          ]
        : userOverrides;

      setUserOverrides(nextOverrides);
      setAssignOpen(false);
      setAssignment({ userId: "", role: "", profileId: "", permissionId: "", value: "read", note: "" });
      saveCurrentConfig(permissions, nextOverrides, customRoles);
      toast.success("Đã cập nhật quyền user");
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  function removeOverride(id: string) {
    const next = userOverrides.filter((item) => item.id !== id);
    setUserOverrides(next);
    saveCurrentConfig(permissions, next, customRoles);
  }

  function resetDefaultMatrix() {
    setPermissions(DEFAULT_PERMISSIONS);
    setCustomRoles([]);
    saveCurrentConfig(DEFAULT_PERMISSIONS, userOverrides, []);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Phân quyền (RBAC)"
        description="Ma trận quyền truy cập theo vai trò và nghiệp vụ quản lý"
      >
        {isAdmin && (
          <>
            <Button type="button" variant={editMode ? "default" : "outline"} onClick={() => setEditMode((value) => !value)}>
              <Settings2 className="h-4 w-4" />
              {editMode ? "Đang chỉnh" : "Chỉnh quyền"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Thêm phân quyền
            </Button>
            <Button type="button" onClick={() => setAssignOpen(true)}>
              <Users className="h-4 w-4" />
              Gán quyền user
            </Button>
          </>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {roleColumns.map((role) => (
          <Card key={role.id} className="overflow-hidden">
            <CardContent className="relative p-4">
              <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", role.accent)} />
              <div className="flex items-start justify-between gap-3">
                <div>
                  {role.systemRole ? (
                    <RoleBadge role={role.systemRole} />
                  ) : (
                    <span className="inline-flex rounded-full bg-cyan-100 px-2.5 py-1 text-xs font-bold text-cyan-800">
                      {role.label}
                    </span>
                  )}
                  <p className="mt-2 text-sm font-semibold text-ink">{role.scope}</p>
                </div>
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg", role.accent)}>
                  <Lock className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">{role.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {isAdmin && (
        <Card className="border-sky-200/80 bg-sky-50/40">
          <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="font-semibold text-ink">Công cụ quản trị phân quyền</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Quản trị viên có thể đổi cấp quyền trong ma trận, khởi tạo phân quyền mới và gán quyền cho từng user.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={resetDefaultMatrix}>
                <RotateCcw className="h-4 w-4" />
                Mặc định
              </Button>
              <Button type="button" onClick={() => saveCurrentConfig()} disabled={saveRbac.isPending}>
                <Save className="h-4 w-4" />
                Lưu ma trận
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <PositionSystemScopeCard isAdmin={isAdmin} />

      {isAdmin && userOverrides.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border">
            <CardTitle>Quyền riêng theo user</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 p-4 md:grid-cols-2">
            {userOverrides.map((override) => {
              const user = userList.find((item) => item.id === override.userId);
              const permission = permissionById.get(override.permissionId);
              const roleProfile = roleColumns.find((item) => item.id === override.roleId);
              return (
                <div key={override.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">{user?.name ?? "User không còn tồn tại"}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {roleProfile ? `Phân quyền: ${roleProfile.label}` : permission?.feature ?? "Quyền không còn tồn tại"}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <PermissionPill value={override.value} compact />
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeOverride(override.id)} title="Gỡ quyền riêng">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

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
              {PERMISSION_VALUES.map((key) => (
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
                  {roleColumns.map((role) => (
                    <th key={role.id} className="min-w-[138px] px-4 py-3 text-center text-xs font-semibold uppercase text-muted-foreground">
                      {role.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupedRows.map(({ group, rows }) =>
                  rows.map((row, index) => (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      {index === 0 && (
                        <td rowSpan={rows.length} className="border-r border-border bg-muted/25 px-4 py-4 align-top">
                          <div className="sticky top-16 font-semibold text-ink">{group}</div>
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="font-semibold text-ink">{row.feature}</div>
                        <div className="mt-0.5 max-w-xl text-xs leading-5 text-muted-foreground">{row.note}</div>
                      </td>
                      {roleColumns.map((role) => (
                        <td key={role.id} className="px-4 py-3 text-center">
                          {isAdmin && editMode ? (
                            <PermissionSelect value={row.matrix[role.id] ?? "none"} onChange={(value) => updatePermissionValue(row.id, role.id, value)} />
                          ) : (
                            <PermissionPill value={row.matrix[role.id] ?? "none"} />
                          )}
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

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Thêm phân quyền mới</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Tên phân quyền *</Label>
                <Input
                  value={newRole.label}
                  onChange={(event) => setNewRole((state) => ({ ...state, label: event.target.value }))}
                  placeholder="Ví dụ: Trưởng kíp"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Phạm vi / chức danh</Label>
                <Input
                  value={newRole.scope}
                  onChange={(event) => setNewRole((state) => ({ ...state, scope: event.target.value }))}
                  placeholder="Ví dụ: Trưởng kíp vận hành"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Mô tả</Label>
              <Textarea
                value={newRole.desc}
                onChange={(event) => setNewRole((state) => ({ ...state, desc: event.target.value }))}
                placeholder="Mô tả phạm vi phân quyền..."
              />
            </div>
            <div className="grid gap-1.5 sm:max-w-[220px]">
              <Label>Cấp quyền mặc định cho các chức năng</Label>
              <PermissionSelect
                value={newRole.defaultValue}
                onChange={(value) => setNewRole((state) => ({ ...state, defaultValue: value }))}
              />
            </div>
            <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-sm text-muted-foreground">
              Sau khi thêm, phân quyền mới sẽ xuất hiện thành một cột trong ma trận bên dưới. Bật "Chỉnh quyền" để thiết lập chi tiết từng chức năng.
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Hủy
            </Button>
            <Button type="button" onClick={addRoleProfile}>
              Thêm phân quyền
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Gán quyền cho user</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>User *</Label>
                <Select value={assignment.userId} onValueChange={(value) => setAssignment((state) => ({ ...state, userId: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn user" />
                  </SelectTrigger>
                  <SelectContent>
                    {userList.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name} - {user.employeeId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Vai trò hệ thống</Label>
                <Select value={assignment.role || "KEEP"} onValueChange={(value) => setAssignment((state) => ({ ...state, role: value === "KEEP" ? "" : (value as RoleKey) }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Giữ nguyên vai trò" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="KEEP">Giữ nguyên vai trò</SelectItem>
                    {ROLE_ORDER.map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLES[role].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Phân quyền mở rộng</Label>
              <Select value={assignment.profileId || "NONE"} onValueChange={(value) => setAssignment((state) => ({ ...state, profileId: value === "NONE" ? "" : value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn phân quyền như Trưởng kíp" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Không gán phân quyền mở rộng</SelectItem>
                  {roleColumns.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
              <div className="grid gap-1.5">
                <Label>Quyền riêng</Label>
                <Select value={assignment.permissionId || "NONE"} onValueChange={(value) => setAssignment((state) => ({ ...state, permissionId: value === "NONE" ? "" : value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn quyền cần gán" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Không gán quyền riêng</SelectItem>
                    {permissions.map((permission) => (
                      <SelectItem key={permission.id} value={permission.id}>
                        {permission.feature}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Cấp quyền</Label>
                <PermissionSelect value={assignment.value} onChange={(value) => setAssignment((state) => ({ ...state, value }))} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Ghi chú</Label>
              <Textarea
                value={assignment.note}
                onChange={(event) => setAssignment((state) => ({ ...state, note: event.target.value }))}
                placeholder="Ghi chú lý do gán quyền riêng..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAssignOpen(false)}>
              Hủy
            </Button>
            <Button type="button" onClick={assignUserPermission} disabled={saveRbac.isPending || updateUser.isPending}>
              Lưu quyền user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PermissionSelect({ value, onChange }: { value: PermissionValue; onChange: (value: PermissionValue) => void }) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as PermissionValue)}>
      <SelectTrigger className="mx-auto h-9 w-[128px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PERMISSION_VALUES.map((item) => (
          <SelectItem key={item} value={item}>
            {PERMISSION_META[item].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
