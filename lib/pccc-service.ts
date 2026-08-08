/**
 * Lớp nghiệp vụ dùng chung cho các API route của module PCCC.
 *
 * Ba quy tắc gốc của quy trình giấy được đặt ở ĐÂY để mọi route đều tuân thủ,
 * không nhân bản logic:
 *  1. Kỳ đã CHỐT — hoặc CHƯA TỚI THÁNG — thì không sửa/ký được.
 *  2. SỬA bất kỳ trường nào của dòng/bảng → XOÁ chữ ký của dòng/bảng đó, buộc ký lại.
 *  3. PHẠM VI GHI/KÝ theo cương vị: mức quyền `personal` chỉ đụng được dòng thuộc
 *     cương vị của chính mình (xem khối "Phạm vi ghi/ký" bên dưới).
 *  4. PHẠM VI XEM cũng theo cương vị: người không phải cấp quản lý chỉ THẤY dòng thuộc
 *     cương vị của mình (xem khối "Phạm vi xem" bên dưới).
 */
import { prisma } from "@/lib/prisma";
import { fail } from "@/lib/api";
import { hasPermissionLevel } from "@/lib/rbac-guard";
import { isPcccMachine, normalizePosition } from "@/lib/pccc-position";
import { isFuturePeriod, periodLabelOf, vietnamClock } from "@/lib/pccc-clock";
import { s3ProxyUrl } from "@/lib/s3";
import { positionLabelOf, type PositionCode } from "@/lib/position-catalog";

export type PcccTargetType = "EXTINGUISHER" | "CABINET" | "BULK" | "FM200_PANEL";

export const PCCC_PERMISSION = {
  view: "pccc-view",
  manage: "pccc-manage",
  close: "pccc-close-period",
} as const;

/**
 * Kỳ đang xem: theo `label` nếu có; không truyền thì lấy **kỳ của tháng hiện tại**, chứ
 * KHÔNG phải kỳ mới nhất. Kỳ mới nhất có thể là kỳ của tháng chưa tới (dữ liệu cũ còn
 * sót kỳ sinh sớm) — mặc định vào đó là cả trang làm việc nhầm tháng.
 */
export async function resolvePeriod(label?: string | null) {
  if (label) {
    const found = await prisma.pcccPeriod.findUnique({ where: { label } });
    if (!found) throw fail(`Không có kỳ ${label}`, 404);
    return found;
  }
  const clock = vietnamClock();
  const period =
    (await prisma.pcccPeriod.findUnique({ where: { label: periodLabelOf(clock.year, clock.month) } })) ??
    // Chưa có kỳ tháng này thì lùi về kỳ gần nhất ĐÃ TỚI, không nhảy lên kỳ tương lai.
    (await prisma.pcccPeriod.findFirst({
      where: { OR: [{ year: { lt: clock.year } }, { year: clock.year, monthNo: { lte: clock.month } }] },
      orderBy: [{ year: "desc" }, { monthNo: "desc" }],
    })) ??
    (await prisma.pcccPeriod.findFirst({ orderBy: [{ year: "desc" }, { monthNo: "desc" }] }));
  if (!period) throw fail("Chưa có kỳ dữ liệu PCCC nào", 404);
  return period;
}

/**
 * Lý do kỳ này không ghi được, hoặc null nếu ghi được. Dạng trả-về-chuỗi để hai route
 * lưu-theo-lượt báo lỗi theo từng dòng thay vì ném cả lượt.
 *
 * HAI cửa chặn, không phải một:
 *  - kỳ **đã chốt** → chỉ đọc, số liệu đã xuất Excel lưu trữ;
 *  - kỳ **chưa tới** → ghi kết quả kiểm tra cho tháng chưa bắt đầu là sai nghiệp vụ.
 *    Dữ liệu cũ còn sót kỳ sinh sớm bằng nút "Sinh kỳ mới" ngày trước, nên đây không
 *    phải trường hợp giả định.
 */
export function periodWriteBlockReason(period: { isClosed: boolean; label: string; year: number; monthNo: number }) {
  if (period.isClosed) return `Kỳ ${period.label} đã chốt, không sửa được`;
  if (isFuturePeriod(period)) {
    return `Kỳ ${period.label} chưa bắt đầu — chỉ ghi được từ ngày 01/${String(period.monthNo).padStart(2, "0")}/${period.year}`;
  }
  return null;
}

/** Bản ném 409 — dùng cho các route sửa một dòng. */
export function assertPeriodWritable(period: { isClosed: boolean; label: string; year: number; monthNo: number }) {
  const reason = periodWriteBlockReason(period);
  if (reason) throw fail(reason, 409);
}

/** Xoá chữ ký của đúng một mục tiêu (dòng hoặc bảng). */
export async function clearSignature(targetType: PcccTargetType, targetId: string) {
  await prisma.pcccSignature.deleteMany({ where: { targetType, targetId } });
}

export async function signaturesOf(periodId: string, targetType: PcccTargetType) {
  const rows = await prisma.pcccSignature.findMany({
    where: { periodId, targetType },
    select: { targetId: true, signerName: true, signerPosition: true, signedAt: true, signatureKey: true },
  });
  // Ảnh chữ ký phục vụ qua proxy theo key, KHÔNG nhúng base64 vào payload danh sách:
  // bảng 747 dòng mà mỗi dòng kèm một ảnh base64 là payload phình lên hàng MB.
  return new Map(
    rows.map((r) => [
      r.targetId,
      { ...r, signatureUrl: r.signatureKey ? s3ProxyUrl(r.signatureKey, "chu-ky.png") : null },
    ])
  );
}

/**
 * Ảnh chữ ký số của người đang ký, lấy từ hồ sơ cá nhân (trang Tài khoản → Chữ ký số).
 *
 * KHÔNG có chữ ký thì KHÔNG cho ký: chữ ký trong hồ sơ PCCC là bằng chứng ai đã kiểm
 * tra, ghi mỗi cái tên thì không khác gì gõ tay. Trả về `null` để phía gọi hiện lời nhắc
 * kèm đường dẫn sang trang Tài khoản, thay vì ném lỗi kỹ thuật khó hiểu.
 */
export async function signatureKeyOfUser(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { signatureKey: true },
  });
  // CHỈ nhận S3 key, không nhận `signatureUrl` dạng base64 của hồ sơ kiểu cũ: một chữ ký
  // base64 nặng ~20KB, nhân với 747 dòng ký một lượt là chép 15MB chuỗi vào DB. Trang Tài
  // khoản luôn đẩy chữ ký lên S3 khi lưu (`signatureUpdate`), nên hồ sơ cũ chỉ cần mở ra
  // lưu lại một lần là có key.
  return user?.signatureKey ?? null;
}

/** Đường dẫn để người dùng bấm sang thêm chữ ký. */
export const PCCC_SIGNATURE_SETUP_URL = "/account";

/** Chỉ nhận đúng các trường cho phép sửa, ép kiểu theo khai báo. */
export type FieldSpec = Record<string, "string" | "number" | "date" | "boolean">;

export function pickFields(body: Record<string, unknown>, spec: FieldSpec) {
  const out: Record<string, unknown> = {};
  for (const [key, kind] of Object.entries(spec)) {
    if (!(key in body)) continue;
    const raw = body[key];
    if (raw === null || raw === "") {
      out[key] = null;
      continue;
    }
    if (kind === "string") out[key] = String(raw).trim() || null;
    else if (kind === "number") {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw fail(`Giá trị không phải số: ${key}`);
      out[key] = n;
    } else if (kind === "boolean") out[key] = Boolean(raw);
    else {
      const d = new Date(String(raw));
      if (Number.isNaN(d.getTime())) throw fail(`Ngày không hợp lệ: ${key}`);
      out[key] = d;
    }
  }
  return out;
}

/**
 * Danh sách cương vị có trong kỳ, dạng (mã, nhãn) — dùng cho ô lọc và ô chọn khi sửa.
 * Trả về MÃ để phía client lọc theo mã chứ không theo nhãn: đổi cách viết nhãn về sau
 * không làm sai bộ lọc hay lịch sử.
 *
 * `view` cắt danh sách theo phạm vi XEM: người chỉ thấy cương vị của mình thì ô lọc
 * cũng chỉ được liệt kê đúng cương vị đó — bày ra cương vị chọn vào cũng ra bảng rỗng
 * thì chỉ khiến người dùng tưởng mất dữ liệu.
 */
export async function cuongViListOf(periodId: string, view: PcccViewScope = PCCC_SCOPE_ALL) {
  const [bcc, tcc, fcd] = await Promise.all([
    prisma.pcccExtinguisher.findMany({
      where: { periodId },
      distinct: ["cuongViCode"],
      select: { cuongViCode: true, cuongVi: true },
    }),
    prisma.pcccCabinet.findMany({
      where: { periodId },
      distinct: ["cuongViCode"],
      select: { cuongViCode: true, cuongVi: true },
    }),
    prisma.pcccBulk.findMany({
      where: { periodId },
      distinct: ["cuongViCode"],
      select: { cuongViCode: true, cuongVi: true },
    }),
  ]);
  const byCode = new Map<string, string>();
  for (const r of [...bcc, ...tcc, ...fcd]) {
    if (!r.cuongViCode || !r.cuongVi) continue;
    if (!view.all && !view.codes.includes(r.cuongViCode as PositionCode)) continue;
    byCode.set(r.cuongViCode, r.cuongVi);
  }
  return [...byCode.entries()]
    .map(([code, label]) => ({ code, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "vi"));
}

/** Danh sách cấp giám sát có trong kỳ (chỉ BCC có cột này), cắt theo phạm vi XEM. */
export async function giamSatListOf(periodId: string, view: PcccViewScope = PCCC_SCOPE_ALL) {
  const rows = await prisma.pcccExtinguisher.findMany({
    where: { periodId, ...(view.all ? {} : { cuongViCode: { in: view.codes } }) },
    distinct: ["nguoiGiamSatCode"],
    select: { nguoiGiamSatCode: true, nguoiGiamSat: true },
  });
  return rows
    .filter((r) => r.nguoiGiamSatCode && r.nguoiGiamSat)
    .map((r) => ({ code: r.nguoiGiamSatCode as string, label: r.nguoiGiamSat as string }))
    .sort((a, b) => a.label.localeCompare(b.label, "vi"));
}

/**
 * Điều kiện lọc dùng chung cho cả 4 bảng: theo MÃ cương vị và theo TỔ MÁY.
 * Tổ máy là bộ lọc XEM, không phải rào quyền — cùng một chức danh vận hành được cả
 * hai tổ máy (xem lib/pccc-position.ts).
 *
 * `view` là PHẠM VI XEM của người đăng nhập và LUÔN THẮNG bộ lọc người dùng chọn: đây
 * là rào quyền, không phải tiện ích. Tham số bắt buộc (không có mặc định) để một route
 * đọc mới quên truyền là lỗi biên dịch chứ không phải lỗ hổng âm thầm — muốn xem toàn
 * bộ thì phải viết rõ `PCCC_SCOPE_ALL`.
 */
export function scopeWhere(cuongViCode: string | null | undefined, machine: string | null | undefined, view: PcccViewScope) {
  const picked = cuongViCode && cuongViCode !== "ALL" ? cuongViCode : null;
  // Ngoài phạm vi thì giao lại thành rỗng → `in: []` → không ra dòng nào, thay vì âm
  // thầm nới bộ lọc thành "xem tất".
  const cuongViWhere = view.all
    ? picked
      ? { cuongViCode: picked }
      : {}
    : { cuongViCode: { in: picked ? view.codes.filter((code) => code === picked) : view.codes } };
  return {
    ...cuongViWhere,
    ...(isPcccMachine(machine) ? { machine } : {}),
  };
}

// ===========================================================================
// PHẠM VI GHI/KÝ THEO CƯƠNG VỊ (quy tắc 3)
//
// GHI/KÝ thu hẹp theo MỨC QUYỀN có sẵn của hệ thống, không đẻ thêm bảng phân quyền
// riêng:
//
//   `pccc-manage` = manage/full  → ghi/ký mọi cương vị (Trưởng ca, quản lý, ADMIN)
//   `pccc-manage` = personal     → chỉ ghi/ký dòng thuộc cương vị CỦA MÌNH
//   thấp hơn                     → không ghi được (403 như trước)
//
// Ba điểm đã chốt với nghiệp vụ (2026-08-07):
//  1. Lấy TẤT CẢ cương vị được gán (chính + 2 kiêm nhiệm + cương vị đang làm việc),
//     không chỉ `currentPosition`: người dùng quên chuyển cương vị đang làm việc thì
//     vẫn phải ghi được — cùng tinh thần với việc bỏ qua tổ máy khi phân quyền.
//  2. So khớp theo MÃ chức danh, KHÔNG theo tổ máy: `Lò phó` đụng được cả S1 và S2.
//  3. Dòng chưa gán cương vị (`cuongViCode` null) thì mức `personal` KHÔNG đụng được —
//     buộc quản lý gán cương vị trước, tránh dòng vô chủ ai cũng sửa.
// ===========================================================================

/** `all` = ghi mọi cương vị; ngược lại chỉ các mã trong `codes`. */
export type PcccWriteScope = { all: boolean; codes: PositionCode[] };

/** Cùng hình dạng với phạm vi ghi, nhưng dùng cho phần XEM (xem khối "Phạm vi xem"). */
export type PcccViewScope = PcccWriteScope;

export const PCCC_SCOPE_ALL: PcccWriteScope = { all: true, codes: [] };

type PcccPositionCarrier = {
  position?: string | null;
  primaryPosition?: string | null;
  secondaryPosition?: string | null;
  secondaryPosition2?: string | null;
  currentPosition?: string | null;
};

/** Mã chức danh của người đăng nhập — gộp cương vị chính, kiêm nhiệm và đang làm việc. */
export function pcccPositionCodesOf(user: PcccPositionCarrier): PositionCode[] {
  const codes = new Set<PositionCode>();
  for (const raw of [
    user.primaryPosition ?? user.position,
    user.secondaryPosition,
    user.secondaryPosition2,
    user.currentPosition,
  ]) {
    // normalizePosition tự bỏ hậu tố tổ máy khi tra danh mục ("LÒ PHÓ S1" → Lò phó).
    const code = normalizePosition(raw).code;
    if (code) codes.add(code);
  }
  return [...codes];
}

/** null = không có quyền ghi. Tách riêng để bản ném và bản không ném dùng chung một luật. */
async function computePcccWriteScope(
  user: PcccPositionCarrier & { id?: string; role?: string }
): Promise<PcccWriteScope | null> {
  if (await hasPermissionLevel(user, PCCC_PERMISSION.manage, ["manage", "full"])) return PCCC_SCOPE_ALL;
  if (!(await hasPermissionLevel(user, PCCC_PERMISSION.manage, ["personal"]))) return null;
  return { all: false, codes: pcccPositionCodesOf(user) };
}

/**
 * Phạm vi ghi/ký của người đăng nhập. Ném 403 luôn nếu không đủ quyền ghi, nên route
 * gọi hàm này THAY CHO `requirePermissionLevel(..., manage)`.
 */
export async function resolvePcccWriteScope(
  user: PcccPositionCarrier & { id?: string; role?: string },
  message = "Không đủ quyền sửa dữ liệu PCCC"
): Promise<PcccWriteScope> {
  const scope = await computePcccWriteScope(user);
  if (!scope) throw fail(message, 403);
  if (!scope.all && scope.codes.length === 0) {
    throw fail("Tài khoản chưa gán cương vị nên chưa ghi được dữ liệu PCCC — nhờ quản trị gán cương vị.", 403);
  }
  return scope;
}

/**
 * Bản KHÔNG ném, dùng cho các route GET: trả kèm danh sách để UI khoá sẵn những dòng
 * ngoài phạm vi, thay vì để người dùng sửa xong mới ăn 403.
 * Không có quyền ghi → `{ all: false, codes: [] }` = không dòng nào sửa được.
 */
export async function pcccWriteScopeOf(user: PcccPositionCarrier & { id?: string; role?: string }) {
  const scope = (await computePcccWriteScope(user)) ?? { all: false, codes: [] };
  return {
    all: scope.all,
    codes: scope.codes as string[],
    labels: scope.codes.map((code) => positionLabelOf(code)),
    // Để client khoá sẵn các ô chỉ ADMIN sửa được. Cờ do SERVER tính vì nó phụ thuộc chế
    // độ quản trị đang bật/tắt, thứ mà client không tự suy ra đúng được.
    admin: isPcccAdmin(user),
  };
}

// ===========================================================================
// PHẠM VI XEM THEO CƯƠNG VỊ (quy tắc 4)
//
// Trước đây XEM không giới hạn (ai vào cũng thấy cả nhà máy), chỉ GHI mới thu hẹp.
// Nghiệp vụ đã chốt lại (2026-08-08): người dùng thường CHỈ THẤY dòng thuộc cương vị
// của mình — bảng vài nghìn dòng của cương vị khác vừa không phải việc của họ, vừa làm
// rối phần việc thật.
//
// Ai được xem toàn cảnh — thoả MỘT trong hai là đủ:
//   `pccc-view`   = manage/full → cửa dành riêng cho tài khoản chỉ-đọc cần xem tất
//                                 (vd lãnh đạo, tài khoản báo cáo) mà không cho ghi;
//   `pccc-manage` = manage/full → đã ghi được mọi cương vị thì đương nhiên xem được.
// Còn lại → chỉ cương vị của mình. Chưa gán cương vị thì `codes` rỗng và KHÔNG thấy
// dòng nào — cùng tinh thần với phạm vi ghi, buộc quản trị gán cương vị trước.
//
// Dòng chưa gán cương vị (`cuongViCode` null) cũng không lọt vào `in: [...]`, nên chỉ
// cấp quản lý mới thấy — đúng như luật ghi.
// ===========================================================================

export async function resolvePcccViewScope(
  user: PcccPositionCarrier & { id?: string; role?: string }
): Promise<PcccViewScope> {
  if (await hasPermissionLevel(user, PCCC_PERMISSION.view, ["manage", "full"])) return PCCC_SCOPE_ALL;
  if (await hasPermissionLevel(user, PCCC_PERMISSION.manage, ["manage", "full"])) return PCCC_SCOPE_ALL;
  return { all: false, codes: pcccPositionCodesOf(user) };
}

/** Bản gọn cho client hiển thị nhãn "Chỉ xem: …". */
export function pcccViewScopeMeta(scope: PcccViewScope) {
  return { all: scope.all, codes: scope.codes as string[], labels: scope.codes.map((code) => positionLabelOf(code)) };
}

/** Lý do dòng nằm ngoài phạm vi, hoặc null nếu được ghi. Dạng trả-về-lỗi để lưu theo lượt báo lỗi từng dòng. */
export function pcccScopeDenial(scope: PcccWriteScope, row: { cuongViCode?: string | null }): string | null {
  if (scope.all) return null;
  if (!row.cuongViCode) return "Dòng chưa gán cương vị — chỉ cấp quản lý mới sửa được";
  if (!scope.codes.includes(row.cuongViCode as PositionCode)) {
    return `Ngoài phạm vi cương vị của bạn (dòng thuộc ${positionLabelOf(row.cuongViCode)})`;
  }
  return null;
}

// ===========================================================================
// TRƯỜNG CHỈ ADMIN ĐƯỢC SỬA
//
// Hai nhóm, đều KHÔNG phải số liệu kiểm tra hằng tháng nên người đi kiểm tra không có
// việc gì phải gõ tay vào:
//
//  1. PHÂN CÔNG — cương vị quản lý, cấp giám sát, tổ máy, đơn vị tính. Đây là dữ liệu
//     gốc của thiết bị; sửa nó là đổi luôn ai được ghi/ký dòng đó (quy tắc 3), nên để
//     người dùng thường sửa là tự mở cửa hậu cho phân quyền.
//  2. DẤU KIỂM TRA — ngày/người kiểm tra, ngày/người chốt. Mấy ô này do THAO TÁC KÝ tự
//     điền; gõ tay được thì chữ ký hết còn là bằng chứng ai đã đi kiểm tra.
//
// ADMIN vẫn sửa được tất cả để còn chữa dữ liệu sai. Dùng `user.role` (đã tính chế độ
// quản trị) chứ không phải `systemRole` — đúng nếp của cả hệ thống: ADMIN tắt chế độ
// quản trị thì thao tác như MANAGER.
// ===========================================================================

const ADMIN_ONLY_FIELD_LABELS: Record<string, string> = {
  cuongVi: "Cương vị quản lý",
  cuongViCode: "Cương vị quản lý",
  machine: "Tổ máy",
  nguoiGiamSat: "Cấp giám sát",
  nguoiGiamSatCode: "Cấp giám sát",
  dvt: "ĐVT",
  ngayKiemTra: "Ngày kiểm tra",
  nguoiKiemTra: "Người kiểm tra",
  ngayChot: "Ngày chốt",
  nguoiChot: "Người chốt",
};

export function isPcccAdmin(user: { role?: string }) {
  return user.role === "ADMIN";
}

/** Lý do bản vá bị từ chối, hoặc null nếu hợp lệ. Dạng chuỗi để lưu-theo-lượt báo theo dòng. */
export function adminOnlyDenial(user: { role?: string }, data: Record<string, unknown>): string | null {
  if (isPcccAdmin(user)) return null;
  const fields = [
    ...new Set(Object.keys(data).filter((k) => k in ADMIN_ONLY_FIELD_LABELS).map((k) => ADMIN_ONLY_FIELD_LABELS[k])),
  ];
  return fields.length === 0 ? null : `Chỉ quản trị viên mới sửa được: ${fields.join(", ")}`;
}

/** Bản ném 403 — dùng cho các route sửa 1 dòng. */
export function assertAdminOnlyFields(user: { role?: string }, data: Record<string, unknown>) {
  const denial = adminOnlyDenial(user, data);
  if (denial) throw fail(denial, 403);
}

/** Bản ném 403 — dùng cho các route sửa 1 dòng. */
export function assertPcccScope(scope: PcccWriteScope, row: { cuongViCode?: string | null }) {
  const denial = pcccScopeDenial(scope, row);
  if (denial) throw fail(denial, 403);
}

/**
 * Chặn CHUYỂN dòng ra ngoài phạm vi: người ở mức `personal` sửa ô "Cương vị quản lý"
 * thành cương vị khác là tự tay đẩy dòng khỏi tầm với của mình (và trao cho người
 * khác). Gọi SAU `normalizePositionPatch` để soi đúng mã đã chuẩn hoá.
 */
export function pcccScopeMoveDenial(scope: PcccWriteScope, data: Record<string, unknown>): string | null {
  if (scope.all || !("cuongViCode" in data)) return null;
  const next = data.cuongViCode as string | null;
  if (!next || !scope.codes.includes(next as PositionCode)) {
    return "Không chuyển được dòng sang cương vị ngoài phạm vi của bạn";
  }
  return null;
}

/** Bản ném 403 của `pcccScopeMoveDenial` — dùng cho các route sửa 1 dòng. */
export function assertPcccScopePatch(scope: PcccWriteScope, data: Record<string, unknown>) {
  const denial = pcccScopeMoveDenial(scope, data);
  if (denial) throw fail(denial, 403);
}

/**
 * Sinh kỳ mới từ kỳ trước: sao chép toàn bộ bản ghi rồi XOÁ ngày/người kiểm tra và
 * chữ ký — mô phỏng `createNextMonthFrom()` của bản web demo.
 */
export async function createNextPeriodFrom(sourceLabel: string) {
  const source = await prisma.pcccPeriod.findUnique({ where: { label: sourceLabel } });
  if (!source) throw fail(`Không có kỳ ${sourceLabel}`, 404);

  const nextMonth = source.monthNo === 12 ? 1 : source.monthNo + 1;
  const nextYear = source.monthNo === 12 ? source.year + 1 : source.year;
  const label = `T${String(nextMonth).padStart(2, "0")}.${nextYear}`;
  if (await prisma.pcccPeriod.findUnique({ where: { label } })) throw fail(`Kỳ ${label} đã tồn tại`, 409);

  const [extinguishers, cabinets, bulks, panels] = await Promise.all([
    prisma.pcccExtinguisher.findMany({ where: { periodId: source.id } }),
    prisma.pcccCabinet.findMany({ where: { periodId: source.id }, include: { components: true } }),
    prisma.pcccBulk.findMany({ where: { periodId: source.id } }),
    prisma.pcccFm200Panel.findMany({ where: { periodId: source.id } }),
  ]);

  return prisma.$transaction(async (tx) => {
    const period = await tx.pcccPeriod.create({ data: { label, year: nextYear, monthNo: nextMonth } });

    await tx.pcccExtinguisher.createMany({
      data: extinguishers.map(({ id, periodId, createdAt, updatedAt, ngayKiemTra, nguoiKiemTra, ...rest }) => ({
        ...rest,
        periodId: period.id,
        ngayKiemTra: null,
        nguoiKiemTra: null,
      })),
    });

    for (const cab of cabinets) {
      const { id, periodId, createdAt, updatedAt, components, ngayKiemTra, nguoiKiemTra, ...rest } = cab;
      const created = await tx.pcccCabinet.create({
        data: { ...rest, periodId: period.id, ngayKiemTra: null, nguoiKiemTra: null },
      });
      await tx.pcccCabinetComponent.createMany({
        data: components.map(({ id: _cid, cabinetId, ...c }) => ({ ...c, cabinetId: created.id })),
      });
    }

    await tx.pcccBulk.createMany({
      data: bulks.map(({ id, periodId, createdAt, updatedAt, ngayChot, nguoiChot, ...rest }) => ({
        ...rest,
        periodId: period.id,
        ngayChot: null,
        nguoiChot: null,
      })),
    });

    await tx.pcccFm200Panel.createMany({
      data: panels.map(({ id, periodId, createdAt, updatedAt, ngayKiemTra, nguoiKiemTra, ...rest }) => ({
        ...rest,
        periodId: period.id,
        mucValues: rest.mucValues as object,
        apValues: rest.apValues as object,
        ngayKiemTra: null,
        nguoiKiemTra: null,
      })),
    });

    return period;
  });
}

/**
 * Khi người dùng sửa ô cương vị / cấp giám sát / tổ máy trên web: chuẩn hoá lại nhãn
 * + mã + tổ máy để dữ liệu luôn nằm trong danh mục chức danh, không sinh giá trị lạ.
 * Tổ máy lấy từ `data.machine` nếu người dùng đổi, ngược lại giữ giá trị đang lưu.
 */
export function normalizePositionPatch(
  data: Record<string, unknown>,
  current: { cuongVi?: string | null; machine?: string | null; nguoiGiamSat?: string | null },
  options: { withGiamSat?: boolean } = {}
) {
  if ("cuongVi" in data || "machine" in data) {
    const machine = "machine" in data ? (data.machine as string | null) : current.machine;
    const raw = "cuongVi" in data ? (data.cuongVi as string | null) : current.cuongVi;
    const res = normalizePosition(raw, machine);
    data.cuongVi = res.label;
    data.cuongViCode = res.code;
    data.machine = res.machine;
  }
  if (options.withGiamSat && "nguoiGiamSat" in data) {
    const res = normalizePosition(data.nguoiGiamSat as string | null);
    data.nguoiGiamSat = res.label;
    data.nguoiGiamSatCode = res.code;
  }
  return data;
}
