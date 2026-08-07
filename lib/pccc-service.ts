/**
 * Lớp nghiệp vụ dùng chung cho các API route của module PCCC.
 *
 * Hai quy tắc gốc của quy trình giấy được đặt ở ĐÂY để mọi route đều tuân thủ,
 * không nhân bản logic:
 *  1. Kỳ đã CHỐT thì không sửa/ký được nữa.
 *  2. SỬA bất kỳ trường nào của dòng/bảng → XOÁ chữ ký của dòng/bảng đó, buộc ký lại.
 */
import { prisma } from "@/lib/prisma";
import { fail } from "@/lib/api";
import { isPcccMachine, normalizePosition } from "@/lib/pccc-position";

export type PcccTargetType = "EXTINGUISHER" | "CABINET" | "BULK" | "FM200_PANEL";

export const PCCC_PERMISSION = {
  view: "pccc-view",
  manage: "pccc-manage",
  close: "pccc-close-period",
} as const;

/** Kỳ đang xem: theo `label` nếu có, ngược lại kỳ mới nhất. */
export async function resolvePeriod(label?: string | null) {
  const period = label
    ? await prisma.pcccPeriod.findUnique({ where: { label } })
    : await prisma.pcccPeriod.findFirst({ orderBy: [{ year: "desc" }, { monthNo: "desc" }] });
  if (!period) throw fail(label ? `Không có kỳ ${label}` : "Chưa có kỳ dữ liệu PCCC nào", 404);
  return period;
}

export function assertPeriodOpen(period: { isClosed: boolean; label: string }) {
  if (period.isClosed) throw fail(`Kỳ ${period.label} đã chốt, không sửa được`, 409);
}

/** Xoá chữ ký của đúng một mục tiêu (dòng hoặc bảng). */
export async function clearSignature(targetType: PcccTargetType, targetId: string) {
  await prisma.pcccSignature.deleteMany({ where: { targetType, targetId } });
}

export async function signaturesOf(periodId: string, targetType: PcccTargetType) {
  const rows = await prisma.pcccSignature.findMany({
    where: { periodId, targetType },
    select: { targetId: true, signerName: true, signerPosition: true, signedAt: true },
  });
  return new Map(rows.map((r) => [r.targetId, r]));
}

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
 */
export async function cuongViListOf(periodId: string) {
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
    byCode.set(r.cuongViCode, r.cuongVi);
  }
  return [...byCode.entries()]
    .map(([code, label]) => ({ code, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "vi"));
}

/** Danh sách cấp giám sát có trong kỳ (chỉ BCC có cột này). */
export async function giamSatListOf(periodId: string) {
  const rows = await prisma.pcccExtinguisher.findMany({
    where: { periodId },
    distinct: ["nguoiGiamSatCode"],
    select: { nguoiGiamSatCode: true, nguoiGiamSat: true },
  });
  return rows
    .filter((r) => r.nguoiGiamSatCode && r.nguoiGiamSat)
    .map((r) => ({ code: r.nguoiGiamSatCode as string, label: r.nguoiGiamSat as string }))
    .sort((a, b) => a.label.localeCompare(b.label, "vi"));
}

/**
 * Điều kiện lọc dùng chung cho cả 3 bảng: theo MÃ cương vị và theo TỔ MÁY.
 * Tổ máy là bộ lọc XEM, không phải rào quyền — cùng một chức danh vận hành được cả
 * hai tổ máy (xem lib/pccc-position.ts).
 */
export function scopeWhere(cuongViCode?: string | null, machine?: string | null) {
  return {
    ...(cuongViCode && cuongViCode !== "ALL" ? { cuongViCode } : {}),
    ...(isPcccMachine(machine) ? { machine } : {}),
  };
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
