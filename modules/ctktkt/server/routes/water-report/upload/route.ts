import { ok, fail } from "@/lib/api";
import { getSessionUser } from "@/modules/ctktkt/lib/auth/server";
import { canEditAnyWaterField } from "@/modules/ctktkt/lib/water-report/permissions";
import { extractWorkbookShifts, scanWorkbookBuffer } from "@/modules/ctktkt/lib/water-report/excel-importer";
import { recalculateWaterMonths } from "@/modules/ctktkt/lib/water-report/store";
import { ktktUtcNow, ktktWrite } from "@/modules/ctktkt/db/prisma";
import { operationalWriteKeysFor } from "@/modules/ctktkt/lib/operational-query-policy";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return fail("Vui lòng đăng nhập để tải lên file.", 401);
  }

  if (!canEditAnyWaterField(user)) {
    return fail("Tài khoản của bạn không có quyền nhập liệu.", 403);
  }

  try {
    const formData = await request.formData();
    const uploaded = formData.get("file");
    const file = uploaded instanceof File ? uploaded : null;
    if (file && (file.size <= 0 || file.size > MAX_UPLOAD_BYTES)) {
      return fail("File trống hoặc vượt quá 12 MB.", 413);
    }
    const action = String(formData.get("action") || "scan");
    const rawSheets = formData.get("sheetNames");
    let targetSheets: string[] | undefined = undefined;

    if (rawSheets && typeof rawSheets === "string") {
      try {
        const parsed = JSON.parse(rawSheets);
        if (Array.isArray(parsed)) targetSheets = parsed;
      } catch {}
    }

    if (!file) {
      return fail("Chưa chọn file Excel.", 400);
    }

    const arrayBuffer = await file.arrayBuffer();

    // 1. Chế độ quét thông tin các sheet trong file
    if (action === "scan") {
      const scanResults = await scanWorkbookBuffer(arrayBuffer);
      return ok({ ok: true, sheets: scanResults });
    }

    // 2. Chế độ nạp dữ liệu (import)
    const { shifts, months } = await extractWorkbookShifts(arrayBuffer, targetSheets);

    if (shifts.length === 0) {
      return fail("Không tìm thấy dữ liệu ca trực nào trong file.", 400);
    }

    // Ghi mọi ca rồi tính lại chuỗi từng tháng trong MỘT giao dịch (bản cũ ghi theo lô 100 câu, lỗi giữa chừng để lại nửa file).
    // Ca đã có: chỉ ghi đè số nhận ca + Kíp/Trưởng ca; giữ ghi chú và hiệu chỉnh công tơ — như ON CONFLICT cũ.
    await ktktWrite([...new Set(shifts.flatMap(s => operationalWriteKeysFor("water_shift_logs", [s.logDate])))], async tx => {
      for (const s of shifts) {
        const raw = {
          shift_team: s.shiftTeam, shift_leader: s.shiftLeader,
          elec_rec_s1: s.elecRecS1, elec_rec_s2: s.elecRecS2,
          water_rec_s1: s.waterRecS1, water_rec_s2: s.waterRecS2,
          condenser_rec_s1: s.condenserRecS1, condenser_rec_s2: s.condenserRecS2,
          resin_water_s1_24h: s.resinWaterS1_24h, resin_water_s2_24h: s.resinWaterS2_24h,
        };
        await tx.ctktktWaterShiftLogs.upsert({
          where: { log_date_shift_time: { log_date: s.logDate, shift_time: s.shiftTime } },
          create: {
            log_date: s.logDate, shift_time: s.shiftTime, ...raw, note: "",
            elec_gen_s1: 0, elec_gen_s2: 0, water_used_s1: 0, water_used_s2: 0, water_ratio_s1: 0, water_ratio_s2: 0,
            condenser_used_s1: 0, condenser_used_s2: 0,
          },
          update: { ...raw, updated_at: ktktUtcNow() },
        });
      }
      // Tự động tính toán lại chênh lệch cho tất cả các tháng bị ảnh hưởng
      await recalculateWaterMonths(tx, months);
    });

    return ok({
      ok: true,
      totalShifts: shifts.length,
      months,
      message: `Đã nạp thành công ${shifts.length} ca trực của ${months.length} tháng vào hệ thống.`,
    });
  } catch (err) {
    console.error("Lỗi xử lý file tháng:", err);
    return fail(err instanceof Error ? err.message : "Không thể xử lý file Excel.", 500);
  }
}
