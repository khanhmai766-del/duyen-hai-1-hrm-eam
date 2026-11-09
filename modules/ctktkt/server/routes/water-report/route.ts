import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { getSessionUser, requireSession } from "@/modules/ctktkt/lib/auth/server";
import {
  calculateMonthlyWaterSummary,
  type WaterShiftLog,
} from "@/modules/ctktkt/lib/water-report/calculations";
import { canEditAnyWaterField, canEditWaterField, canDeleteWaterShift } from "@/modules/ctktkt/lib/water-report/permissions";
import {WATER_ADJUSTMENT_FIELDS,normalizeWaterAdjustment,waterAdjustmentsFromRow} from "@/modules/ctktkt/lib/water-report/adjustments";
import { loadWaterChain, recalculateWaterMonths, waterRowToLog } from "@/modules/ctktkt/lib/water-report/store";
import { KtktAbort, ktktUtcNow, ktktWrite } from "@/modules/ctktkt/db/prisma";
import { operationalWriteKeysFor } from "@/modules/ctktkt/lib/operational-query-policy";

const monthPattern = /^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/;
const datePattern = /^(19|20|21)\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const TABLE = "water_shift_logs";

export async function GET(request: Request) {
  const session = await requireSession(); if (!session.ok) return session.response;
  const url = new URL(request.url);
  const month = url.searchParams.get("month") || "";

  if (!monthPattern.test(month)) {
    return fail("Tháng yêu cầu không hợp lệ (định dạng YYYY-MM).", 400);
  }

  try {
    // 1. Danh sách Trưởng ca đang hoạt động
    const leaders = (await prisma.ctktktWaterShiftLeaders.findMany({
      where: { is_active: 1 }, orderBy: [{ display_order: "asc" }, { name: "asc" }], select: { name: true },
    })).map(r => String(r.name || "")).filter(Boolean);

    // 2–4. Ca mốc liền trước (thường 22h00 cuối tháng trước) + các ca trong tháng, tính chuỗi liên tục từ ca mốc
    const { baseline, shifts: shiftsInMonth, invalidAdjustments } = await loadWaterChain(prisma, month, { updatedAt: true });
    const summary = calculateMonthlyWaterSummary(shiftsInMonth);

    return ok({
        ok: true,
        month,
        leaders,
        baseline,
        shifts: shiftsInMonth,
        summary,
        // Chỉ có khi DB lỡ chứa hiệu chỉnh hỏng: các giá trị này bị bỏ qua khi tính (tháng vẫn xem được).
        ...(invalidAdjustments.length ? { invalidAdjustments } : {}),
      });
  } catch (err) {
    console.error("Lỗi đọc dữ liệu theo dõi lượng nước:", err);
    return fail("Không thể truy vấn kho dữ liệu theo dõi lượng nước.", 500);
  }
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return fail("Vui lòng đăng nhập để thực hiện thao tác.", 401);
  }

  if (!canEditAnyWaterField(user)) {
    return fail("Tài khoản của bạn không có quyền nhập liệu báo cáo lượng nước.", 403);
  }

  try {
    const body = (await request.json()) as {
      shift?: Partial<WaterShiftLog>;
      shifts?: Partial<WaterShiftLog>[];
      changedFields?: unknown;
    };

    const inputList = body.shifts && Array.isArray(body.shifts) ? body.shifts : body.shift ? [body.shift] : [];
    const allowedChangedFields = new Set<keyof WaterShiftLog>([
      ...Object.keys(WATER_ADJUSTMENT_FIELDS) as Array<keyof WaterShiftLog>,
      "shiftTeam", "shiftLeader", "elecRecS1", "elecRecS2", "waterRecS1", "waterRecS2",
      "condenserRecS1", "condenserRecS2", "resinWaterS1_24h", "resinWaterS2_24h", "note",
    ]);
    const changedFields = Array.isArray(body.changedFields)
      ? new Set(body.changedFields.map(String).filter((field): field is keyof WaterShiftLog => allowedChangedFields.has(field as keyof WaterShiftLog)))
      : null;

    if (inputList.length === 0) {
      return fail("Không có dữ liệu ca trực để lưu.", 400);
    }

    const canEditMeta = canEditWaterField(user, "meta");
    const canEditElec = canEditWaterField(user, "electricity");
    const canEditIntake = canEditWaterField(user, "water_intake");
    const canEditResin = canEditWaterField(user, "resin_water");

    // Cả danh sách + tính lại chuỗi trong MỘT giao dịch: ca nào lỗi thì không ca nào được lưu (bản cũ để lại các ca trước).
    // Khoá phiên bản đọc: tháng của từng ca (ngày ngoài dạng 20xx → cả bảng) — như các câu INSERT/UPDATE cũ.
    const savedDates: string[] = [];
    await ktktWrite(() => [...new Set(savedDates.flatMap(date => operationalWriteKeysFor(TABLE, [date])))], async tx => {
      // Lấy trước các ca hiện có để kiểm tra/giữ nguyên giá trị nếu cương vị không có quyền sửa cột đó
      const monthsAffected = new Set<string>();

      for (const item of inputList) {
        const logDate = String(item.logDate || "").trim();
        const shiftTime = String(item.shiftTime || "").trim();

        if (!datePattern.test(logDate)) {
          throw new Error(`Ngày vận hành không đúng định dạng YYYY-MM-DD: ${logDate}`);
        }
        if (!["06h00", "14h00", "22h00"].includes(shiftTime)) {
          throw new Error(`Giờ giao ca phải là 06h00, 14h00 hoặc 22h00 (nhận được: ${shiftTime})`);
        }

        monthsAffected.add(logDate.slice(0, 7));

        // Lấy bản ghi hiện tại nếu có
        const existing = await tx.ctktktWaterShiftLogs.findUnique({ where: { log_date_shift_time: { log_date: logDate, shift_time: shiftTime } } });

        const prevLog = existing ? waterRowToLog(existing) : null;
        const shouldUpdate = (field: keyof WaterShiftLog) => !prevLog || !changedFields || changedFields.has(field);
        const adjustments=waterAdjustmentsFromRow({});
        for(const field of Object.keys(WATER_ADJUSTMENT_FIELDS) as Array<keyof typeof WATER_ADJUSTMENT_FIELDS>){
          if(!canEditIntake&&Object.hasOwn(item,field)&&normalizeWaterAdjustment(item[field])!==(prevLog?.[field]??null))throw new KtktAbort(fail("Bạn không có quyền hiệu chỉnh công tơ nước.", 403));
          adjustments[field]=canEditIntake&&shouldUpdate(field)&&Object.hasOwn(item,field)?normalizeWaterAdjustment(item[field]):prevLog?.[field]??null;
        }

        const shiftTeam = canEditMeta && shouldUpdate("shiftTeam") ? String(item.shiftTeam || prevLog?.shiftTeam || "") : prevLog?.shiftTeam || "";
        const shiftLeader = canEditMeta
          && shouldUpdate("shiftLeader") ? String(item.shiftLeader || prevLog?.shiftLeader || "")
          : prevLog?.shiftLeader || "";

        const elecRecS1 = canEditElec && shouldUpdate("elecRecS1") ? Number(item.elecRecS1 ?? prevLog?.elecRecS1 ?? 0) : prevLog?.elecRecS1 ?? 0;
        const elecRecS2 = canEditElec && shouldUpdate("elecRecS2") ? Number(item.elecRecS2 ?? prevLog?.elecRecS2 ?? 0) : prevLog?.elecRecS2 ?? 0;

        const waterRecS1 = canEditIntake && shouldUpdate("waterRecS1") ? Number(item.waterRecS1 ?? prevLog?.waterRecS1 ?? 0) : prevLog?.waterRecS1 ?? 0;
        const waterRecS2 = canEditIntake && shouldUpdate("waterRecS2") ? Number(item.waterRecS2 ?? prevLog?.waterRecS2 ?? 0) : prevLog?.waterRecS2 ?? 0;

        const condenserRecS1 = canEditIntake && shouldUpdate("condenserRecS1")
          ? Number(item.condenserRecS1 ?? prevLog?.condenserRecS1 ?? 0)
          : prevLog?.condenserRecS1 ?? 0;
        const condenserRecS2 = canEditIntake && shouldUpdate("condenserRecS2")
          ? Number(item.condenserRecS2 ?? prevLog?.condenserRecS2 ?? 0)
          : prevLog?.condenserRecS2 ?? 0;

        const resinWaterS1_24h = canEditResin && shouldUpdate("resinWaterS1_24h")
          ? Number(item.resinWaterS1_24h ?? prevLog?.resinWaterS1_24h ?? 0)
          : prevLog?.resinWaterS1_24h ?? 0;
        const resinWaterS2_24h = canEditResin && shouldUpdate("resinWaterS2_24h")
          ? Number(item.resinWaterS2_24h ?? prevLog?.resinWaterS2_24h ?? 0)
          : prevLog?.resinWaterS2_24h ?? 0;

        const note = shouldUpdate("note") ? String(item.note ?? prevLog?.note ?? "").slice(0, 500) : prevLog?.note || "";

        // Lưu thô các giá trị nhận ca (cột suy ra = 0 khi thêm mới; tính lại ngay bên dưới)
        const raw = {
          shift_team: shiftTeam, shift_leader: shiftLeader,
          elec_rec_s1: elecRecS1, elec_rec_s2: elecRecS2,
          water_rec_s1: waterRecS1, water_rec_s2: waterRecS2,
          condenser_rec_s1: condenserRecS1, condenser_rec_s2: condenserRecS2,
          resin_water_s1_24h: resinWaterS1_24h, resin_water_s2_24h: resinWaterS2_24h,
          note,
          water_adjustment_s1: adjustments.waterAdjustmentS1, water_adjustment_s2: adjustments.waterAdjustmentS2,
          condenser_adjustment_s1: adjustments.condenserAdjustmentS1, condenser_adjustment_s2: adjustments.condenserAdjustmentS2,
        };
        await tx.ctktktWaterShiftLogs.upsert({
          where: { log_date_shift_time: { log_date: logDate, shift_time: shiftTime } },
          create: {
            log_date: logDate, shift_time: shiftTime, ...raw,
            elec_gen_s1: 0, elec_gen_s2: 0, water_used_s1: 0, water_used_s2: 0, water_ratio_s1: 0, water_ratio_s2: 0,
            condenser_used_s1: 0, condenser_used_s2: 0,
          },
          update: { ...raw, updated_at: ktktUtcNow() },
        });
        savedDates.push(logDate);
      }

      // Sau khi lưu toàn bộ, tự động tính toán lại chuỗi (recalculate chaining) cho các tháng bị ảnh hưởng
      await recalculateWaterMonths(tx, monthsAffected);
    });

    return ok({ ok: true, saved: inputList.length });
  } catch (err) {
    if (err instanceof KtktAbort) return err.response;
    console.error("Lỗi lưu ca trực theo dõi nước:", err);
    return fail(err instanceof Error ? err.message : "Không thể lưu dữ liệu ca trực.", 400);
  }
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return fail("Vui lòng đăng nhập.", 401);
  }

  if (!canDeleteWaterShift(user)) {
    return fail("Chỉ Quản trị hoặc Trưởng ca được cấp toàn quyền Nước mới được xóa ca.", 403);
  }

  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id") || 0);
  const logDate = url.searchParams.get("logDate") || "";
  const shiftTime = url.searchParams.get("shiftTime") || "";

  try {
    // Như bản cũ: xoá không tính lại chuỗi; khoá phiên bản theo id → cả bảng, theo ngày → tháng đó.
    if (id > 0) {
      await ktktWrite(operationalWriteKeysFor(TABLE), tx => tx.ctktktWaterShiftLogs.deleteMany({ where: { id } }));
    } else if (logDate && shiftTime) {
      await ktktWrite(operationalWriteKeysFor(TABLE, [logDate]), tx => tx.ctktktWaterShiftLogs.deleteMany({ where: { log_date: logDate, shift_time: shiftTime } }));
    } else {
      return fail("Thiếu ID hoặc thông tin ca để xoá.", 400);
    }

    return ok({ ok: true, message: "Đã xoá ca thành công." });
  } catch (err) {
    console.error("Lỗi xoá ca:", err);
    return fail("Không thể xoá ca.", 500);
  }
}
