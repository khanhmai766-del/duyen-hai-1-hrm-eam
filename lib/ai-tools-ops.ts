import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeText } from "@/lib/nav";
import { hasPermissionLevel } from "@/lib/rbac-guard";
import { compactAiFacts as facts } from "@/lib/ai-tool-budget";
import { dateRange, limitOf, machine, text, type AiToolUser } from "@/lib/ai-tools";
import { formatPermitNumber, PERMIT_KINDS, PERMIT_STATUSES, PERMIT_UNITS, PERMIT_WORK_TYPES } from "@/lib/work-permits";
import { permitSearchTerm } from "@/lib/server/work-permits";
import {
  PCCC_PERMISSION,
  pcccBulkViewScope,
  pcccCabinetViewScope,
  resolvePcccViewScope,
  resolvePeriod as resolvePcccPeriod,
  scopeWhere as pcccScopeWhere,
} from "@/lib/pccc-service";
import { periodEndDate } from "@/lib/pccc-summary";
import {
  TBYCNN_PERMISSION,
  TBYCNN_READ_LEVELS,
  resolvePeriod as resolveTbycnnPeriod,
  resolveTbycnnViewScope,
  scopeWhere as tbycnnScopeWhere,
} from "@/lib/tbycnn-service";
import { TBYCNN_KD_SOON_DAYS } from "@/lib/tbycnn";
import { GROUNDING_PERMISSIONS, groundingScopeWithPermissions } from "@/lib/grounding-lightning";
import { GROUNDING_STATUS_LABEL, GROUNDING_TYPE_LABEL, type GroundingStatus, type GroundingType } from "@/lib/grounding-lightning-shared";
import { isGasCylinderCategory } from "@/lib/constants";
import { lotsByCodes } from "@/lib/material-stock-lot";
import { materialTicketReference } from "@/lib/material-ticket-sequence";
import { getCachedMaterialAnnualPlanSummary } from "@/lib/material-annual-plan-cache";
import { getMaterialMonthlyReport, parsePeriodKey as parseMonthlyPeriodKey } from "@/lib/material-monthly-report";
import { getMonthlyGrid, toDisplayUnit } from "@/lib/chemical-inventory/queries";
import { CHEMICAL_PERMISSION_ID, ITEM_TYPE_LABELS, UNIT_LABELS, WARNING_LABELS } from "@/lib/chemical-inventory/constants";
import { archiveCategoryPermissionId } from "@/lib/archive-permissions";
import { assertOilSootAccess } from "@/lib/server-access";

/**
 * CÔNG CỤ AI CHO PHÂN HỆ QUẢN LÝ THIẾT BỊ & QUẢN LÝ VẬT TƯ (ngoài 7 công cụ ở lib/ai-tools.ts).
 *
 * Nguyên tắc chung:
 *   - Phạm vi dữ liệu BẰNG ĐÚNG trang web: mỗi công cụ gọi lại chính hàm quyền/phạm vi mà route
 *     của trang đó dùng (resolvePcccViewScope, resolveTbycnnViewScope, groundingScopeWithPermissions…),
 *     không viết luật riêng — viết riêng là sớm muộn lệch với trang.
 *   - Tài khoản `DEFECT_READ_ONLY` chỉ được tra khiếm khuyết (proxy.ts chặn mọi API khác), nên
 *     mọi công cụ ở đây từ chối ngay.
 *   - Chỉ đọc. Không trả điện thoại, chữ ký, ảnh hay đường dẫn tệp.
 */

type ToolResult = { items: Array<Record<string, unknown>>; message?: string; hasMore?: boolean };

const READ_LEVELS = ["read", "personal", "manage", "full"] as const;
const DEFECT_ONLY_MESSAGE = "Tài khoản này chỉ được tra cứu khiếm khuyết";

function defectOnly(user: AiToolUser): ToolResult | null {
  return user.accessMode === "DEFECT_READ_ONLY" ? { items: [], message: DEFECT_ONLY_MESSAGE } : null;
}

async function canRead(user: AiToolUser, permissionId: string) {
  return hasPermissionLevel(user, permissionId, [...READ_LEVELS]);
}

/** Lỗi `fail()` của các hàm dùng chung là Response — đổi thành thông báo cho mô hình thay vì 500. */
async function messageOf(error: unknown) {
  if (error instanceof Response) {
    const body = await error.clone().json().catch(() => null) as { error?: string } | null;
    return body?.error || "Không đọc được dữ liệu";
  }
  throw error;
}

function vietnamToday() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit" })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value])
  );
  return { year: Number(parts.year), periodKey: `${parts.year}-${parts.month}` };
}

function flag(value: unknown) {
  return value === true || ["true", "1", "yes", "co"].includes(normalizeText(text(value, 10)));
}

function contains(haystack: Array<string | null | undefined>, needle: string) {
  return !needle || normalizeText(haystack.filter(Boolean).join(" ")).includes(needle);
}

const insensitive = (value: string) => ({ contains: value, mode: "insensitive" as const });

// ───────────────────────────── Phiếu công tác ─────────────────────────────

/**
 * SỔ CẤP PHIẾU CÔNG TÁC. Phạm vi bằng `GET /api/work-permits`: mọi tài khoản đăng nhập xem được
 * cả hai sổ. Mặc định bỏ phiếu ĐÃ HỦY; `status=OPEN` là phiếu chưa đóng như bộ lọc mặc định của trang.
 */
export async function aiSearchWorkPermits(user: AiToolUser, input: Record<string, unknown>): Promise<ToolResult> {
  const blocked = defectOnly(user);
  if (blocked) return blocked;
  const take = limitOf(input.limit);
  const kind = text(input.kind, 20).toUpperCase();
  const status = text(input.status, 20).toUpperCase();
  const unit = text(input.unit, 10).toUpperCase();
  const query = text(input.query, 200);
  const from = text(input.from, 10);
  const to = text(input.to, 10);
  const day = /^\d{4}-\d{2}-\d{2}$/;

  const where: Prisma.WorkPermitWhereInput = {
    ...(Object.hasOwn(PERMIT_KINDS, kind) ? { kind } : {}),
    ...(Object.hasOwn(PERMIT_UNITS, unit) ? { unit } : {}),
    status: status === "OPEN"
      ? { notIn: ["CLOSED", "CANCELLED"] }
      : Object.hasOwn(PERMIT_STATUSES, status) ? status : { not: "CANCELLED" },
    ...(day.test(from) || day.test(to) ? { workDate: { ...(day.test(from) ? { gte: from } : {}), ...(day.test(to) ? { lte: to } : {}) } } : {}),
    ...(query ? { OR: [
      { searchText: { contains: permitSearchTerm(query) } },
      { sessions: { some: { searchText: { contains: permitSearchTerm(query) } } } },
      { number: insensitive(query.replace(/\/.*$/, "")) },
      { repairRequestNumber: insensitive(query) },
    ] } : {}),
  };
  const rows = await prisma.workPermit.findMany({
    where,
    orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
    take: take + 1,
    select: {
      id: true, number: true, year: true, kind: true, workType: true, status: true, progress: true,
      unit: true, workDate: true, content: true, location: true, position: true, issuerName: true,
      commanderName: true, teamName: true, teamType: true, workerCount: true, authorizerName: true,
      repairRequestNumber: true, issuedAt: true, closedAt: true, result: true, statusReason: true,
    },
  });
  const items = rows.slice(0, take).map((row) => {
    const number = formatPermitNumber(row);
    const kindLabel = PERMIT_KINDS[row.kind as keyof typeof PERMIT_KINDS] ?? row.kind;
    const statusLabel = PERMIT_STATUSES[row.status as keyof typeof PERMIT_STATUSES] ?? row.status;
    return {
      sourceType: "WORK_PERMIT" as const,
      sourceId: row.id,
      title: `PCT ${number} — ${kindLabel}`,
      occurredAt: row.issuedAt?.toISOString() ?? null,
      url: `/work-permits?kind=${encodeURIComponent(row.kind)}&permitId=${encodeURIComponent(row.id)}`,
      facts: facts({
        number, register: kindLabel, status: statusLabel, statusReason: row.statusReason,
        workType: row.workType ? PERMIT_WORK_TYPES[row.workType as keyof typeof PERMIT_WORK_TYPES] ?? row.workType : null,
        unit: PERMIT_UNITS[row.unit as keyof typeof PERMIT_UNITS] ?? row.unit,
        workDate: row.workDate, position: row.position, content: row.content, location: row.location,
        issuer: row.issuerName, commander: row.commanderName, authorizer: row.authorizerName,
        team: row.teamName, teamType: row.teamType === "CONTRACTOR" ? "Nhà thầu" : "Nội bộ",
        workerCount: row.workerCount, progressPercent: row.progress, repairRequestNumber: row.repairRequestNumber,
        closedAt: row.closedAt, result: row.result,
      }),
    };
  });
  return {
    items,
    hasMore: rows.length > take,
    ...(items.length === 0 ? { message: "Không có phiếu công tác nào khớp điều kiện" } : {}),
  };
}

// ───────────────────────────── Sổ an toàn: PCCC · TBYCNN · Tiếp địa ─────────────────────────────

/** Tình trạng coi là CẦN CHÚ Ý ở các bảng PCCC (xem lib/pccc-status.ts). */
const PCCC_BAD_STATUSES = ["Không đạt", "Bất khả dụng", "Cần theo dõi", "Không khả dụng", "Có suy giảm chức năng nhưng vẫn sử dụng được khi có sự cố"];

export const AI_SAFETY_REGISTERS = ["PCCC", "TBYCNN", "GROUNDING"] as const;

/**
 * SỔ THIẾT BỊ PCCC, TBYCNN, TIẾP ĐỊA & CHỐNG SÉT — gộp một công cụ, chọn bằng `register`.
 * Không có `query` lẫn `attention` thì trả tổng quan số lượng, để mô hình không kéo cả sổ về.
 */
export async function aiSearchSafetyRegisters(user: AiToolUser, input: Record<string, unknown>): Promise<ToolResult> {
  const blocked = defectOnly(user);
  if (blocked) return blocked;
  const register = text(input.register, 20).toUpperCase();
  try {
    if (register === "PCCC") return await searchPccc(user, input);
    if (register === "TBYCNN") return await searchTbycnn(user, input);
    if (register === "GROUNDING") return await searchGrounding(user, input);
  } catch (error) {
    return { items: [], message: await messageOf(error) };
  }
  return { items: [], message: "Cần chọn register: PCCC, TBYCNN hoặc GROUNDING" };
}

type PcccTable = {
  label: string;
  rows: () => Promise<Array<{ id: string; name: string; code: string | null; status: string | null; overdue?: boolean; extra: Record<string, unknown> }>>;
  total: () => Promise<number>;
};

async function searchPccc(user: AiToolUser, input: Record<string, unknown>): Promise<ToolResult> {
  if (!(await canRead(user, PCCC_PERMISSION.view))) return { items: [], message: "Không có quyền xem sổ thiết bị PCCC" };
  const period = await resolvePcccPeriod(text(input.period, 20) || null);
  const view = await resolvePcccViewScope(user);
  const selectedMachine = machine(input.machine);
  // Ba kiểu phạm vi đúng như app/api/pccc/summary/route.ts.
  const scopeBcc = pcccScopeWhere(null, selectedMachine, view, { withSupervisor: true });
  const scopeTcc = pcccScopeWhere(null, selectedMachine, pcccCabinetViewScope(view, user));
  const scopeFcd = pcccScopeWhere(null, selectedMachine, pcccBulkViewScope(view));
  const scopePlain = pcccScopeWhere(null, selectedMachine, view);
  const query = text(input.query, 100);
  const attention = flag(input.attention);
  const take = limitOf(input.limit);
  const periodEnd = periodEndDate(period.label);
  const base = { periodId: period.id };
  const bad = { in: PCCC_BAD_STATUSES };

  const tables: PcccTable[] = [
    {
      label: "Bình chữa cháy",
      total: () => prisma.pcccExtinguisher.count({ where: { AND: [base, scopeBcc] } }),
      rows: async () => (await prisma.pcccExtinguisher.findMany({
        where: { AND: [base, scopeBcc, attention ? { OR: [{ tinhTrang: bad }, { denHanThayThe: { lt: periodEnd } }] } : {}, query ? { OR: [{ ma: insensitive(query) }, { viTri: insensitive(query) }, { chungLoai: insensitive(query) }, { cuongVi: insensitive(query) }, { ghiChu: insensitive(query) }] } : {}] },
        orderBy: [{ stt: "asc" }, { ma: "asc" }], take,
      })).map((row) => ({
        id: row.id, name: row.chungLoai ?? "Bình chữa cháy", code: row.ma, status: row.tinhTrang,
        overdue: Boolean(row.denHanThayThe && row.denHanThayThe < periodEnd),
        extra: { location: row.viTri, position: row.cuongVi, machine: row.machine, supervisor: row.nguoiGiamSat, pressurePercent: row.apSuat, currentPlace: row.viTriHienTai, exterior: row.tinhTrangNgoai, replaceDue: row.denHanThayThe, checkedAt: row.ngayKiemTra, checkedBy: row.nguoiKiemTra, note: row.ghiChu },
      })),
    },
    {
      label: "Tủ chữa cháy",
      total: () => prisma.pcccCabinet.count({ where: { AND: [base, scopeTcc] } }),
      rows: async () => (await prisma.pcccCabinet.findMany({
        where: { AND: [base, scopeTcc, attention ? { tinhTrangTongThe: bad } : {}, query ? { OR: [{ ma: insensitive(query) }, { ten: insensitive(query) }, { viTri: insensitive(query) }, { cuongVi: insensitive(query) }, { ghiChu: insensitive(query) }] } : {}] },
        orderBy: [{ stt: "asc" }, { ma: "asc" }], take,
      })).map((row) => ({
        id: row.id, name: row.ten ?? "Tủ chữa cháy", code: row.ma, status: row.tinhTrangTongThe,
        extra: { location: row.viTri, position: row.cuongVi, machine: row.machine, repairRequest: row.soYcsc, checkedAt: row.ngayKiemTra, checkedBy: row.nguoiKiemTra, note: row.ghiChu },
      })),
    },
    {
      label: "Cuộn vòi",
      total: () => prisma.pcccHoseReel.count({ where: { AND: [base, scopeTcc] } }),
      rows: async () => (await prisma.pcccHoseReel.findMany({
        where: { AND: [base, scopeTcc, attention ? { tinhTrangTongThe: bad } : {}, query ? { OR: [{ ma: insensitive(query) }, { ten: insensitive(query) }, { viTri: insensitive(query) }, { cuongVi: insensitive(query) }] } : {}] },
        orderBy: [{ stt: "asc" }, { ma: "asc" }], take,
      })).map((row) => ({
        id: row.id, name: row.ten ?? "Cuộn vòi", code: row.ma, status: row.tinhTrangTongThe,
        extra: { location: row.viTri, position: row.cuongVi, machine: row.machine, repairRequest: row.soYcsc, checkedAt: row.ngayKiemTra, checkedBy: row.nguoiKiemTra, note: row.ghiChu },
      })),
    },
    {
      label: "Nút nhấn báo cháy",
      total: () => prisma.pcccAlarmButton.count({ where: { AND: [base, scopeBcc] } }),
      rows: async () => (await prisma.pcccAlarmButton.findMany({
        where: { AND: [base, scopeBcc, attention ? { tinhTrangTongThe: bad } : {}, query ? { OR: [{ maKks: insensitive(query) }, { tenKhuVuc: insensitive(query) }, { viTri: insensitive(query) }, { cuongVi: insensitive(query) }] } : {}] },
        orderBy: [{ stt: "asc" }], take,
      })).map((row) => ({
        id: row.id, name: row.tenKhuVuc ?? "Nút nhấn báo cháy", code: row.maKks, status: row.tinhTrangTongThe,
        extra: { location: row.viTri, position: row.cuongVi, machine: row.machine, supervisor: row.nguoiGiamSat, checkedAt: row.ngayKiemTra, checkedBy: row.nguoiKiemTra, note: row.khac },
      })),
    },
    {
      label: "Van chữa cháy",
      total: () => prisma.pcccValve.count({ where: { AND: [base, scopeBcc] } }),
      rows: async () => (await prisma.pcccValve.findMany({
        where: { AND: [base, scopeBcc, attention ? { tinhTrang: bad } : {}, query ? { OR: [{ tenVan: insensitive(query) }, { maKks: insensitive(query) }, { viTri: insensitive(query) }, { loaiVan: insensitive(query) }, { cuongVi: insensitive(query) }] } : {}] },
        orderBy: [{ stt: "asc" }], take,
      })).map((row) => ({
        id: row.id, name: row.tenVan, code: row.maKks, status: row.tinhTrang,
        extra: { valveType: row.loaiVan, location: row.viTri, position: row.cuongVi, machine: row.machine, description: row.moTa, repairRequest: row.soYcsc, checkedAt: row.ngayKiemTra, checkedBy: row.nguoiKiemTra },
      })),
    },
    {
      label: "Đèn sự cố / Exit",
      total: () => prisma.pcccEmergencyLight.count({ where: { AND: [base, scopeBcc] } }),
      rows: async () => (await prisma.pcccEmergencyLight.findMany({
        where: { AND: [base, scopeBcc, attention ? { tinhTrang: bad } : {}, query ? { OR: [{ maKks: insensitive(query) }, { tenKhuVuc: insensitive(query) }, { loai: insensitive(query) }, { cuongVi: insensitive(query) }] } : {}] },
        orderBy: [{ stt: "asc" }], take,
      })).map((row) => ({
        id: row.id, name: `${row.loai} ${row.tenKhuVuc ?? ""}`.trim(), code: row.maKks, status: row.tinhTrang,
        extra: { position: row.cuongVi, machine: row.machine, testResult: row.ketQuaTest, checkedAt: row.ngayKiemTra, checkedBy: row.nguoiKiemTra, note: row.ghiChu },
      })),
    },
    {
      label: "Foam / CO2 / Diesel",
      total: () => prisma.pcccBulk.count({ where: { AND: [base, scopeFcd] } }),
      rows: async () => (await prisma.pcccBulk.findMany({
        where: { AND: [base, scopeFcd, attention ? { tinhTrang: bad } : {}, query ? { OR: [{ ten: insensitive(query) }, { viTri: insensitive(query) }, { cuongVi: insensitive(query) }] } : {}] },
        orderBy: [{ stt: "asc" }], take,
      })).map((row) => ({
        id: row.id, name: row.ten, code: null, status: row.tinhTrang,
        extra: { location: row.viTri, position: row.cuongVi, machine: row.machine, designAmount: row.khoiLuongThietKe, currentAmount: row.khoiLuongHienTai, unit: row.dvt, remainingPercent: row.phanTramConLai, recordedAt: row.ngayChot, recordedBy: row.nguoiChot, note: row.ghiChu },
      })),
    },
    {
      label: "Tủ điều khiển chữa cháy",
      total: () => prisma.pcccFireControlCabinet.count({ where: { AND: [base, scopePlain] } }),
      rows: async () => (await prisma.pcccFireControlCabinet.findMany({
        where: { AND: [base, scopePlain, attention ? { tinhTrang: bad } : {}, query ? { OR: [{ ma: insensitive(query) }, { heThong: insensitive(query) }, { viTri: insensitive(query) }, { cuongVi: insensitive(query) }] } : {}] },
        orderBy: [{ stt: "asc" }], take,
      })).map((row) => ({
        id: row.id, name: row.heThong, code: row.ma, status: row.tinhTrang,
        extra: { location: row.viTri, position: row.cuongVi, machine: row.machine, checkedAt: row.ngayKiemTra, checkedBy: row.nguoiKiemTra, note: row.ghiChu },
      })),
    },
  ];

  if (!query && !attention) {
    const totals = await Promise.all(tables.map((table) => table.total()));
    return {
      items: [{
        sourceType: "PCCC" as const,
        sourceId: `period:${period.label}`,
        title: `Sổ PCCC kỳ ${period.label}`,
        url: "/pccc",
        facts: {
          ...facts({ period: period.label, closed: period.isClosed, scope: view.all ? "Toàn bộ" : "Theo cương vị đang làm việc" }),
          counts: Object.fromEntries(tables.map((table, index) => [table.label, totals[index]])),
        },
      }],
      message: "Đây là số lượng theo loại trong phạm vi người dùng được xem. Muốn biết thiết bị cụ thể thì gọi lại với query, hoặc attention=true để lấy thiết bị không đạt/cần theo dõi/quá hạn.",
    };
  }

  const found = (await Promise.all(tables.map(async (table) => (await table.rows()).map((row) => ({ table: table.label, row })))))
    .flat();
  const items = found.slice(0, take).map(({ table, row }) => ({
    sourceType: "PCCC" as const,
    sourceId: row.id,
    title: `${table}: ${[row.code, row.name].filter(Boolean).join(" — ")}`,
    url: "/pccc",
    facts: facts({ period: period.label, group: table, code: row.code, name: row.name, status: row.status, replaceOverdue: row.overdue, ...row.extra }),
  }));
  return {
    items,
    hasMore: found.length > items.length,
    ...(items.length === 0 ? { message: `Không có thiết bị PCCC nào khớp trong kỳ ${period.label} thuộc phạm vi được xem` } : {}),
  };
}

async function searchTbycnn(user: AiToolUser, input: Record<string, unknown>): Promise<ToolResult> {
  if (!(await hasPermissionLevel(user, TBYCNN_PERMISSION.view, [...TBYCNN_READ_LEVELS]))) {
    return { items: [], message: "Không có quyền xem sổ thiết bị yêu cầu nghiêm ngặt" };
  }
  const period = await resolveTbycnnPeriod(text(input.period, 20) || null);
  const scope = await resolveTbycnnViewScope(user);
  const selectedMachine = machine(input.machine);
  const query = text(input.query, 100);
  const attention = flag(input.attention);
  const take = limitOf(input.limit);
  const now = new Date();
  // Cùng mốc "sắp đến hạn" với thẻ KPI của trang /tbycnn (lib/tbycnn.ts kdStatus).
  const soon = new Date(now.getTime() + TBYCNN_KD_SOON_DAYS * 24 * 60 * 60 * 1000);
  const where: Prisma.TbycnnEquipmentWhereInput = {
    periodId: period.id,
    ...tbycnnScopeWhere(scope),
    ...(selectedMachine ? { machine: selectedMachine } : {}),
    ...(attention ? { OR: [
      { kdTiepTheo: { lte: soon } },
      { soLuongKhongKhaDung: { gt: 0 } },
      { AND: [{ khiemKhuyet: { not: null } }, { khiemKhuyet: { not: "" } }] },
    ] } : {}),
    ...(query ? { AND: [{ OR: [
      { tenThietBi: insensitive(query) }, { kks: insensitive(query) }, { maHieu: insensitive(query) },
      { viTri: insensitive(query) }, { khuVuc: insensitive(query) }, { danhMuc: insensitive(query) },
      { nhom: insensitive(query) }, { cuongVi: insensitive(query) },
    ] }] } : {}),
  };
  if (!query && !attention) {
    const [total, overdue, dueSoon, unavailable] = await Promise.all([
      prisma.tbycnnEquipment.count({ where }),
      prisma.tbycnnEquipment.count({ where: { ...where, kdTiepTheo: { lt: now } } }),
      prisma.tbycnnEquipment.count({ where: { ...where, kdTiepTheo: { gte: now, lte: soon } } }),
      prisma.tbycnnEquipment.count({ where: { ...where, soLuongKhongKhaDung: { gt: 0 } } }),
    ]);
    return {
      items: [{
        sourceType: "TBYCNN" as const,
        sourceId: `period:${period.label}`,
        title: `Sổ TBYCNN kỳ ${period.label}`,
        url: "/tbycnn",
        facts: facts({ period: period.label, closed: period.isClosed, scope: scope.all ? "Toàn bộ" : "Theo cương vị đang làm việc", equipmentRows: total, inspectionOverdue: overdue, inspectionDueSoon: dueSoon, dueSoonDays: TBYCNN_KD_SOON_DAYS, rowsWithUnavailableUnits: unavailable }),
      }],
      message: "Đây là số lượng trong phạm vi người dùng được xem. Muốn biết thiết bị cụ thể thì gọi lại với query, hoặc attention=true để lấy thiết bị quá hạn/sắp hạn kiểm định hoặc không khả dụng.",
    };
  }
  const rows = await prisma.tbycnnEquipment.findMany({
    where,
    orderBy: attention ? [{ kdTiepTheo: "asc" }] : [{ khuVuc: "asc" }, { tt: "asc" }],
    take: take + 1,
  });
  const items = rows.slice(0, take).map((row) => ({
    sourceType: "TBYCNN" as const,
    sourceId: row.id,
    title: `TBYCNN: ${row.tenThietBi}${row.kks ? ` — ${row.kks}` : ""}`,
    url: "/tbycnn",
    facts: facts({
      period: period.label, name: row.tenThietBi, kks: row.kks, model: row.maHieu, group: row.nhom, category: row.danhMuc,
      area: row.khuVuc, location: row.viTri, position: row.cuongVi, machine: row.machine, quantity: row.soLuong,
      availableUnits: row.soLuongKhaDung, unavailableUnits: row.soLuongKhongKhaDung,
      lastInspection: row.kdGanNhat ?? row.kdGanNhatText, inspectionReport: row.soBbkd, inspectionUnit: row.donViKd,
      nextInspection: row.kdTiepTheo ?? row.kdTiepTheoText, inspectionOverdue: Boolean(row.kdTiepTheo && row.kdTiepTheo < now),
      cycleYears: row.chuKyThu, usageStatus: row.tinhTrangSuDung, defect: row.khiemKhuyet, testResult: row.ketQuaThu, note: row.ghiChu,
    }),
  }));
  return {
    items,
    hasMore: rows.length > take,
    ...(items.length === 0 ? { message: `Không có thiết bị TBYCNN nào khớp trong kỳ ${period.label} thuộc phạm vi được xem` } : {}),
  };
}

async function searchGrounding(user: AiToolUser, input: Record<string, unknown>): Promise<ToolResult> {
  if (!(await canRead(user, GROUNDING_PERMISSIONS.view))) return { items: [], message: "Không có quyền xem sổ tiếp địa & chống sét" };
  const scope = await groundingScopeWithPermissions(user);
  const selectedMachine = machine(input.machine);
  const query = text(input.query, 100);
  const attention = flag(input.attention);
  const take = limitOf(input.limit);
  const where: Prisma.GroundingLightningItemWhereInput = {
    ...(!scope.all ? { positionCode: scope.positionCode ?? "__NO_POSITION__" } : {}),
    ...(selectedMachine ? { machine: selectedMachine } : {}),
    ...(attention ? { points: { some: { status: "DEFECT" } } } : {}),
    ...(query ? { OR: [
      { areaEquipment: insensitive(query) },
      { position: insensitive(query) },
      { note: insensitive(query) },
      { points: { some: { defectDescription: insensitive(query) } } },
    ] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.groundingLightningItem.findMany({
      where,
      orderBy: [{ stt: "asc" }, { areaEquipment: "asc" }],
      take: take + 1,
      select: {
        id: true, areaEquipment: true, position: true, machine: true, note: true,
        points: { orderBy: { type: "asc" }, select: { type: true, status: true, defectDescription: true } },
        inspections: { orderBy: { signedAt: "desc" }, take: 1, select: { signedAt: true, inspectorName: true } },
      },
    }),
    prisma.groundingLightningItem.count({ where }),
  ]);
  const items = rows.slice(0, take).map((row) => ({
    sourceType: "GROUNDING" as const,
    sourceId: row.id,
    title: `Tiếp địa & chống sét: ${row.areaEquipment}`,
    url: "/grounding-lightning",
    facts: {
      ...facts({ area: row.areaEquipment, position: row.position, machine: row.machine, note: row.note, lastInspectedAt: row.inspections[0]?.signedAt, lastInspector: row.inspections[0]?.inspectorName }),
      points: row.points.map((point) => [
        GROUNDING_TYPE_LABEL[point.type as GroundingType] ?? point.type,
        GROUNDING_STATUS_LABEL[point.status as GroundingStatus] ?? point.status,
        point.defectDescription?.slice(0, 150),
      ].filter(Boolean).join(": ")),
    },
  }));
  return {
    items,
    hasMore: rows.length > take,
    ...(query || attention ? {} : { message: `Có ${total} hạng mục trong phạm vi được xem; đây là ${items.length} mục đầu. Dùng attention=true để lấy hạng mục có khiếm khuyết.` }),
    ...(items.length === 0 ? { message: "Không có hạng mục tiếp địa & chống sét nào khớp trong phạm vi được xem" } : {}),
  };
}

// ───────────────────────────── Vật tư & tồn kho ─────────────────────────────

/**
 * TRA CỨU VẬT TƯ & TỒN KHO — hai nguồn, mỗi nguồn một quyền như trang web:
 *   MATERIAL — tồn theo lô của Danh mục Vận Hành 1 (quyền `material-manage`, cùng dữ liệu với
 *              `GET /api/materials/stock-lots`).
 *   ERP      — vật tư theo ERP và nhóm gom (quyền `erp-material-manage`, như `/vat-tu/loai-dau`).
 */
export async function aiSearchMaterials(user: AiToolUser, input: Record<string, unknown>): Promise<ToolResult> {
  const blocked = defectOnly(user);
  if (blocked) return blocked;
  const query = text(input.query, 100);
  if (normalizeText(query).length < 2) return { items: [], message: "Cần nêu tên hoặc mã vật tư (ít nhất 2 ký tự)" };
  const source = text(input.source, 20).toUpperCase();
  const take = limitOf(input.limit);
  const [materialAllowed, erpAllowed] = await Promise.all([canRead(user, "material-manage"), canRead(user, "erp-material-manage")]);
  const wantMaterial = source !== "ERP" && materialAllowed;
  const wantErp = source !== "MATERIAL" && erpAllowed;
  if (!wantMaterial && !wantErp) return { items: [], message: "Không có quyền xem danh mục vật tư hoặc vật tư theo ERP" };

  const items: Array<Record<string, unknown>> = [];
  if (wantMaterial) {
    const materials = await prisma.material.findMany({
      where: { OR: [{ code: insensitive(query) }, { name: insensitive(query) }, { erpCodes: { has: query } }] },
      select: { code: true, name: true, unit: true, category: true, machine: true, quantity: true, minStock: true, erpCodes: true },
      orderBy: { name: "asc" },
      take: 60,
    });
    // Gom như stock-lots: vật tư thường một kho chung theo mã, riêng chai khí tách tồn theo tổ máy.
    const byKey = new Map<string, (typeof materials)[number]>();
    for (const material of materials) {
      const key = isGasCylinderCategory(material.category) ? `${material.code}::${material.machine}` : material.code;
      if (!byKey.has(key)) byKey.set(key, material);
    }
    const lots = await lotsByCodes(prisma, [...new Set([...byKey.values()].map((material) => material.code))]);
    for (const material of [...byKey.values()].slice(0, take)) {
      const stockUnit = isGasCylinderCategory(material.category) ? material.machine : "COMMON";
      const open = (lots.get(material.code) ?? []).filter((lot) => lot.stockUnit === stockUnit && lot.quantityLeft > 0);
      items.push({
        sourceType: "MATERIAL" as const,
        sourceId: `${material.code}:${stockUnit}`,
        title: `Vật tư ${material.code} — ${material.name}`,
        url: `/materials?q=${encodeURIComponent(material.code)}`,
        facts: facts({
          source: "Danh mục Vận Hành 1", code: material.code, name: material.name, unit: material.unit, category: material.category,
          stockUnit: stockUnit === "COMMON" ? "Kho chung" : stockUnit,
          // Tổng lô là số đáng tin; `quantity` là cột Hiện có của danh mục — lệch nhau thì báo cả hai như stock-lots.
          stockByLots: open.reduce((sum, lot) => sum + lot.quantityLeft, 0), openLots: open.length, catalogOnHand: material.quantity,
          newestLotReceivedAt: open.map((lot) => lot.receivedAt).filter(Boolean).sort().at(-1),
          minStock: material.minStock || null, erpCodes: material.erpCodes.join(", "),
        }),
      });
    }
  }
  if (wantErp) {
    const [groups, erpRows] = await Promise.all([
      prisma.oilType.findMany({
        where: { OR: [{ code: insensitive(query) }, { name: insensitive(query) }] },
        take,
        select: {
          id: true, code: true, name: true, category: true, baseUnit: true, minStock: true,
          materials: { where: { mappingStatus: "CONFIRMED", isActive: true }, select: { code: true, erpStock: true, conversionFactor: true } },
        },
      }),
      prisma.erpMaterial.findMany({
        where: { isActive: true, OR: [{ code: insensitive(query) }, { name: insensitive(query) }] },
        take,
        orderBy: { code: "asc" },
        select: { id: true, code: true, name: true, unit: true, warehouse: true, erpStock: true, category: true, oilType: { select: { name: true } } },
      }),
    ]);
    for (const group of groups) {
      const totalQty = group.materials.reduce((sum, row) => sum + row.erpStock * row.conversionFactor, 0);
      items.push({
        sourceType: "ERP_MATERIAL" as const,
        sourceId: `group:${group.id}`,
        title: `Nhóm ERP ${group.name}`,
        url: "/vat-tu/loai-dau",
        facts: facts({ source: "Vật tư theo ERP (nhóm)", group: group.name, code: group.code, category: group.category, unit: group.baseUnit, erpStockTotal: Math.round(totalQty * 1000) / 1000, minStock: group.minStock, belowMin: group.minStock != null && totalQty < group.minStock, erpCodeCount: group.materials.length }),
      });
    }
    for (const row of erpRows) {
      items.push({
        sourceType: "ERP_MATERIAL" as const,
        sourceId: row.id,
        title: `Mã ERP ${row.code} — ${row.name}`,
        url: "/vat-tu/loai-dau",
        facts: facts({ source: "Vật tư theo ERP", code: row.code, name: row.name, unit: row.unit, category: row.category, warehouse: row.warehouse, erpStock: row.erpStock, group: row.oilType?.name }),
      });
    }
  }
  return {
    items: items.slice(0, take),
    hasMore: items.length > take,
    ...(items.length === 0 ? { message: "Không tìm thấy vật tư nào khớp tên hoặc mã đã hỏi" } : {}),
  };
}

/** Nhãn trạng thái phiếu — bản sao của STATUS trong components/materials/MaterialTicketBoard.tsx. */
const TICKET_STATUS_LABEL: Record<string, string> = {
  CHO_DE_XUAT: "Chờ đề xuất", CHO_XAC_NHAN: "Chờ xác nhận", CHO_XAC_NHAN_PHAT: "Chờ Thống Kê xác nhận ĐXVT",
  CHO_PHIEU__XUAT_KHO: "Chờ Thống Kê xác nhận ĐXVT", VAT_TU_KHONG_CO: "Vật tư không có", CHO_THONG_KE: "Chờ thống kê",
  VHV_LANH_VAT_TU: "Chờ VHV lãnh vật tư", NHAN_TU_HIEN_CO: "Nhận vật tư hiện có", NHAN_VAT_TU: "Xác nhận vật tư lãnh",
  CHO_PHIEU_YCSC: "Đã lãnh vật tư · Chờ xử lý SYC", SU_DUNG_VAT_TU: "Sử dụng vật tư", CHO_NGHIEM_THU: "Chờ nghiệm thu",
  CHO_TRA_VO: "Chờ xác nhận trả", CHO_TRA_PHIEU_THU_HOI: "Chờ trả phiếu vật tư thu hồi", CHO_QUYET_TOAN: "Chờ quyết toán",
  CHO_THONG_KE_XUAT_BIEN_BAN: "Chờ Thống kê xác nhận mã", CHO_NHAP_LIEU: "Chờ nhập số lượng ứng",
  CHO_NHAP_LIEU_THAY_THE: "Chờ nhập liệu thay thế", CHO_XAC_NHAN_PDF: "Chờ xác nhận xuất file",
  CHO_HOAN_THIEN: "Chờ hoàn thiện hồ sơ", HOAN_TAT: "Hoàn tất", TU_CHOI: "Từ chối",
};

const TICKET_TYPE_LABEL: Record<string, string> = {
  CHUA_CHON: "Chưa chọn luồng", DE_XUAT: "Đề xuất", UNG: "Ứng", SU_DUNG_HIEN_CO: "Sử dụng hiện có",
  HOA_CHAT: "Hóa chất", GHI_NHAN: "NH3 lỏng", VAT_TU_KHAC: "Vật tư khác", VAT_TU_KHAC_UNG: "Ứng Vật tư khác",
};

/**
 * THEO DÕI VẬT TƯ — phiếu đề xuất/ứng vật tư ở trang `/replacement-procedures`. Phạm vi bằng
 * `GET /api/material-tickets`: mọi tài khoản đăng nhập xem được danh sách phiếu.
 */
export async function aiSearchMaterialTickets(user: AiToolUser, input: Record<string, unknown>): Promise<ToolResult> {
  const blocked = defectOnly(user);
  if (blocked) return blocked;
  const take = limitOf(input.limit);
  const query = text(input.query, 100);
  const status = text(input.status, 40).toUpperCase();
  const month = text(input.month, 7);
  const unit = text(input.unit, 10).toUpperCase();
  const open = flag(input.open);
  // "VT-7", "HC 3", "phiếu 12" → số thứ tự trong tháng; tiền tố chọn dãy.
  const numbered = /^(VT|HC)?\s*-?\s*(\d{1,5})$/i.exec(query.replace(/^(phieu|stt)\s*/i, ""));
  const where: Prisma.MaterialTicketWhereInput = {
    ...(Object.hasOwn(TICKET_STATUS_LABEL, status) ? { status } : open ? { status: { notIn: ["HOAN_TAT", "TU_CHOI"] } } : {}),
    ...(/^\d{4}-\d{2}$/.test(month) ? { sequenceMonth: month } : {}),
    ...(["S1", "S2", "COMMON"].includes(unit) ? { unit } : {}),
    ...(numbered ? {
      sequenceNumber: Number(numbered[2]),
      ...(numbered[1] ? { sequenceScope: numbered[1].toUpperCase() === "HC" ? "CHEMICAL" : "MATERIAL" } : {}),
    } : query ? { OR: [
      { pctNumber: insensitive(query) }, { repairRequestNumber: insensitive(query) }, { proposalNumber: insensitive(query) },
      { deliveryNoteNumber: insensitive(query) }, { bbntDoNumber: insensitive(query) }, { assignedPosition: insensitive(query) },
      { pctContent: insensitive(query) }, { createdByName: insensitive(query) },
      { items: { some: { OR: [{ material: { name: insensitive(query) } }, { material: { code: insensitive(query) } }, { erpName: insensitive(query) }, { deviceNameManual: insensitive(query) }] } } },
    ] } : {}),
  };
  const rows = await prisma.materialTicket.findMany({
    where,
    orderBy: [{ sequenceMonth: "desc" }, { sequenceScope: "asc" }, { sequenceNumber: "desc" }],
    take: take + 1,
    select: {
      id: true, sequenceMonth: true, sequenceNumber: true, sequenceScope: true, type: true, unit: true, status: true,
      assignedPosition: true, materialCategory: true, pctNumber: true, repairRequestNumber: true, proposalNumber: true,
      deliveryNoteNumber: true, bbntDoNumber: true, createdByName: true, createdAt: true, completedAt: true,
      rejectedReason: true, receivedQuantity: true, usedQuantity: true, materialUserName: true,
      items: { take: 8, select: { quantity: true, receivedQuantity: true, deviceNameManual: true, material: { select: { code: true, name: true, unit: true } }, device: { select: { name: true } } } },
    },
  });
  const items = rows.slice(0, take).map((row) => ({
    sourceType: "MATERIAL_TICKET" as const,
    sourceId: row.id,
    title: `Phiếu vật tư ${materialTicketReference(row)}`,
    occurredAt: row.createdAt.toISOString(),
    url: "/replacement-procedures",
    facts: {
      ...facts({
        ticket: materialTicketReference(row), flow: TICKET_TYPE_LABEL[row.type] ?? row.type,
        status: TICKET_STATUS_LABEL[row.status] ?? row.status, unit: row.unit, assignedPosition: row.assignedPosition,
        materialCategory: row.materialCategory, pctNumber: row.pctNumber, repairRequestNumber: row.repairRequestNumber,
        proposalNumber: row.proposalNumber, deliveryNoteNumber: row.deliveryNoteNumber, bbntDoNumber: row.bbntDoNumber,
        createdBy: row.createdByName, createdAt: row.createdAt, completedAt: row.completedAt, rejectedReason: row.rejectedReason,
        receivedQuantity: row.receivedQuantity, usedQuantity: row.usedQuantity, materialUser: row.materialUserName,
      }),
      items: row.items.map((item) => [
        `${item.material.name} (${item.material.code})`,
        `SL ${item.receivedQuantity ?? item.quantity} ${item.material.unit}`,
        item.device?.name ?? item.deviceNameManual,
      ].filter(Boolean).join(" · ")),
    },
  }));
  return {
    items,
    hasMore: rows.length > take,
    ...(items.length === 0 ? { message: "Không có phiếu vật tư nào khớp điều kiện" } : {}),
  };
}

/**
 * KẾ HOẠCH VẬT TƯ NĂM & NHU CẦU VẬT TƯ THÁNG (quyền `material-manage`, như hai trang
 * `/material-annual-plans` và `/material-annual-plans/monthly`). Có `period` (YYYY-MM) thì đọc
 * biểu nhu cầu tháng, không thì đọc kế hoạch năm `year` (mặc định năm nay).
 */
export async function aiMaterialPlans(user: AiToolUser, input: Record<string, unknown>): Promise<ToolResult> {
  const blocked = defectOnly(user);
  if (blocked) return blocked;
  if (!(await canRead(user, "material-manage"))) return { items: [], message: "Không có quyền xem kế hoạch và nhu cầu vật tư" };
  const take = limitOf(input.limit);
  const needle = normalizeText(text(input.query, 100));
  const today = vietnamToday();
  const round = (value: number | null | undefined) => value == null ? null : Math.round(value * 1000) / 1000;

  const period = parseMonthlyPeriodKey(text(input.period, 7));
  if (period) {
    const report = await getMaterialMonthlyReport(prisma, period);
    const rows = report.groups.flatMap((group) => group.rows.map((row) => ({ group: group.group, row })))
      .filter(({ group, row }) => contains([group, row.materialNameLabel, row.erpCode, row.purpose, row.proposerName], needle));
    const items = rows.slice(0, take).map(({ group, row }) => ({
      sourceType: "MATERIAL_PLAN" as const,
      sourceId: `${period.periodKey}:${row.materialCategory}:${row.materialNameKey}`,
      title: `Nhu cầu tháng ${period.month}/${period.year}: ${row.materialNameLabel}`,
      url: `/material-annual-plans/monthly?period=${period.periodKey}`,
      facts: facts({
        period: period.periodKey, group, material: row.materialNameLabel, erpCode: row.erpCode, unit: row.unitLabel,
        plannedThisYear: round(row.plannedQuantity), usedThisYear: round(row.usedQuantity), remaining: round(row.remainingQuantity),
        requestedThisMonth: round(row.requestedQuantity), stock: round(row.stockQuantity), purpose: row.purpose,
        proposer: row.proposerName, provisional: row.provisional, note: row.note,
      }),
    }));
    return {
      items,
      hasMore: rows.length > items.length,
      ...(items.length === 0 ? { message: `Không có dòng nhu cầu vật tư tháng ${period.month}/${period.year} nào khớp` } : {}),
    };
  }

  const rawYear = Number(text(input.year, 4));
  const year = Number.isInteger(rawYear) && rawYear >= 2000 && rawYear <= 2200 ? rawYear : today.year;
  const summary = await getCachedMaterialAnnualPlanSummary(prisma, year);
  const rows = summary.rows.filter((row) => contains([row.materialCategory, row.materialNameLabel, row.erpCode, row.materialCode], needle));
  const items = rows.slice(0, take).map((row) => ({
    sourceType: "MATERIAL_PLAN" as const,
    sourceId: row.id,
    title: `Kế hoạch vật tư ${year}: ${row.materialNameLabel}`,
    url: `/material-annual-plans?year=${year}`,
    facts: facts({
      year, group: row.materialCategory, material: row.materialNameLabel, erpCode: row.erpCode ?? row.materialCode,
      unit: row.unitLabel, route: row.routeLabel, planned: round(row.plannedQuantity), used: round(row.usedQuantity),
      remaining: round(row.remainingQuantity), stock: round(row.stockQuantity), note: row.note,
    }),
  }));
  return {
    items,
    hasMore: rows.length > items.length,
    ...(items.length === 0 ? { message: `Không có dòng kế hoạch vật tư năm ${year} nào khớp` } : {}),
  };
}

/**
 * TỊNH KHO HÓA CHẤT — tồn đầu/nhập/dùng/tồn cuối theo tháng (quyền `chemical-inventory-manage`,
 * cùng hàm `getMonthlyGrid` với trang `/chemical-inventory`). Số đã quy về đơn vị hiển thị.
 */
export async function aiChemicalInventory(user: AiToolUser, input: Record<string, unknown>): Promise<ToolResult> {
  const blocked = defectOnly(user);
  if (blocked) return blocked;
  if (!(await canRead(user, CHEMICAL_PERMISSION_ID))) return { items: [], message: "Không có quyền xem tồn kho hóa chất" };
  const raw = text(input.month, 7);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : vietnamToday().periodKey;
  const query = text(input.query, 100);
  const grid = await getMonthlyGrid(prisma, month, query ? { q: query } : {});
  const take = limitOf(input.limit);
  const round = (value: number | null) => value == null ? null : Math.round(value * 1000) / 1000;
  const items = grid.rows.slice(0, take).map((row) => {
    const unit = row.displayUnit ?? row.baseUnit;
    const shown = (value: number | null) => round(toDisplayUnit(value, row.baseUnit, row.displayUnit));
    return {
      sourceType: "CHEMICAL" as const,
      sourceId: `${month}:${row.itemId}`,
      title: `Hóa chất ${row.name} tháng ${month}`,
      url: `/chemical-inventory?month=${month}`,
      facts: facts({
        month, periodStatus: grid.period.exists ? grid.period.status : "Chưa mở kỳ", item: row.name, code: row.code,
        type: ITEM_TYPE_LABELS[row.itemType] ?? row.itemType, unit: UNIT_LABELS[unit] ?? unit,
        opening: shown(row.openingTotal), received: shown(row.receivedTotal), receiptCount: row.receiptCount,
        consumed: shown(row.consumedTotal), closing: shown(row.closingTotal),
        lowStockThreshold: shown(row.lowStockThreshold), tankCapacity: shown(row.tankCapacity),
        warnings: row.warnings.map((code) => WARNING_LABELS[code] ?? code).join("; "),
        nh3SpecificConsumptionKgPerMwh: /nh3/i.test(row.code) || /nh3/i.test(row.name) ? grid.specificConsumption : null,
      }),
    };
  });
  return {
    items,
    hasMore: grid.rows.length > items.length,
    ...(items.length === 0 ? { message: `Không có mặt hàng hóa chất nào khớp trong tháng ${month}` } : {}),
  };
}

// ───────────────────────────── Thư mục lưu trữ ─────────────────────────────

const ARCHIVE_CATEGORY_LABEL: Record<string, string> = {
  GRID_SEPARATION: "Dữ liệu tách lưới",
  STARTUP_DATA: "Dữ liệu khởi động",
  BOILER_CALIBRATION: "Dữ liệu hiệu chỉnh lò",
  OIL_GUN_DATA: "Dữ liệu vòi dầu",
};

async function canReadArchive(user: AiToolUser, category: string) {
  // Vòi dầu chặn cứng theo cương vị thay cho RBAC ở luồng đọc — đúng như app/api/documents và app/api/oil-guns.
  if (category === "OIL_GUN_DATA") return assertOilSootAccess(user).then(() => true, () => false);
  const permissionId = archiveCategoryPermissionId(category);
  return permissionId ? canRead(user, permissionId) : false;
}

/**
 * THƯ MỤC LƯU TRỮ — hồ sơ tách lưới, khởi động, hiệu chỉnh lò (danh sách hồ sơ + tiến trình ghi
 * tay, không đọc nội dung tệp), và tình trạng vòi dầu/vòi than ở nhóm Dữ liệu vòi dầu.
 */
export async function aiSearchArchive(user: AiToolUser, input: Record<string, unknown>): Promise<ToolResult> {
  const blocked = defectOnly(user);
  if (blocked) return blocked;
  const requested = text(input.category, 30).toUpperCase();
  const candidates = Object.hasOwn(ARCHIVE_CATEGORY_LABEL, requested) ? [requested] : Object.keys(ARCHIVE_CATEGORY_LABEL);
  const allowed = (await Promise.all(candidates.map(async (category) => (await canReadArchive(user, category)) ? category : null)))
    .filter((category): category is string => Boolean(category));
  if (!allowed.length) return { items: [], message: "Không có quyền xem nhóm lưu trữ này" };
  const query = text(input.query, 100);
  const take = limitOf(input.limit);
  const items: Array<Record<string, unknown>> = [];

  const documentCategories = allowed.filter((category) => category !== "OIL_GUN_DATA");
  if (documentCategories.length) {
    const documents = await prisma.digitalDocument.findMany({
      where: {
        category: { in: documentCategories },
        ...(query ? { OR: [{ title: insensitive(query) }, { decisionNumber: insensitive(query) }, { note: insensitive(query) }, { progress: insensitive(query) }] } : {}),
      },
      orderBy: [{ issueDate: "desc" }, { updatedAt: "desc" }],
      take,
      select: { id: true, category: true, title: true, decisionNumber: true, issueDate: true, progress: true, note: true, updatedAt: true },
    });
    for (const doc of documents) {
      items.push({
        sourceType: "ARCHIVE" as const,
        sourceId: doc.id,
        title: `${ARCHIVE_CATEGORY_LABEL[doc.category] ?? doc.category}: ${doc.title}`,
        occurredAt: (doc.issueDate ?? doc.updatedAt).toISOString(),
        url: "/documents/archive",
        facts: facts({ group: ARCHIVE_CATEGORY_LABEL[doc.category] ?? doc.category, title: doc.title, decisionNumber: doc.decisionNumber, date: doc.issueDate, progress: doc.progress, note: doc.note, updatedAt: doc.updatedAt }),
      });
    }
  }

  if (allowed.includes("OIL_GUN_DATA") && (requested === "OIL_GUN_DATA" || /voi (dau|than)|oil gun/.test(normalizeText(query)))) {
    const selectedMachine = machine(input.machine);
    const guns = await prisma.oilGun.findMany({
      where: selectedMachine && selectedMachine !== "COMMON" ? { machine: selectedMachine } : {},
      orderBy: [{ machine: "asc" }, { position: "asc" }],
      select: { id: true, machine: true, code: true, status: true, defect: true, defectSccn: true, defectScd: true, forceFlame: true, coalStatus: true, coalDefectNote: true, updatedAt: true },
    });
    const hasIssue = (gun: (typeof guns)[number]) => gun.status !== "available" || gun.coalStatus !== "available" || gun.forceFlame
      || Boolean(gun.defectSccn?.trim() || gun.defectScd?.trim() || gun.coalDefectNote?.trim());
    for (const machineKey of [...new Set(guns.map((gun) => gun.machine))]) {
      const list = guns.filter((gun) => gun.machine === machineKey);
      items.push({
        sourceType: "ARCHIVE" as const,
        sourceId: `oil-guns:${machineKey}`,
        title: `Vòi dầu, vòi than tổ máy ${machineKey}`,
        url: "/documents/archive",
        facts: {
          ...facts({
            machine: machineKey, oilGuns: list.length,
            oilAvailableNoDefect: list.filter((gun) => gun.status === "available" && !gun.defectSccn?.trim() && !gun.defectScd?.trim()).length,
            oilUnavailable: list.filter((gun) => gun.status !== "available").length,
            coalUnavailable: list.filter((gun) => gun.coalStatus !== "available").length,
          }),
          issues: list.filter(hasIssue).slice(0, 20).map((gun) => [
            gun.code,
            gun.status !== "available" ? "vòi dầu không khả dụng" : null,
            gun.defectSccn?.trim() ? `SCCN: ${gun.defectSccn.trim().slice(0, 80)}` : null,
            gun.defectScd?.trim() ? `SCĐ: ${gun.defectScd.trim().slice(0, 80)}` : null,
            gun.forceFlame ? "đang force tín hiệu ngọn lửa" : null,
            gun.coalStatus !== "available" ? "vòi than không khả dụng" : null,
            gun.coalDefectNote?.trim() ? `vòi than: ${gun.coalDefectNote.trim().slice(0, 80)}` : null,
          ].filter(Boolean).join(" · ")),
        },
      });
    }
  }

  return {
    items: items.slice(0, take),
    hasMore: items.length > take,
    ...(items.length === 0 ? { message: "Không có hồ sơ lưu trữ nào khớp trong các nhóm được xem" } : {}),
  };
}
