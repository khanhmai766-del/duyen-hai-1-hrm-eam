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
import { applyTccToggle, deriveCabinetStatus } from "@/lib/pccc-status";

export const dynamic = "force-dynamic";

/**
 * Lưu MỘT LƯỢT nhiều tủ chữa cháy — dùng cho chế độ "Sửa bảng", giống
 * `extinguishers/bulk` và cùng ba bảo đảm:
 *  1. CHỐNG GHI ĐÈ theo `updatedAt` đọc được lúc mở khoá.
 *  2. TOÀN VẸN: validate hết rồi ghi trong MỘT transaction.
 *  3. BÁO LỖI THEO DÒNG để UI chỉ đúng tủ có vấn đề.
 *
 * Riêng bảng này còn khối ô ☑: một lượt lưu có thể chứa nhiều ô của cùng một tủ, và
 * quy tắc "Khả dụng ↔ Bất khả dụng loại trừ nhau" phải áp LẦN LƯỢT theo thứ tự người
 * dùng bấm, nên phải mô phỏng trên bản sao trong bộ nhớ trước khi ghi.
 */

const EDITABLE: FieldSpec = {
  ten: "string",
  viTri: "string",
  cuongVi: "string",
  machine: "string",
  sl: "number",
  dvt: "string",
  soYcsc: "string",
  ngayKiemTra: "date",
  nguoiKiemTra: "string",
  ghiChu: "string",
};

type BulkItem = {
  id: string;
  updatedAt?: string;
  patch: Record<string, unknown>;
  components?: { groupLabel: string; status: string; checked: boolean }[];
};

// POST /api/pccc/cabinets/bulk  { items: [{ id, updatedAt, patch, components }] }
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const scope = await resolvePcccWriteScope(user, undefined, "CABINET");

    const body = (await req.json()) as { items?: BulkItem[] };
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) return fail("Không có thay đổi nào để lưu");
    if (items.length > 500) return fail("Quá nhiều dòng trong một lượt lưu (tối đa 500)");

    const rows = await prisma.pcccCabinet.findMany({
      where: { id: { in: items.map((i) => i.id) } },
      include: { period: true, components: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));

    const errors: { id: string; ma?: string; message: string }[] = [];
    const writes: {
      id: string;
      ma: string;
      data: Record<string, unknown>;
      cellUpdates: { id: string; checked: boolean }[];
      changed: string[];
      before: unknown;
    }[] = [];

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
      // Phạm vi cương vị — báo theo dòng, giống các lỗi khác của lượt lưu
      const denial = pcccScopeDenial(scope, current);
      if (denial) {
        errors.push({ id: item.id, ma: current.ma, message: denial });
        continue;
      }
      if (item.updatedAt && new Date(item.updatedAt).getTime() !== current.updatedAt.getTime()) {
        errors.push({ id: item.id, ma: current.ma, message: "Người khác vừa sửa dòng này — hãy Làm mới rồi sửa lại" });
        continue;
      }

      let data: Record<string, unknown>;
      try {
        data = normalizePositionPatch(pickFields(item.patch ?? {}, EDITABLE), current);
      } catch {
        errors.push({ id: item.id, ma: current.ma, message: "Giá trị không hợp lệ" });
        continue;
      }
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

      // Bản sao ô ☑ để mô phỏng, không đụng dữ liệu gốc trong bộ nhớ
      const sim = current.components.map((c) => ({ ...c }));
      const changed = Object.keys(data).filter(
        (k) => String((current as Record<string, unknown>)[k] ?? "") !== String(data[k] ?? "")
      );
      let badCell = false;
      for (const patch of item.components ?? []) {
        const target = sim.find((c) => c.groupLabel === patch.groupLabel && c.status === patch.status);
        if (!target) {
          errors.push({ id: item.id, ma: current.ma, message: `Không có linh kiện ${patch.groupLabel} / ${patch.status}` });
          badCell = true;
          break;
        }
        for (const change of applyTccToggle(sim, patch.groupLabel, patch.status, Boolean(patch.checked))) {
          const cell = sim.find((c) => c.groupLabel === change.groupLabel && c.status === change.status);
          if (!cell) continue;
          cell.checked = change.checked;
        }
      }
      if (badCell) continue;

      const cellUpdates = sim
        .filter((c) => c.checked !== current.components.find((o) => o.id === c.id)?.checked)
        .map((c) => ({ id: c.id, checked: c.checked }));
      for (const c of sim) {
        const before = current.components.find((o) => o.id === c.id);
        if (before && before.checked !== c.checked) changed.push(`${c.groupLabel}/${c.status}=${c.checked ? "☑" : "☐"}`);
      }

      const derived = deriveCabinetStatus(sim);
      if (derived !== current.tinhTrangTongThe) data.tinhTrangTongThe = derived;

      if (changed.length === 0 && cellUpdates.length === 0 && !("tinhTrangTongThe" in data)) continue;
      writes.push({ id: current.id, ma: current.ma, data, cellUpdates, changed, before: current });
    }

    if (errors.length > 0) return ok({ saved: 0, errors }, { rejected: true });
    if (writes.length === 0) return ok({ saved: 0, errors: [] });

    await prisma.$transaction([
      ...writes.flatMap((w) => [
        ...w.cellUpdates.map((c) => prisma.pcccCabinetComponent.update({ where: { id: c.id }, data: { checked: c.checked } })),
        prisma.pcccCabinet.update({ where: { id: w.id }, data: w.data }),
      ]),
      // Sửa bất kỳ trường nào → xoá chữ ký của đúng những dòng đó, buộc ký lại
      prisma.pcccSignature.deleteMany({
        where: { targetType: "CABINET", targetId: { in: writes.map((w) => w.id) } },
      }),
    ]);

    for (const w of writes) {
      await audit(
        user.id,
        "UPDATE_PCCC_CABINET",
        "PcccCabinet",
        w.id,
        auditDetailWithPosition(user, `Lưu theo lượt (${writes.length} dòng) · ${w.ma}`),
        { beforeData: w.before, afterData: w.data, changedFields: w.changed }
      );
    }

    return ok({ saved: writes.length, errors: [] });
  });
}
