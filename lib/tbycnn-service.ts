/**
 * Lớp dịch vụ dùng chung cho các route `app/api/tbycnn/**`.
 *
 * Đặt riêng khỏi `lib/tbycnn.ts` (logic thuần, client cũng import) vì file này chạm
 * Prisma — kéo vào bundle client sẽ hỏng build.
 */
import type { Prisma, TbycnnEquipment } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { s3ProxyUrl } from "@/lib/s3";
import { fail } from "@/lib/api";
import { hasPermissionLevel } from "@/lib/rbac-guard";
import { normalizePosition } from "@/lib/pccc-position";
// Dùng lại nguyên hai quy tắc của PCCC: "chức danh đang làm việc" và "cấp quản lý xem
// sửa toàn phân xưởng" — hai module cùng một luật, không nên có hai bản chép.
import { pcccPositionCodesOf } from "@/lib/pccc-service";
import { positionLabelOf, type PositionCode } from "@/lib/position-catalog";
import { isUnrestrictedEquipmentPosition } from "@/lib/position-system-scopes";
import {
  computeTinhTrang,
  extractDanhMuc,
  extractNhomSo,
  parsePeriodLabel,
  parseVNDate,
  periodLabelOf,
  toIntOrNull,
  toNumberOrNull,
  trimOrNull,
} from "@/lib/tbycnn";

export const TBYCNN_PERMISSION = {
  view: "tbycnn-view",
  manage: "tbycnn-manage",
} as const;

export const TBYCNN_READ_LEVELS = ["read", "personal", "manage", "full"] as const;
export const TBYCNN_WRITE_LEVELS = ["personal", "manage", "full"] as const;

/** Thiết bị tự thêm qua giao diện chỉ xoá được trong 30 ngày (mục 6.7 của bản cũ). */
export const TBYCNN_DELETE_WINDOW_DAYS = 30;

/**
 * Kỳ đang làm việc. Chưa có kỳ nào thì tạo kỳ của tháng hiện tại — sổ luôn có chỗ ghi,
 * không bắt người dùng phải "mở kỳ" bằng tay trước khi dùng được trang.
 *
 * Pha 1 chưa có chốt sổ nên luôn chỉ có một kỳ; hàm vẫn nhận `label` để pha 2 (xem kỳ
 * đã chốt) không phải sửa lại chỗ gọi.
 */
export async function resolvePeriod(label?: string | null) {
  const wanted = trimOrNull(label);
  if (wanted) {
    const period = await prisma.tbycnnPeriod.findUnique({ where: { label: wanted } });
    if (!period) throw fail(`Không tìm thấy kỳ ${wanted}`, 404);
    return period;
  }
  const open = await prisma.tbycnnPeriod.findFirst({
    where: { isClosed: false },
    orderBy: [{ year: "desc" }, { monthNo: "desc" }],
  });
  if (open) return open;

  const current = periodLabelOf();
  const parsed = parsePeriodLabel(current)!;
  return prisma.tbycnnPeriod.create({
    data: { label: current, year: parsed.year, monthNo: parsed.monthNo },
  });
}

export function canDeleteEquipment(row: Pick<TbycnnEquipment, "sourceId" | "createdAt">, now = new Date()) {
  // sourceId != null = thiết bị gốc theo hồ sơ nhà máy → không bao giờ xoá được.
  if (row.sourceId != null) return false;
  const age = now.getTime() - row.createdAt.getTime();
  return age <= TBYCNN_DELETE_WINDOW_DAYS * 86_400_000;
}

export type TbycnnSignatureDto = {
  signerName: string;
  signerPosition: string | null;
  signedAt: string;
  signatureUrl: string | null;
};

export type TbycnnEquipmentDto = ReturnType<typeof serializeEquipment>;

/**
 * DTO cho giao diện. `tinhTrang` tính ở server để client và Excel không tự suy mỗi nơi
 * một kiểu; hai mốc kiểm định trả cả ngày đã parse lẫn chữ gốc để giao diện hiển thị
 * đúng cái người dùng đã nhập khi không phải ngày hợp lệ.
 */
export function serializeEquipment(
  row: TbycnnEquipment & { signature?: { signerName: string; signerPosition: string | null; signedAt: Date; signatureKey: string | null } | null },
  now = new Date(),
  scope?: TbycnnWriteScope
) {
  return {
    id: row.id,
    sourceId: row.sourceId,
    khuVuc: row.khuVuc,
    cuongVi: row.cuongVi,
    cuongViCode: row.cuongViCode,
    machine: row.machine,
    nhom: row.nhom,
    nhomSo: row.nhomSo,
    danhMuc: row.danhMuc,
    tt: row.tt,
    tenThietBi: row.tenThietBi,
    soLuong: row.soLuong,
    maHieu: row.maHieu,
    kks: row.kks,
    thongSoKyThuat: row.thongSoKyThuat,
    viTri: row.viTri,
    chucDanhQuanLy: row.chucDanhQuanLy,
    donViQuanLy: row.donViQuanLy,
    chuKyThu: row.chuKyThu,
    kdGanNhat: row.kdGanNhat ? row.kdGanNhat.toISOString() : null,
    kdGanNhatText: row.kdGanNhatText,
    soBbkd: row.soBbkd,
    donViKd: row.donViKd,
    kdTiepTheo: row.kdTiepTheo ? row.kdTiepTheo.toISOString() : null,
    kdTiepTheoText: row.kdTiepTheoText,
    khiemKhuyet: row.khiemKhuyet,
    soLuongKhaDung: row.soLuongKhaDung,
    soLuongKhongKhaDung: row.soLuongKhongKhaDung,
    tinhTrang: computeTinhTrang(row.soLuongKhaDung, row.soLuongKhongKhaDung),
    ghiChu: row.ghiChu,
    canDelete: canDeleteEquipment(row, now),
    // Cờ do SERVER tính: giao diện khoá sẵn ô ngoài phạm vi cương vị thay vì để người
    // dùng sửa xong mới ăn 403.
    canWrite: scope ? canWriteRow(scope, row) : false,
    signature: row.signature
      ? {
          signerName: row.signature.signerName,
          signerPosition: row.signature.signerPosition,
          signedAt: row.signature.signedAt.toISOString(),
          signatureUrl: row.signature.signatureKey ? s3ProxyUrl(row.signature.signatureKey, "chu-ky.png") : null,
        }
      : null,
  };
}

/** Thứ tự hiển thị = đúng thứ tự của file gốc: cương vị → số La Mã → STT. */
export const TBYCNN_ORDER_BY: Prisma.TbycnnEquipmentOrderByWithRelationInput[] = [
  { khuVuc: "asc" },
  { nhomSo: "asc" },
  { tt: "asc" },
  { id: "asc" },
];

/** Các trường kiểm định — luôn cho sửa, kể cả với thiết bị gốc. */
type OperationalInput = {
  chuKyThu?: unknown;
  kdGanNhatText?: unknown;
  kdTiepTheoText?: unknown;
  soBbkd?: unknown;
  donViKd?: unknown;
  soLuongKhaDung?: unknown;
  soLuongKhongKhaDung?: unknown;
  khiemKhuyet?: unknown;
  ghiChu?: unknown;
};

/** Giá trị thuần (không phải Prisma update-operation) để dùng chung cho create và update. */
export type TbycnnOperationalData = {
  chuKyThu?: number | null;
  soBbkd?: string | null;
  donViKd?: string | null;
  khiemKhuyet?: string | null;
  ghiChu?: string | null;
  soLuongKhaDung?: number | null;
  soLuongKhongKhaDung?: number | null;
  kdGanNhat?: Date | null;
  kdGanNhatText?: string | null;
  kdTiepTheo?: Date | null;
  kdTiepTheoText?: string | null;
};

/**
 * Ánh xạ phần "vận hành" của body → dữ liệu ghi. Chỉ nhận trường CÓ MẶT trong body để
 * gọi PUT với một ô không xoá trắng các ô còn lại.
 */
export function operationalData(body: OperationalInput) {
  const data: TbycnnOperationalData = {};
  if ("chuKyThu" in body) data.chuKyThu = toNumberOrNull(body.chuKyThu);
  if ("soBbkd" in body) data.soBbkd = trimOrNull(body.soBbkd);
  if ("donViKd" in body) data.donViKd = trimOrNull(body.donViKd);
  if ("khiemKhuyet" in body) data.khiemKhuyet = trimOrNull(body.khiemKhuyet);
  if ("ghiChu" in body) data.ghiChu = trimOrNull(body.ghiChu);
  if ("soLuongKhaDung" in body) data.soLuongKhaDung = toIntOrNull(body.soLuongKhaDung);
  if ("soLuongKhongKhaDung" in body) data.soLuongKhongKhaDung = toIntOrNull(body.soLuongKhongKhaDung);
  // Chữ người dùng nhập luôn được giữ; ngày chỉ là bản parse thêm để lọc/đếm quá hạn.
  if ("kdGanNhatText" in body) {
    const text = trimOrNull(body.kdGanNhatText);
    data.kdGanNhatText = text;
    data.kdGanNhat = parseVNDate(text);
  }
  if ("kdTiepTheoText" in body) {
    const text = trimOrNull(body.kdTiepTheoText);
    data.kdTiepTheoText = text;
    data.kdTiepTheo = parseVNDate(text);
  }
  return data;
}

/** Phần thông tin gốc — chỉ dùng khi THÊM MỚI (khi sửa thì các trường này bị khoá). */
export function identityData(body: Record<string, unknown>) {
  const khuVuc = String(body.khuVuc ?? "").trim();
  const pos = normalizePosition(khuVuc);
  const nhom = String(body.nhom ?? "").trim();
  return {
    khuVuc,
    cuongVi: pos.label,
    cuongViCode: pos.code,
    machine: pos.machine,
    nhom,
    nhomSo: extractNhomSo(nhom),
    danhMuc: extractDanhMuc(nhom),
    tt: toIntOrNull(body.tt),
    tenThietBi: String(body.tenThietBi ?? "").trim(),
    soLuong: toIntOrNull(body.soLuong),
    maHieu: trimOrNull(body.maHieu),
    kks: trimOrNull(body.kks),
    thongSoKyThuat: trimOrNull(body.thongSoKyThuat),
    viTri: trimOrNull(body.viTri),
    chucDanhQuanLy: trimOrNull(body.chucDanhQuanLy),
    donViQuanLy: trimOrNull(body.donViQuanLy),
  };
}

// ===========================================================================
// PHẠM VI GHI / KÝ THEO CƯƠNG VỊ
//
// Cùng luật với PCCC (lib/pccc-service.ts): quyền `tbycnn-manage` quyết định CÓ ĐƯỢC
// GHI hay không, còn PHẠM VI luôn bó theo CHỨC DANH ĐANG LÀM VIỆC — trừ cấp quản lý
// (Quản đốc / Phó QĐ / Kỹ thuật viên / Trưởng ca) và Quản trị thì ghi/ký toàn phân xưởng.
//
// Cố ý KHÔNG mở "manage/full thì sửa tất cả": mặc định RBAC cho MANAGER/SUPERVISOR/
// TECHNICIAN đều là manage, mở cổng đó là ai cũng ký được cả 709 dòng.
// ===========================================================================
export type TbycnnWriteScope = { all: boolean; codes: PositionCode[] };

const SCOPE_ALL: TbycnnWriteScope = { all: true, codes: [] };

type PositionCarrier = {
  position?: string | null;
  primaryPosition?: string | null;
  currentPosition?: string | null;
  role?: string;
  id?: string;
};

function isManagementUser(user: PositionCarrier) {
  if (user.role === "ADMIN") return true;
  return [user.currentPosition, user.primaryPosition ?? user.position].some((p) =>
    isUnrestrictedEquipmentPosition(p)
  );
}

async function computeWriteScope(user: PositionCarrier): Promise<TbycnnWriteScope | null> {
  if (isManagementUser(user)) return SCOPE_ALL;
  if (!(await hasPermissionLevel(user, TBYCNN_PERMISSION.manage, ["personal"]))) return null;
  return { all: false, codes: pcccPositionCodesOf(user) };
}

/** Ném 403 nếu không đủ quyền ghi — route gọi hàm này THAY CHO `requirePermissionLevel`. */
export async function resolveTbycnnWriteScope(
  user: PositionCarrier,
  message = "Không đủ quyền cập nhật sổ thiết bị yêu cầu nghiêm ngặt"
): Promise<TbycnnWriteScope> {
  const scope = await computeWriteScope(user);
  if (!scope) throw fail(message, 403);
  if (!scope.all && scope.codes.length === 0) {
    throw fail("Tài khoản chưa gán cương vị nên chưa ghi được sổ TBYCNN — nhờ quản trị gán cương vị.", 403);
  }
  return scope;
}

/**
 * Bản KHÔNG ném, cho route GET: giao diện khoá sẵn dòng ngoài phạm vi thay vì để người
 * dùng sửa xong mới ăn 403.
 */
export async function tbycnnWriteScopeOf(user: PositionCarrier) {
  const scope = (await computeWriteScope(user)) ?? { all: false, codes: [] };
  return { all: scope.all, codes: scope.codes as string[], labels: scope.codes.map((c) => positionLabelOf(c)) };
}

/** Điều kiện `where` của phạm vi — dùng chung cho sửa hàng loạt và ký. */
export function scopeWhere(scope: TbycnnWriteScope): Prisma.TbycnnEquipmentWhereInput {
  return scope.all ? {} : { cuongViCode: { in: scope.codes } };
}

export function canWriteRow(scope: TbycnnWriteScope, row: { cuongViCode: string | null }) {
  return scope.all || (row.cuongViCode != null && scope.codes.includes(row.cuongViCode as PositionCode));
}

export function assertTbycnnScope(scope: TbycnnWriteScope, row: { cuongViCode: string | null }) {
  if (!canWriteRow(scope, row)) {
    throw fail("Thiết bị này không thuộc cương vị quản lý của bạn", 403);
  }
}

/** Đường dẫn để người dùng bấm sang thêm chữ ký số. */
export const TBYCNN_SIGNATURE_SETUP_URL = "/account";

/** Chữ ký số của người ký — CHỈ nhận S3 key, xem lib/pccc-service.ts về lý do. */
export async function signatureKeyOfUser(userId: string): Promise<string | null> {
  const found = await prisma.user.findUnique({ where: { id: userId }, select: { signatureKey: true } });
  return found?.signatureKey ?? null;
}
