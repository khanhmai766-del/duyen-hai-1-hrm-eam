"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  CheckCircle2,
  ChevronsUpDown,
  CircleDot,
  Eye,
  KeyRound,
  Lock,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  UserCog,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RoleBadge } from "@/components/devices/status-badge";
import { PositionSystemScopeCard } from "@/components/admin/position-system-scope-card";
import { WorkflowRolesDialog } from "@/components/materials/MaterialTicketBoard";
import { useUpdateUser, useUsers } from "@/hooks/useUsers";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { ROLES, type RoleKey } from "@/lib/constants";
import { apiGet, apiMutate } from "@/lib/fetcher";
import { normalizeText } from "@/lib/nav";
import { cn } from "@/lib/utils";

type PermissionValue = "full" | "manage" | "personal" | "read" | "none";

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
  sourceRoleIds?: RoleKey[];
  custom?: boolean;
}

interface RbacConfig {
  permissions: PermissionRow[];
  roles: RoleColumn[];
  userOverrides: UserPermissionOverride[];
}

const PERMISSION_VALUES: PermissionValue[] = ["full", "manage", "personal", "read", "none"];

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
    id: "MANAGER",
    label: ROLES.MANAGER.label,
    desc: "Quản lý nghiệp vụ, duyệt và điều phối dữ liệu vận hành.",
    scope: "Quản lý vận hành",
    accent: "from-indigo-500 to-blue-600",
    systemRole: "MANAGER",
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

const MATRIX_SYSTEM_ROLE_COLUMNS: RoleColumn[] = [
  SYSTEM_ROLE_COLUMNS[0],
  SYSTEM_ROLE_COLUMNS[1],
  {
    id: "SUPERVISOR_TECHNICIAN",
    label: "Trưởng ca / Kỹ thuật viên",
    desc: "Nhóm quyền dùng chung cho Trưởng ca và Kỹ thuật viên.",
    scope: "Điều hành / kỹ thuật",
    accent: "from-blue-500 to-orange-500",
    sourceRoleIds: ["SUPERVISOR", "TECHNICIAN"],
  },
  SYSTEM_ROLE_COLUMNS[4],
];

const PERMISSION_RANK: Record<PermissionValue, number> = {
  none: 0,
  read: 1,
  personal: 2,
  manage: 3,
  full: 4,
};

function strongestPermission(values: Array<PermissionValue | undefined>): PermissionValue {
  return values.reduce<PermissionValue>(
    (best, value) => (value && PERMISSION_RANK[value] > PERMISSION_RANK[best] ? value : best),
    "none"
  );
}

function roleMatrixIds(role: RoleColumn) {
  return role.sourceRoleIds ?? [role.id];
}

function roleMatrixValue(matrix: Record<string, PermissionValue>, role: RoleColumn): PermissionValue {
  return strongestPermission(roleMatrixIds(role).map((roleId) => matrix[roleId] ?? "none"));
}

function managerDefaultValue(row: PermissionRow): PermissionValue {
  if (
    [
      "user-admin",
      "user-manage",
      "rbac-manage",
      "system_audit_log:view",
      "broadcast-manage",
      "device-delete",
      "device-code",
      "archive-create-delete",
      "archive-backup",
      "forum-moderate",
      "defect-two-way-sync",
      "defect-delete",
      "defect-history-delete",
    ].includes(row.id)
  ) {
    return "none";
  }
  if (row.id === "announcement-manage") {
    return "full";
  }
  if (row.id === "material-manage") {
    return "full";
  }
  if (["device-manage", "document-procedure", "document-pid"].includes(row.id)) {
    return "read";
  }
  return strongestPermission([row.matrix.SUPERVISOR, row.matrix.TECHNICIAN]);
}

function normalizeMergedRoleMatrix(rows: PermissionRow[]) {
  return rows.map((row) => {
    const mergedValue = strongestPermission([row.matrix.SUPERVISOR, row.matrix.TECHNICIAN]);
    return {
      ...row,
      matrix: {
        ...row.matrix,
        MANAGER: row.matrix.MANAGER ?? managerDefaultValue(row),
        SUPERVISOR: mergedValue,
        TECHNICIAN: mergedValue,
      },
    };
  });
}

const DEFAULT_PERMISSIONS: PermissionRow[] = [
  {
    id: "shift-operation-check-in",
    group: "Nhân sự / Ca vận hành",
    feature: "Điểm danh ca vận hành theo sơ đồ tổ chức",
    note: "Tự chọn cương vị trực, xem phân công theo ca và ghi nhận có mặt trên sơ đồ ca.",
    matrix: { ADMIN: "personal", MANAGER: "personal", SUPERVISOR: "personal", TECHNICIAN: "personal", VIEWER: "read" },
  },
  {
    id: "shift-operation-approve",
    group: "Nhân sự / Ca vận hành",
    feature: "Duyệt điểm danh ca vận hành",
    note: "Xác nhận người trực theo từng cương vị, duyệt hoặc thu hồi điểm danh trong ca vận hành.",
    matrix: { ADMIN: "manage", MANAGER: "manage", SUPERVISOR: "manage", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    id: "hc-attendance-group-create",
    group: "Nhân sự / Hành chính",
    feature: "Tạo nhóm hành chính",
    note: "Tạo nhóm hành chính theo ngày, buổi, số giờ và nội dung công việc; cấp Quản lý/Toàn quyền được sửa hoặc xoá nhóm.",
    matrix: { ADMIN: "personal", MANAGER: "personal", SUPERVISOR: "personal", TECHNICIAN: "personal", VIEWER: "none" },
  },
  {
    id: "hc-attendance-check-in",
    group: "Nhân sự / Hành chính",
    feature: "Đăng ký và chấm công hành chính",
    note: "Đăng ký nhân sự và ghi nhận chấm công hành chính trong ngày; không bao gồm quyền tạo nhóm hành chính.",
    matrix: { ADMIN: "personal", MANAGER: "personal", SUPERVISOR: "personal", TECHNICIAN: "personal", VIEWER: "read" },
  },
  {
    id: "hc-attendance-approve",
    group: "Nhân sự / Hành chính",
    feature: "Duyệt chấm công hành chính",
    note: "Duyệt danh sách hành chính, xác nhận giờ công và phê duyệt đăng ký đi hành chính.",
    matrix: { ADMIN: "manage", MANAGER: "manage", SUPERVISOR: "manage", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    id: "timesheet-edit",
    group: "Nhân sự / Hành chính",
    feature: "Chỉnh bảng công",
    note: "Điều chỉnh thủ công các ô bảng công khi cần, độc lập với quyền duyệt chấm công hành chính.",
    matrix: { ADMIN: "manage", MANAGER: "manage", SUPERVISOR: "manage", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    id: "user-manage",
    group: "Quản trị người dùng",
    feature: "Quản lý tài khoản người dùng",
    note: "Tạo tài khoản, cập nhật hồ sơ, đổi vai trò hệ thống, khóa/mở hoặc vô hiệu hóa nhân sự.",
    matrix: { ADMIN: "full", MANAGER: "none", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    id: "user-reset-viewer-password",
    group: "Quản trị người dùng",
    feature: "Reset mật khẩu Người xem",
    note: "Đặt lại mật khẩu mặc định cho tài khoản vai trò Người xem; không áp dụng cho Quản trị, Quản lý, Trưởng ca hoặc Kỹ thuật viên.",
    matrix: { ADMIN: "manage", MANAGER: "none", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    id: "rbac-manage",
    group: "Quản trị người dùng",
    feature: "Quản lý ma trận phân quyền",
    note: "Chỉnh cấp quyền theo vai trò, tạo phân quyền mở rộng và gán quyền riêng cho từng user.",
    matrix: { ADMIN: "full", MANAGER: "none", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    id: "system_audit_log:view",
    group: "Quản trị hệ thống",
    feature: "Xem Audit hệ thống",
    note: "Tra cứu các thay đổi quan trọng về phân quyền, người dùng và cấu hình hệ thống.",
    matrix: { ADMIN: "read", MANAGER: "none", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    id: "broadcast-manage",
    group: "Quản trị hệ thống",
    feature: "Quản lý thông báo hệ thống",
    note: "Tạo, bật/tắt, cập nhật hoặc xoá thông báo dạng hộp thoại gửi tới toàn bộ người dùng.",
    matrix: { ADMIN: "full", MANAGER: "none", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    id: "device-view",
    group: "Thiết bị",
    feature: "Xem thông tin thiết bị",
    note: "Hiển thị menu Thông tin thiết bị; cho phép xem, tìm kiếm, lọc, mở cây và lý lịch thiết bị trong phạm vi cương vị/hệ thống được giao.",
    matrix: { ADMIN: "full", MANAGER: "read", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" },
  },
  {
    id: "device-manage",
    group: "Thiết bị",
    feature: "Quản lý danh mục và cây thiết bị",
    note: "Cá nhân được thêm thiết bị và tạo QR; Quản lý/Toàn quyền được thêm, sửa, nhập danh mục, cập nhật ảnh/tài liệu, tạo hồ sơ S2 và tạo/gỡ QR trong phạm vi được giao.",
    matrix: { ADMIN: "full", MANAGER: "none", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    id: "device-delete",
    group: "Thiết bị",
    feature: "Xoá thiết bị",
    note: "Chỉ cấp Toàn quyền; chỉ xóa thiết bị lá trong phạm vi cương vị/hệ thống được giao. Dữ liệu quan hệ có cấu hình cascade có thể bị xóa theo.",
    matrix: { ADMIN: "full", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    id: "repair-edit",
    group: "Lịch sử sửa chữa & Khiếm khuyết",
    feature: "Tạo và cập nhật bản ghi sửa chữa / phiếu khiếm khuyết",
    note: "Thêm, cập nhật bản ghi trong Lịch sử sửa chữa hoặc phiếu khiếm khuyết của thiết bị. Mức Cá nhân chỉ cập nhật hồ sơ do mình tạo; mức Quản lý cập nhật mọi hồ sơ.",
    matrix: { ADMIN: "manage", SUPERVISOR: "manage", TECHNICIAN: "personal", VIEWER: "none" },
  },
  {
    id: "repair-delete",
    group: "Lịch sử sửa chữa & Khiếm khuyết",
    feature: "Xoá bản ghi lịch sử sửa chữa",
    note: "Quản trị xoá mọi bản ghi; người tạo được xoá bản ghi của mình.",
    matrix: { ADMIN: "full", SUPERVISOR: "personal", TECHNICIAN: "personal", VIEWER: "none" },
  },
  {
    id: "repair-approve",
    group: "Lịch sử sửa chữa & Khiếm khuyết",
    feature: "Xác nhận kết quả sửa chữa",
    note: "Ghi người xác nhận và trạng thái cuối cho bản ghi Lịch sử sửa chữa sau khi công việc hoàn thành.",
    matrix: { ADMIN: "manage", SUPERVISOR: "manage", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    id: "defect-view",
    group: "Lịch sử sửa chữa & Khiếm khuyết",
    feature: "Phạm vi xem phiếu khiếm khuyết",
    note:
      "Mức Đọc/Cá nhân CHỈ thấy phiếu thuộc cương vị ĐANG LÀM VIỆC — người kiêm nhiệm muốn xem " +
      "phần việc kia phải tự chuyển cương vị ở trang Tài khoản, " +
      "kèm cương vị cấp dưới theo sơ đồ ca trực: Trưởng ca thấy tất cả, Trưởng kíp thấy nhánh mình, " +
      "Lò trưởng/Máy trưởng thấy cả khối mình quản lý. Mức Quản lý/Toàn quyền thấy toàn phân xưởng. " +
      "Quyền này TÁCH RIÊNG khỏi quyền sửa — hạ phạm vi xem không làm mất quyền ghi phiếu của ai.",
    matrix: { ADMIN: "full", MANAGER: "full", SUPERVISOR: "manage", TECHNICIAN: "read", VIEWER: "read" },
  },
  {
    id: "defect-close",
    group: "Lịch sử sửa chữa & Khiếm khuyết",
    feature: "Hoàn thành / đóng phiếu khiếm khuyết",
    note: "Xác nhận kết quả xử lý và đưa phiếu vào lịch sử; không bao gồm quyền xoá.",
    matrix: { ADMIN: "full", SUPERVISOR: "manage", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    id: "defect-delete",
    group: "Lịch sử sửa chữa & Khiếm khuyết",
    feature: "Xoá phiếu khiếm khuyết",
    note: "Quyền độc lập, mặc định chỉ Quản trị viên. Không cho xoá phiếu phản chiếu trực tiếp từ Google Sheet.",
    matrix: { ADMIN: "full", MANAGER: "none", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    id: "defect-history-delete",
    group: "Lịch sử sửa chữa & Khiếm khuyết",
    feature: "Xoá lịch sử khiếm khuyết",
    note: "Quyền độc lập để xoá hồ sơ đã đưa vào lịch sử; mặc định chỉ Quản trị viên.",
    matrix: { ADMIN: "full", MANAGER: "none", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    id: "defect-two-way-sync",
    group: "Khiếm khuyết",
    feature: "Bật/tắt đồng bộ hai chiều khiếm khuyết (n8n)",
    note: "Cờ dự phòng cho giai đoạn phát triển sau, mặc định tắt. Hiện tại đồng bộ chỉ một chiều Google Sheet → DH1; chưa có tác vụ ghi ngược nào phụ thuộc vào cờ này.",
    matrix: { ADMIN: "full", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    id: "material-manage",
    group: "Vật tư",
    feature: "Danh mục Vận Hành 1",
    note: "Cho phép hiện mục Danh mục Vận Hành 1 trên menu. Quyền Xem chỉ tra cứu theo phạm vi cương vị; quyền Quản lý/Toàn quyền được xem và thao tác toàn bộ danh mục.",
    matrix: { ADMIN: "full", MANAGER: "full", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" },
  },
  {
    id: "replacement-manage",
    group: "Vật tư",
    feature: "Lịch thay thế vật tư",
    note: "Cho phép hiện mục Lịch thay thế vật tư trên menu. Quyền Xem chỉ tra cứu theo phạm vi cương vị; quyền Quản lý/Toàn quyền được xem toàn bộ, nhập lịch, sửa, xoá và ghi nhận thay thế.",
    matrix: { ADMIN: "full", SUPERVISOR: "manage", TECHNICIAN: "read", VIEWER: "read" },
  },
  {
    id: "material-view",
    group: "Vật tư",
    feature: "Phạm vi xem Danh mục Vận Hành 1",
    note:
      "Mức Đọc/Cá nhân CHỈ thấy vật tư có điểm thay thế thuộc cương vị ĐANG LÀM VIỆC (kèm cương vị " +
      "cấp dưới theo sơ đồ ca trực); vật tư chưa khai điểm nào vẫn hiện để còn khai tiếp. " +
      "Mức Quản lý/Toàn quyền thấy toàn bộ danh mục. Tách riêng khỏi quyền sửa danh mục.",
    matrix: { ADMIN: "full", MANAGER: "full", SUPERVISOR: "manage", TECHNICIAN: "read", VIEWER: "read" },
  },
  {
    id: "replacement-view",
    group: "Vật tư",
    feature: "Phạm vi xem Lịch thay thế vật tư",
    note:
      "Áp cho CẢ BA tab (Lịch thay thế, Tình trạng, Lịch sử thay thế) và cả chuông cảnh báo đến hạn. " +
      "Mức Đọc/Cá nhân CHỈ thấy điểm thuộc cương vị ĐANG LÀM VIỆC (kèm cương vị cấp dưới); " +
      "mức Quản lý/Toàn quyền thấy toàn phân xưởng. Tách riêng khỏi quyền ghi nhận thay thế.",
    matrix: { ADMIN: "full", MANAGER: "full", SUPERVISOR: "manage", TECHNICIAN: "read", VIEWER: "read" },
  },
  {
    id: "announcement-manage",
    group: "Thông tin vận hành",
    feature: "Mệnh lệnh sản xuất / thông báo",
    note: "Đăng, sửa, xoá thông báo và tài liệu đính kèm.",
    matrix: { ADMIN: "full", MANAGER: "full", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" },
  },
  {
    id: "operation-events",
    group: "Thông tin vận hành",
    feature: "Lịch diễn tập và thông tin nội bộ",
    note: "Cập nhật lịch diễn tập sự cố, PCCC và ghi chú vận hành trong 1 tháng gần nhất.",
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
    note: "Quyền tra cứu chung cho khu vực lưu trữ; từng tab dữ liệu có quyền riêng bên dưới.",
    matrix: { ADMIN: "read", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" },
  },
  {
    id: "archive-grid-separation",
    group: "Tài liệu số",
    feature: "Lưu trữ - dữ liệu tách lưới",
    note: "Phân quyền riêng cho tab Dữ liệu tách lưới: xem, thêm, sửa, xoá và backup theo cấp quyền.",
    matrix: { ADMIN: "full", SUPERVISOR: "manage", TECHNICIAN: "manage", VIEWER: "read" },
  },
  {
    id: "archive-startup-data",
    group: "Tài liệu số",
    feature: "Lưu trữ - dữ liệu khởi động",
    note: "Phân quyền riêng cho tab Dữ liệu khởi động: xem, thêm, sửa, xoá và backup theo cấp quyền.",
    matrix: { ADMIN: "full", SUPERVISOR: "manage", TECHNICIAN: "manage", VIEWER: "read" },
  },
  {
    id: "archive-boiler-calibration",
    group: "Tài liệu số",
    feature: "Lưu trữ - dữ liệu hiệu chỉnh lò",
    note: "Phân quyền riêng cho tab Dữ liệu hiệu chỉnh lò: xem, thêm, sửa, xoá và backup theo cấp quyền.",
    matrix: { ADMIN: "full", SUPERVISOR: "manage", TECHNICIAN: "manage", VIEWER: "read" },
  },
  {
    id: "archive-oil-gun-data",
    group: "Tài liệu số",
    feature: "Lưu trữ - dữ liệu vòi dầu",
    note: "Phân quyền riêng cho tab Dữ liệu vòi dầu, bao gồm cập nhật trạng thái/khiếm khuyết vòi dầu.",
    matrix: { ADMIN: "full", SUPERVISOR: "manage", TECHNICIAN: "manage", VIEWER: "read" },
  },
  {
    id: "archive-create-delete",
    group: "Tài liệu số",
    feature: "Thư mục lưu trữ - thêm mới và xoá hồ sơ",
    note: "Quyền Cá nhân được thêm hồ sơ; quyền Quản lý/Toàn quyền được thêm, sửa và xoá hồ sơ khỏi danh mục.",
    matrix: { ADMIN: "full", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    id: "archive-edit",
    group: "Tài liệu số",
    feature: "Thư mục lưu trữ - chỉnh sửa hồ sơ",
    note: "Quản trị, Quản lý, Trưởng ca và Kỹ thuật viên được chỉnh sửa dữ liệu đã ghi nhận; Người xem chỉ tra cứu.",
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
    matrix: { ADMIN: "personal", SUPERVISOR: "personal", TECHNICIAN: "personal", VIEWER: "personal" },
  },
  {
    id: "forum-moderate",
    group: "Tài liệu số",
    feature: "Forum kỹ thuật - gỡ nội dung không phù hợp",
    note: "Quyền Quản lý/Toàn quyền được ghim, sửa hoặc xoá chủ đề và phản hồi nếu nội dung không phù hợp.",
    matrix: { ADMIN: "full", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  },
  {
    id: "pccc-view",
    group: "Thiết bị PCCC",
    feature: "Xem sổ thiết bị PCCC",
    note:
      "Xem tổng quan, bình chữa cháy, tủ chữa cháy, Foam/CO2/Diesel/FM200 và tải file Excel của kỳ. " +
      "PHẠM VI XEM đi theo CHỨC DANH ĐANG LÀM VIỆC, không theo mức quyền ở cột bên: " +
      "cương vị thường chỉ thấy thiết bị mình quản lý; cấp giám sát (TK Lò máy, Trưởng kíp điện) " +
      "thấy thêm mọi bình chữa cháy mình giám sát ở cột Người giám sát — Tủ chữa cháy và " +
      "Foam/CO2/FM200 không có cột này nên chỉ thấy phần mình quản lý. " +
      "Người kiêm nhiệm chỉ áp MỘT chức danh đang chọn; đổi ở trang Tài khoản. " +
      "Chưa khai chức danh thì KHÔNG thấy gì. " +
      "Xem toàn phân xưởng chỉ dành cho: Quản trị viên và các chức danh Quản đốc / Phó quản đốc / " +
      "Kỹ thuật viên / Trưởng ca. Mức Quản lý/Toàn quyền ở đây là cửa phụ cho tài khoản chỉ-đọc " +
      "cần xem toàn cảnh (lãnh đạo, tài khoản báo cáo).",
    matrix: { ADMIN: "full", MANAGER: "read", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" },
  },
  {
    id: "pccc-manage",
    group: "Thiết bị PCCC",
    feature: "Cập nhật và ký xác nhận thiết bị PCCC",
    note:
      "Quyền này quyết định CÓ ĐƯỢC GHI hay không, KHÔNG quyết định phạm vi: từ mức Cá nhân trở lên " +
      "đều chỉ sửa/ký được thiết bị thuộc đúng CHỨC DANH ĐANG LÀM VIỆC của mình. " +
      "Cấp giám sát chỉ XEM phần mình giám sát, muốn sửa thì thiết bị phải nằm ở cột Cương vị quản lý của mình. " +
      "Sửa được toàn phân xưởng chỉ dành cho: Quản trị viên và các chức danh Quản đốc / Phó quản đốc / " +
      "Kỹ thuật viên / Trưởng ca. Chưa khai chức danh thì không sửa được gì. " +
      "Ký cần có chữ ký số trong hồ sơ Tài khoản và sẽ tự điền người + ngày kiểm tra. " +
      "Riêng ô phân công (cương vị, cấp giám sát, tổ máy, ĐVT) và dấu kiểm tra (ngày/người kiểm tra, ngày/người chốt) chỉ Quản trị viên sửa được.",
    matrix: { ADMIN: "full", MANAGER: "manage", SUPERVISOR: "manage", TECHNICIAN: "personal", VIEWER: "none" },
  },
  {
    id: "pccc-close-period",
    group: "Thiết bị PCCC",
    feature: "Chuyển kỳ kiểm tra PCCC",
    note: "Chạy tay việc chốt kỳ (xuất Excel lưu trữ lên S3), sinh kỳ tháng mới và dọn kỳ cũ khỏi cơ sở dữ liệu. Bình thường hệ thống tự chạy cuối tháng; quyền này chỉ dùng khi cần can thiệp.",
    matrix: { ADMIN: "full", MANAGER: "manage", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  },
];

function mergeDefaultPermissions(rows: PermissionRow[]) {
  if (!rows.length) return DEFAULT_PERMISSIONS;

  const existingById = new Map(rows.map((row) => [row.id, row]));
  const legacyMatrixByNewId: Record<string, Record<string, PermissionValue> | undefined> = {
    "shift-operation-check-in": existingById.get("shift-check-in")?.matrix,
    "shift-operation-approve": existingById.get("shift-approve")?.matrix,
    "hc-attendance-group-create": existingById.get("hc-attendance-check-in")?.matrix ?? existingById.get("shift-check-in")?.matrix,
    "hc-attendance-check-in": existingById.get("shift-check-in")?.matrix,
    "hc-attendance-approve": existingById.get("shift-approve")?.matrix,
    "timesheet-edit": existingById.get("hc-attendance-approve")?.matrix ?? existingById.get("shift-approve")?.matrix,
    "user-manage": existingById.get("user-admin")?.matrix,
    "rbac-manage": existingById.get("user-admin")?.matrix,
  };
  const defaultIds = new Set(DEFAULT_PERMISSIONS.map((row) => row.id));
  // Quyền đã bỏ hẳn. Phải liệt kê ở đây, nếu không cấu hình cũ đã lưu trong DB sẽ
  // được coi là "quyền tự thêm" và dòng bị xoá lại hiện ra trong ma trận.
  const legacyIds = new Set([
    "archive-major-repair",
    "archive-soot-blower-data",
    "dashboard-read",
    "overview-dashboard-read",
    "overview-reports-read",
    "overview-devices-read",
    "overview-repair-defect-read",
    "overview-materials-read",
    "shift-check-in",
    "shift-approve",
    "user-admin",
    "repair-create",
    "defect-manage",
  ]);
  const mergedDefaults = DEFAULT_PERMISSIONS.map((row) => {
    const existing = existingById.get(row.id);
    if (row.id === "device-manage" && existing) {
      const roleIds = new Set([...Object.keys(row.matrix), ...Object.keys(existing.matrix)]);
      const matrix = Object.fromEntries(
        Array.from(roleIds).map((roleId) => [
          roleId,
          existing.matrix[roleId] === "read" ? row.matrix[roleId] ?? "none" : existing.matrix[roleId] ?? row.matrix[roleId] ?? "none",
        ])
      );
      return { ...row, matrix };
    }
    if (row.id === "repair-edit") {
      const legacyCreate = existingById.get("repair-create");
      const legacyDefect = existingById.get("defect-manage");
      if (existing || legacyCreate || legacyDefect) {
        const roleIds = new Set([
          ...Object.keys(row.matrix),
          ...Object.keys(existing?.matrix ?? {}),
          ...Object.keys(legacyCreate?.matrix ?? {}),
          ...Object.keys(legacyDefect?.matrix ?? {}),
        ]);
        const matrix = Object.fromEntries(
          Array.from(roleIds).map((roleId) => [
            roleId,
            strongestPermission([
              row.matrix[roleId],
              existing?.matrix[roleId],
              legacyCreate?.matrix[roleId],
              legacyDefect?.matrix[roleId],
            ]),
          ])
        );
        return { ...row, matrix };
      }
    }
    if (existing) return { ...row, matrix: { ...row.matrix, ...existing.matrix } };
    const legacyMatrix = legacyMatrixByNewId[row.id];
    if (legacyMatrix) return { ...row, matrix: { ...row.matrix, ...legacyMatrix } };
    return row;
  });
  const customRows = rows.filter((row) => !defaultIds.has(row.id) && !legacyIds.has(row.id));
  return [...mergedDefaults, ...customRows];
}

function migrateDevicePermissionOverrides(rows: UserPermissionOverride[]) {
  const explicitDeviceView = new Set(
    rows
      .filter((row) => row.permissionId === "device-view")
      .map((row) => `${row.userId}|${row.roleId ?? ""}`)
  );
  return rows
    .map((row) => {
      if (row.permissionId !== "device-manage" || row.value !== "read") return row;
      const key = `${row.userId}|${row.roleId ?? ""}`;
      if (explicitDeviceView.has(key)) return null;
      return { ...row, permissionId: "device-view" };
    })
    .filter((row): row is UserPermissionOverride => row !== null);
}

const PERMISSION_META: Record<PermissionValue, { label: string; icon: LucideIcon; className: string; title: string }> = {
  full: {
    label: "Toàn quyền",
    icon: ShieldCheck,
    className: "bg-gradient-to-b from-emerald-400 to-green-600 text-white shadow-green-500/30",
    title: "Xem, tạo, sửa, xoá, duyệt và cấu hình trong phạm vi chức năng.",
  },
  manage: {
    label: "Quản lý",
    icon: KeyRound,
    className: "bg-gradient-to-b from-blue-400 to-blue-600 text-white shadow-blue-500/30",
    title: "Xem toàn bộ website; tạo, sửa, xoá, xác nhận, phê duyệt hoặc chốt trạng thái trong phạm vi chức năng.",
  },
  personal: {
    label: "Cá nhân",
    icon: CircleDot,
    className: "bg-gradient-to-b from-sky-400 to-cyan-600 text-white shadow-cyan-500/30",
    title: "Xem và thêm dữ liệu mới; không mặc định được sửa/xoá.",
  },
  read: {
    label: "Chỉ xem",
    icon: Eye,
    className: "bg-gradient-to-b from-slate-100 to-slate-300 text-slate-700 shadow-slate-400/20",
    title: "Chỉ xem, tra cứu, lọc và mở chi tiết; không được thêm, sửa, xoá hoặc duyệt.",
  },
  none: {
    label: "Không",
    icon: XCircle,
    className: "bg-gradient-to-b from-rose-50 to-slate-200 text-slate-500 shadow-slate-400/10",
    title: "Không được truy cập hoặc không được thao tác chức năng này.",
  },
};

const PERMISSION_HELP: Array<{ value: PermissionValue; description: string }> = [
  { value: "full", description: "Xem, tạo, sửa, xoá, duyệt và cấu hình trong phạm vi chức năng." },
  { value: "manage", description: "Xem toàn bộ website; tạo, sửa, xoá, xác nhận, phê duyệt hoặc chốt trạng thái trong phạm vi chức năng." },
  { value: "personal", description: "Xem và thêm dữ liệu mới; không mặc định được sửa/xoá." },
  { value: "read", description: "Chỉ xem, tra cứu, lọc và mở chi tiết; không thêm, sửa, xoá hoặc duyệt." },
  { value: "none", description: "Không được truy cập hoặc không được thao tác chức năng này." },
];

const EMPTY_NEW_ROLE = {
  label: "",
  scope: "",
  desc: "",
  defaultValue: "read" as PermissionValue,
};

export default function RolesPage() {
  const queryClient = useQueryClient();
  const rbac = useRbacAccess();
  const isAdmin = rbac.can("rbac-manage", ["full"]);
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
      queryClient.invalidateQueries({ queryKey: ["rbac-me"] });
      toast.success("Đã lưu cấu hình phân quyền");
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const [permissions, setPermissions] = React.useState<PermissionRow[]>(() => normalizeMergedRoleMatrix(DEFAULT_PERMISSIONS));
  const [customRoles, setCustomRoles] = React.useState<RoleColumn[]>([]);
  const [userOverrides, setUserOverrides] = React.useState<UserPermissionOverride[]>([]);
  const [editMode, setEditMode] = React.useState(false);
  const [workflowRolesOpen, setWorkflowRolesOpen] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [assignUserOpen, setAssignUserOpen] = React.useState(false);
  const [assignUserSearch, setAssignUserSearch] = React.useState("");
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
    setPermissions(normalizeMergedRoleMatrix(mergeDefaultPermissions(config.permissions ?? [])));
    setCustomRoles(config.roles ?? []);
    setUserOverrides(migrateDevicePermissionOverrides(config.userOverrides ?? []));
  }, [rbacQuery.data]);

  const roleColumns = React.useMemo(() => [...SYSTEM_ROLE_COLUMNS, ...customRoles], [customRoles]);
  const matrixRoleColumns = React.useMemo(() => [...MATRIX_SYSTEM_ROLE_COLUMNS, ...customRoles], [customRoles]);

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
  const selectedAssignmentUser = React.useMemo(
    () => userList.find((user) => user.id === assignment.userId),
    [assignment.userId, userList]
  );
  const filteredAssignmentUsers = React.useMemo(() => {
    const query = normalizeText(assignUserSearch.trim());
    const sorted = [...userList].sort((a, b) => String(a.employeeId ?? "").localeCompare(String(b.employeeId ?? ""), "vi"));
    if (!query) return sorted;
    return sorted.filter((user) =>
      normalizeText(
        [
          user.name,
          user.employeeId,
          user.email,
          user.workEmail,
          user.username,
          user.position,
          user.secondaryPosition,
          user.department,
          ROLES[user.role as RoleKey]?.label,
        ]
          .filter(Boolean)
          .join(" ")
      ).includes(query)
    );
  }, [assignUserSearch, userList]);

  function saveCurrentConfig(nextPermissions = permissions, nextOverrides = userOverrides, nextRoles = customRoles) {
    saveRbac.mutate({ permissions: normalizeMergedRoleMatrix(nextPermissions), roles: nextRoles, userOverrides: nextOverrides });
  }

  function updatePermissionValue(rowId: string, role: RoleColumn, value: PermissionValue) {
    const roleIds = roleMatrixIds(role);
    setPermissions((rows) =>
      rows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              matrix: {
                ...row.matrix,
                ...Object.fromEntries(roleIds.map((roleId) => [roleId, value])),
              },
            }
          : row
      )
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
      setAssignUserOpen(false);
      setAssignUserSearch("");
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
    const nextPermissions = normalizeMergedRoleMatrix(DEFAULT_PERMISSIONS);
    setPermissions(nextPermissions);
    setCustomRoles([]);
    saveCurrentConfig(nextPermissions, userOverrides, []);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Phân quyền (RBAC)"
        description="Ma trận quyền truy cập theo vai trò và nghiệp vụ quản lý"
      >
        {isAdmin && (
          <>
            <Button type="button" size="toolbar" variant="soft" onClick={() => setWorkflowRolesOpen(true)}>
              <UserCog className="h-4 w-4" />
              Phân quyền quy trình
            </Button>
            <Button type="button" size="toolbar" variant={editMode ? "default" : "soft"} onClick={() => setEditMode((value) => !value)}>
              <Settings2 className="h-4 w-4" />
              {editMode ? "Đang chỉnh" : "Chỉnh quyền"}
            </Button>
            <Button type="button" size="toolbar" variant="soft" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Thêm phân quyền
            </Button>
            <Button type="button" size="toolbar" onClick={() => setAssignOpen(true)}>
              <Users className="h-4 w-4" />
              Gán quyền user
            </Button>
          </>
        )}
      </PageHeader>

      <div className="-mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        <div className="grid min-w-[980px] grid-cols-5 gap-2.5 xl:min-w-0">
          {matrixRoleColumns.map((role) => (
            <Card key={role.id} className="min-w-0 overflow-hidden">
              <CardContent className="relative min-h-[132px] p-3">
                <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", role.accent)} />
                <div className="flex items-start justify-between gap-2.5">
                  <div className="min-w-0">
                    {role.systemRole ? (
                      <RoleBadge role={role.systemRole} className="whitespace-nowrap px-2 text-[11px] font-bold leading-5" />
                    ) : (
                      <span className="inline-flex max-w-full whitespace-nowrap rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold leading-5 text-blue-800">
                        {role.label}
                      </span>
                    )}
                    <p className="mt-2 line-clamp-1 text-[13px] font-bold leading-5 text-ink">{role.scope}</p>
                  </div>
                  <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md", role.accent)}>
                    <Lock className="h-4 w-4" />
                  </div>
                </div>
                <p className="mt-2 line-clamp-2 text-[12.5px] leading-5 text-muted-foreground">{role.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
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
          <div className="grid gap-3 rounded-xl border border-border bg-slate-50/80 p-3 md:grid-cols-2 2xl:grid-cols-3">
            {PERMISSION_HELP.map((item) => (
              <div
                key={item.value}
                className="grid min-h-[54px] grid-cols-[112px_minmax(0,1fr)] items-start gap-3 rounded-lg bg-white/75 px-3 py-2 ring-1 ring-border/70"
              >
                <PermissionPill value={item.value} compact />
                <p className="min-w-0 text-[12px] leading-5 text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="w-[170px] px-4 py-3.5 text-left text-xs font-semibold uppercase text-muted-foreground">
                    Nhóm
                  </th>
                  <th className="min-w-[360px] px-4 py-3.5 text-left text-xs font-semibold uppercase text-muted-foreground">
                    Chức năng
                  </th>
                  {matrixRoleColumns.map((role) => (
                    <th key={role.id} className="min-w-[148px] px-4 py-3.5 text-center text-xs font-semibold uppercase leading-4 text-muted-foreground">
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
                        <td rowSpan={rows.length} className="border-r border-border bg-muted/25 px-4 py-5 align-top">
                          <div className="sticky top-16 text-sm font-semibold leading-5 text-ink">{group}</div>
                        </td>
                      )}
                      <td className="px-4 py-4">
                        <div className="text-[14px] font-semibold leading-5 text-ink">{row.feature}</div>
                        <div className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{row.note}</div>
                      </td>
                      {matrixRoleColumns.map((role) => (
                        <td key={role.id} className="px-4 py-4 text-center align-middle">
                          {isAdmin && editMode ? (
                            <PermissionSelect value={roleMatrixValue(row.matrix, role)} onChange={(value) => updatePermissionValue(row.id, role, value)} />
                          ) : (
                            <PermissionPill value={roleMatrixValue(row.matrix, role)} />
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
        Quyền Quản lý bao gồm xem, tạo, sửa, xoá, xác nhận, phê duyệt và chốt trạng thái trong phạm vi từng chức năng. Các cấu hình hệ thống nhạy cảm vẫn yêu cầu Toàn quyền.
      </div>

      {workflowRolesOpen && <WorkflowRolesDialog onClose={() => setWorkflowRolesOpen(false)} />}

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
              Sau khi thêm, phân quyền mới sẽ xuất hiện thành một cột trong ma trận bên dưới. Bật &quot;Chỉnh quyền&quot; để thiết lập chi tiết từng chức năng.
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
                <Popover
                  open={assignUserOpen}
                  onOpenChange={(open) => {
                    setAssignUserOpen(open);
                    if (open) setAssignUserSearch("");
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "h-auto min-h-10 w-full justify-between gap-3 px-3 py-2 text-left font-normal",
                        !selectedAssignmentUser && "text-muted-foreground"
                      )}
                    >
                      {selectedAssignmentUser ? (
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-ink">
                            {selectedAssignmentUser.name} - {selectedAssignmentUser.employeeId}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {ROLES[selectedAssignmentUser.role as RoleKey]?.label ?? selectedAssignmentUser.role}
                            {selectedAssignmentUser.position ? ` · ${selectedAssignmentUser.position}` : ""}
                          </span>
                        </span>
                      ) : (
                        <span>Chọn hoặc tìm user</span>
                      )}
                      <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[min(560px,calc(100vw-3rem))] p-0">
                    <div className="border-b border-border p-2">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          autoFocus
                          value={assignUserSearch}
                          onChange={(event) => setAssignUserSearch(event.target.value)}
                          placeholder="Tìm theo tên, mã NV, email, chức vụ..."
                          className="h-10 pl-9"
                        />
                      </div>
                    </div>
                    <div className="max-h-80 overflow-y-auto p-1">
                      {filteredAssignmentUsers.length === 0 ? (
                        <div className="px-3 py-8 text-center text-sm text-muted-foreground">Không tìm thấy user phù hợp.</div>
                      ) : (
                        filteredAssignmentUsers.map((user) => {
                          const selected = assignment.userId === user.id;
                          return (
                            <button
                              key={user.id}
                              type="button"
                              className={cn(
                                "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition hover:bg-muted",
                                selected && "bg-sky-50 text-sky-900"
                              )}
                              onClick={() => {
                                setAssignment((state) => ({ ...state, userId: user.id }));
                                setAssignUserOpen(false);
                                setAssignUserSearch("");
                              }}
                            >
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-ink">
                                {String(user.name ?? "?").trim().slice(0, 1).toUpperCase()}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold text-ink">
                                  {user.name} - {user.employeeId}
                                </span>
                                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                  {ROLES[user.role as RoleKey]?.label ?? user.role}
                                  {user.position ? ` · ${user.position}` : ""}
                                  {user.email ? ` · ${user.email}` : ""}
                                </span>
                              </span>
                              {selected && <Check className="h-4 w-4 shrink-0 text-sky-700" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
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
      <SelectTrigger className="mx-auto h-9 w-[132px]">
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
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-semibold leading-none ring-1 ring-white/50 whitespace-nowrap",
        compact ? "h-7 min-w-[104px] px-3 text-[11px]" : "h-9 min-w-[112px] px-3 text-xs shadow-md",
        meta.className
      )}
    >
      {value === "full" ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <Icon className="h-3.5 w-3.5 shrink-0" />
      )}
      {meta.label}
    </span>
  );
}
