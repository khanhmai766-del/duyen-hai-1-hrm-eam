import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import {
  adminOnlyDenial,
  normalizePositionPatch,
  pcccScopeDenial,
  periodWriteBlockReason,
  pcccScopeMoveDenial,
  pickFields,
  resolvePcccWriteScope,
  type FieldSpec,
} from "@/lib/pccc-service";
import { apSuatOptions, normalizeChungLoai, resolveTinhTrang } from "@/lib/pccc-status";

export const dynamic = "force-dynamic";

/**
 * Lưu MỘT LƯỢT nhiều dòng bình chữa cháy — dùng cho chế độ "Sửa bảng" trên web:
 * người dùng mở khoá bảng, sửa nhiều ô, rồi bấm Lưu một lần.
 *
 * Ba bảo đảm (thiếu một trong ba là nguy hiểm hơn lưu từng ô):
 *  1. CHỐNG GHI ĐÈ: mỗi dòng gửi kèm `updatedAt` đọc được lúc mở khoá. Nếu dòng đã bị
 *     người khác sửa trong lúc đó → TỪ CHỐI dòng đó và nói rõ, không ghi đè âm thầm.
 *  2. TOÀN VẸN: validate hết trước, ghi trong MỘT transaction — không lưu nửa vời.
 *  3. BÁO LỖI THEO DÒNG: trả về danh sách mã thiết bị + lý do để UI hiện đúng ô sai.
 */

const EDITABLE: FieldSpec = {
  chungLoai: "string",
  viTri: "string",
  cuongVi: "string",
  machine: "string",
  nguoiGiamSat: "string",
  sl: "number",
  dvt: "string",
  tinhTrang: "string",
  apSuat: "string",
  viTriHienTai: "string",
  tinhTrangNgoai: "string",
  nguonGoc: "string",
  thoiGianThayGanNhat: "date",
  ngaySx: "date",
  thoiGianSd: "number",
  ngayKiemTra: "date",
  nguoiKiemTra: "string",
  ghiChu: "string",
};

function computeDenHan(ngaySx: Date | null, namSuDung: number | null) {
  if (!ngaySx || namSuDung === null) return null;
  const d = new Date(ngaySx.getTime());
  d.setUTCMonth(d.getUTCMonth() + Math.round(namSuDung * 12));
  return d;
}

type BulkItem = { id: string; updatedAt?: string; patch: Record<string, unknown> };

// POST /api/pccc/extinguishers/bulk  { items: [{ id, updatedAt, patch }] }
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const scope = await resolvePcccWriteScope(user);

    const body = (await req.json()) as { items?: BulkItem[] };
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) return fail("Không có thay đổi nào để lưu");
    if (items.length > 500) return fail("Quá nhiều dòng trong một lượt lưu (tối đa 500)");

    const rows = await prisma.pcccExtinguisher.findMany({
      where: { id: { in: items.map((i) => i.id) } },
      include: { period: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));

    // ---- Giai đoạn 1: validate TẤT CẢ, chưa ghi gì
    const errors: { id: string; ma?: string; message: string }[] = [];
    const writes: { id: string; ma: string; data: Record<string, unknown>; changed: string[]; before: unknown }[] = [];
    let adjusted = 0;

    for (const item of items) {
      const current = byId.get(item.id);
      if (!current) {
        errors.push({ id: item.id, message: "Dòng không còn tồn tại" });
        continue;
      }
      // Kỳ đã chốt HOẶC chưa tới tháng đều không ghi được (xem periodWriteBlockReason).
      const periodBlock = periodWriteBlockReason(current.period);
      if (periodBlock) {
        errors.push({ id: item.id, ma: current.ma, message: periodBlock });
        continue;
      }
      // Phạm vi cương vị: báo theo dòng để người dùng thấy đúng dòng nào không đụng được
      const denial = pcccScopeDenial(scope, current);
      if (denial) {
        errors.push({ id: item.id, ma: current.ma, message: denial });
        continue;
      }
      // (1) chống ghi đè: dòng đã bị người khác sửa sau khi mở khoá
      if (item.updatedAt && new Date(item.updatedAt).getTime() !== current.updatedAt.getTime()) {
        errors.push({
          id: item.id,
          ma: current.ma,
          message: "Người khác vừa sửa dòng này — hãy Làm mới rồi sửa lại",
        });
        continue;
      }

      let data: Record<string, unknown>;
      try {
        data = normalizePositionPatch(pickFields(item.patch, EDITABLE), current, { withGiamSat: true });
      } catch (e) {
        // pickFields ném NextResponse khi kiểu dữ liệu sai → quy về lỗi theo dòng
        errors.push({ id: item.id, ma: current.ma, message: "Giá trị không hợp lệ" });
        continue;
      }
      if (Object.keys(data).length === 0) continue;
      const adminDenial = adminOnlyDenial(user, data);
      if (adminDenial) {
        errors.push({ id: item.id, ma: current.ma, message: adminDenial });
        continue;
      }
      const moveDenial = pcccScopeMoveDenial(scope, data);
      if (moveDenial) {
        errors.push({ id: item.id, ma: current.ma, message: moveDenial });
        continue;
      }

      if ("chungLoai" in data) data.chungLoai = normalizeChungLoai(data.chungLoai as string | null);

      const chungLoai = ("chungLoai" in data ? (data.chungLoai as string | null) : current.chungLoai) ?? null;
      const apSuat = ("apSuat" in data ? (data.apSuat as string | null) : current.apSuat) ?? null;
      const tinhTrang = ("tinhTrang" in data ? (data.tinhTrang as string | null) : current.tinhTrang) ?? null;
      if (apSuat && !apSuatOptions(chungLoai).includes(apSuat)) {
        errors.push({ id: item.id, ma: current.ma, message: `Áp suất "${apSuat}" không hợp lệ với ${chungLoai ?? "chủng loại này"}` });
        continue;
      }
      const resolved = resolveTinhTrang(apSuat, tinhTrang);
      if (resolved !== tinhTrang) {
        data.tinhTrang = resolved;
        adjusted += 1;
      }

      if ("ngaySx" in data || "thoiGianSd" in data) {
        const ngaySx = ("ngaySx" in data ? (data.ngaySx as Date | null) : current.ngaySx) ?? null;
        const nam = ("thoiGianSd" in data ? (data.thoiGianSd as number | null) : current.thoiGianSd) ?? null;
        data.denHanThayThe = computeDenHan(ngaySx, nam);
      }

      const changed = Object.keys(data).filter(
        (k) => String((current as Record<string, unknown>)[k] ?? "") !== String(data[k] ?? "")
      );
      if (changed.length === 0) continue;
      writes.push({ id: current.id, ma: current.ma, data, changed, before: current });
    }

    // (2) toàn vẹn: có lỗi thì KHÔNG ghi gì cả
    if (errors.length > 0) {
      return ok({ saved: 0, adjusted: 0, errors }, { rejected: true });
    }
    if (writes.length === 0) return ok({ saved: 0, adjusted: 0, errors: [] });

    await prisma.$transaction([
      ...writes.map((w) => prisma.pcccExtinguisher.update({ where: { id: w.id }, data: w.data })),
      // Sửa bất kỳ trường nào → xoá chữ ký của đúng những dòng đó, buộc ký lại
      prisma.pcccSignature.deleteMany({
        where: { targetType: "EXTINGUISHER", targetId: { in: writes.map((w) => w.id) } },
      }),
    ]);

    // Audit từng dòng (giữ nguyên độ chi tiết như khi lưu từng ô), gắn nhãn lượt lưu
    for (const w of writes) {
      await audit(
        user.id,
        "UPDATE_PCCC_EXTINGUISHER",
        "PcccExtinguisher",
        w.id,
        auditDetailWithPosition(user, `Lưu theo lượt (${writes.length} dòng) · ${w.ma}`),
        { beforeData: w.before, afterData: w.data, changedFields: w.changed }
      );
    }

    return ok({ saved: writes.length, adjusted, errors: [] });
  });
}
