import { getRawDb } from "@/modules/ctktkt/db";
import { getSessionUser, requireSession } from "@/modules/ctktkt/lib/auth/server";
import {
  calculateMonthlyWaterSummary,
  recalculateWaterShiftChain,
  type WaterShiftLog,
} from "@/modules/ctktkt/lib/water-report/calculations";
import { canEditAnyWaterField, canEditWaterField, canDeleteWaterShift } from "@/modules/ctktkt/lib/water-report/permissions";
import { ensureWaterSchema } from "@/modules/ctktkt/lib/water-report/schema";
import {WATER_ADJUSTMENT_FIELDS,normalizeWaterAdjustment,waterAdjustmentsFromRow} from "@/modules/ctktkt/lib/water-report/adjustments";

const monthPattern = /^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/;
const datePattern = /^(19|20|21)\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;

function rowToLog(row: Record<string, unknown>): WaterShiftLog {
  return {
    ...waterAdjustmentsFromRow(row),
    id: Number(row.id || 0),
    logDate: String(row.log_date || ""),
    shiftTime: String(row.shift_time || ""),
    shiftTeam: String(row.shift_team || ""),
    shiftLeader: String(row.shift_leader || ""),
    elecRecS1: Number(row.elec_rec_s1 ?? 0),
    elecRecS2: Number(row.elec_rec_s2 ?? 0),
    elecGenS1: Number(row.elec_gen_s1 ?? 0),
    elecGenS2: Number(row.elec_gen_s2 ?? 0),
    waterRecS1: Number(row.water_rec_s1 ?? 0),
    waterRecS2: Number(row.water_rec_s2 ?? 0),
    waterUsedS1: Number(row.water_used_s1 ?? 0),
    waterUsedS2: Number(row.water_used_s2 ?? 0),
    waterRatioS1: Number(row.water_ratio_s1 ?? 0),
    waterRatioS2: Number(row.water_ratio_s2 ?? 0),
    condenserRecS1: Number(row.condenser_rec_s1 ?? 0),
    condenserRecS2: Number(row.condenser_rec_s2 ?? 0),
    condenserUsedS1: Number(row.condenser_used_s1 ?? 0),
    condenserUsedS2: Number(row.condenser_used_s2 ?? 0),
    resinWaterS1_24h: Number(row.resin_water_s1_24h ?? 0),
    resinWaterS2_24h: Number(row.resin_water_s2_24h ?? 0),
    note: String(row.note || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

export async function GET(request: Request) {
  const session = await requireSession(); if (!session.ok) return session.response;
  const url = new URL(request.url);
  const month = url.searchParams.get("month") || "";

  if (!monthPattern.test(month)) {
    return Response.json({ error: "Tháng yêu cầu không hợp lệ (định dạng YYYY-MM)." }, { status: 400 });
  }

  try {
    const rawDb = getRawDb();
    await ensureWaterSchema(rawDb);

    // 1. Lấy danh sách Trưởng ca đang hoạt động
    const leadersRes = await rawDb
      .prepare("SELECT name FROM water_shift_leaders WHERE is_active = 1 ORDER BY display_order ASC, name ASC")
      .all();
    const leaders = leadersRes.results.map(r => String(r.name || "")).filter(Boolean);

    // 2. Lấy ca mốc liền trước (thường là 22h00 ngày cuối tháng trước)
    const baselineRow = (await rawDb
      .prepare(
        `SELECT * FROM water_shift_logs
         WHERE log_date < ?
         ORDER BY log_date DESC,
                  CASE shift_time WHEN '22h00' THEN 3 WHEN '14h00' THEN 2 WHEN '06h00' THEN 1 ELSE 0 END DESC
         LIMIT 1`
      )
      .bind(`${month}-01`)
      .first()) as Record<string, unknown> | null;

    const baseline = baselineRow ? rowToLog(baselineRow) : null;

    // 3. Lấy toàn bộ các ca trong tháng chỉ định
    const [yearStr, monthStr] = month.split("-");
    const year = Number(yearStr);
    const m = Number(monthStr);
    const nextMonth = m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, "0")}`;

    const monthRowsRes = await rawDb
      .prepare(
        `SELECT * FROM water_shift_logs
         WHERE log_date >= ? AND log_date < ?
         ORDER BY log_date ASC,
                  CASE shift_time WHEN '06h00' THEN 1 WHEN '14h00' THEN 2 WHEN '22h00' THEN 3 ELSE 9 END ASC`
      )
      .bind(`${month}-01`, `${nextMonth}-01`)
      .all();

    const monthShifts = monthRowsRes.results.map(r => rowToLog(r as Record<string, unknown>));

    // 4. Tính toán chuỗi liên tục (Chaining) từ baseline
    const chainInput = baseline ? [baseline, ...monthShifts] : monthShifts;
    const chained = recalculateWaterShiftChain(chainInput);

    // Bỏ qua baseline trong danh sách hiển thị tháng
    const shiftsInMonth = baseline ? chained.slice(1) : chained;
    const summary = calculateMonthlyWaterSummary(shiftsInMonth);

    return Response.json(
      {
        ok: true,
        month,
        leaders,
        baseline,
        shifts: shiftsInMonth,
        summary,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("Lỗi đọc dữ liệu theo dõi lượng nước:", err);
    return Response.json({ error: "Không thể truy vấn kho dữ liệu theo dõi lượng nước." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Vui lòng đăng nhập để thực hiện thao tác." }, { status: 401 });
  }

  if (!canEditAnyWaterField(user)) {
    return Response.json(
      { error: "Tài khoản của bạn không có quyền nhập liệu báo cáo lượng nước." },
      { status: 403 }
    );
  }

  try {
    const rawDb = getRawDb();
    await ensureWaterSchema(rawDb);

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
      return Response.json({ error: "Không có dữ liệu ca trực để lưu." }, { status: 400 });
    }

    const canEditMeta = canEditWaterField(user, "meta");
    const canEditElec = canEditWaterField(user, "electricity");
    const canEditIntake = canEditWaterField(user, "water_intake");
    const canEditResin = canEditWaterField(user, "resin_water");

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
      const existing = (await rawDb
        .prepare("SELECT * FROM water_shift_logs WHERE log_date = ? AND shift_time = ?")
        .bind(logDate, shiftTime)
        .first()) as Record<string, unknown> | null;

      const prevLog = existing ? rowToLog(existing) : null;
      const shouldUpdate = (field: keyof WaterShiftLog) => !prevLog || !changedFields || changedFields.has(field);
      const adjustments=waterAdjustmentsFromRow({});
      for(const field of Object.keys(WATER_ADJUSTMENT_FIELDS) as Array<keyof typeof WATER_ADJUSTMENT_FIELDS>){
        if(!canEditIntake&&Object.hasOwn(item,field)&&normalizeWaterAdjustment(item[field])!==(prevLog?.[field]??null))return Response.json({error:"Bạn không có quyền hiệu chỉnh công tơ nước."},{status:403});
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

      // Lưu thô các giá trị nhận ca
      await rawDb
        .prepare(
          `INSERT INTO water_shift_logs (
            log_date, shift_time, shift_team, shift_leader,
            elec_rec_s1, elec_rec_s2, elec_gen_s1, elec_gen_s2,
            water_rec_s1, water_rec_s2, water_used_s1, water_used_s2,
            water_ratio_s1, water_ratio_s2,
            condenser_rec_s1, condenser_rec_s2, condenser_used_s1, condenser_used_s2,
            resin_water_s1_24h, resin_water_s2_24h, note, water_adjustment_s1, water_adjustment_s2, condenser_adjustment_s1, condenser_adjustment_s2, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 0, 0, 0, 0, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(log_date, shift_time) DO UPDATE SET
            shift_team = excluded.shift_team,
            shift_leader = excluded.shift_leader,
            elec_rec_s1 = excluded.elec_rec_s1,
            elec_rec_s2 = excluded.elec_rec_s2,
            water_rec_s1 = excluded.water_rec_s1,
            water_rec_s2 = excluded.water_rec_s2,
            condenser_rec_s1 = excluded.condenser_rec_s1,
            condenser_rec_s2 = excluded.condenser_rec_s2,
            resin_water_s1_24h = excluded.resin_water_s1_24h,
            resin_water_s2_24h = excluded.resin_water_s2_24h,
            note = excluded.note,
            water_adjustment_s1 = excluded.water_adjustment_s1,
            water_adjustment_s2 = excluded.water_adjustment_s2,
            condenser_adjustment_s1 = excluded.condenser_adjustment_s1,
            condenser_adjustment_s2 = excluded.condenser_adjustment_s2,
            updated_at = CURRENT_TIMESTAMP`
        )
        .bind(
          logDate,
          shiftTime,
          shiftTeam,
          shiftLeader,
          elecRecS1,
          elecRecS2,
          waterRecS1,
          waterRecS2,
          condenserRecS1,
          condenserRecS2,
          resinWaterS1_24h,
          resinWaterS2_24h,
          note,
          adjustments.waterAdjustmentS1,adjustments.waterAdjustmentS2,adjustments.condenserAdjustmentS1,adjustments.condenserAdjustmentS2
        )
        .run();
    }

    // Sau khi lưu toàn bộ, tự động tính toán lại chuỗi (recalculate chaining) cho các tháng bị ảnh hưởng
    for (const monthStr of monthsAffected) {
      const [yearStr, mStr] = monthStr.split("-");
      const y = Number(yearStr);
      const m = Number(mStr);
      const nextM = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;

      // Baseline
      const baselineRow = (await rawDb
        .prepare(
          `SELECT * FROM water_shift_logs
           WHERE log_date < ?
           ORDER BY log_date DESC,
                    CASE shift_time WHEN '22h00' THEN 3 WHEN '14h00' THEN 2 WHEN '06h00' THEN 1 ELSE 0 END DESC
           LIMIT 1`
        )
        .bind(`${monthStr}-01`)
        .first()) as Record<string, unknown> | null;

      const baseline = baselineRow ? rowToLog(baselineRow) : null;

      const monthRowsRes = await rawDb
        .prepare(
          `SELECT * FROM water_shift_logs
           WHERE log_date >= ? AND log_date < ?
           ORDER BY log_date ASC,
                    CASE shift_time WHEN '06h00' THEN 1 WHEN '14h00' THEN 2 WHEN '22h00' THEN 3 ELSE 9 END ASC`
        )
        .bind(`${monthStr}-01`, `${nextM}-01`)
        .all();

      const monthShifts = monthRowsRes.results.map(r => rowToLog(r as Record<string, unknown>));
      const chainInput = baseline ? [baseline, ...monthShifts] : monthShifts;
      const chained = recalculateWaterShiftChain(chainInput);
      const shiftsToUpdate = baseline ? chained.slice(1) : chained;

      // Cập nhật lại các trường tính toán
      for (const item of shiftsToUpdate) {
        await rawDb
          .prepare(
            `UPDATE water_shift_logs
             SET elec_gen_s1 = ?, elec_gen_s2 = ?,
                 water_used_s1 = ?, water_used_s2 = ?,
                 water_ratio_s1 = ?, water_ratio_s2 = ?,
                 condenser_used_s1 = ?, condenser_used_s2 = ?
             WHERE log_date = ? AND shift_time = ?`
          )
          .bind(
            item.elecGenS1,
            item.elecGenS2,
            item.waterUsedS1,
            item.waterUsedS2,
            item.waterRatioS1,
            item.waterRatioS2,
            item.condenserUsedS1,
            item.condenserUsedS2,
            item.logDate,
            item.shiftTime
          )
          .run();
      }
    }

    return Response.json({ ok: true, saved: inputList.length });
  } catch (err) {
    console.error("Lỗi lưu ca trực theo dõi nước:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Không thể lưu dữ liệu ca trực." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  }

  if (!canDeleteWaterShift(user)) {
    return Response.json({ error: "Chỉ Quản trị hoặc Trưởng ca được cấp toàn quyền Nước mới được xóa ca." }, { status: 403 });
  }

  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id") || 0);
  const logDate = url.searchParams.get("logDate") || "";
  const shiftTime = url.searchParams.get("shiftTime") || "";

  try {
    const rawDb = getRawDb();
    if (id > 0) {
      await rawDb.prepare("DELETE FROM water_shift_logs WHERE id = ?").bind(id).run();
    } else if (logDate && shiftTime) {
      await rawDb
        .prepare("DELETE FROM water_shift_logs WHERE log_date = ? AND shift_time = ?")
        .bind(logDate, shiftTime)
        .run();
    } else {
      return Response.json({ error: "Thiếu ID hoặc thông tin ca để xoá." }, { status: 400 });
    }

    return Response.json({ ok: true, message: "Đã xoá ca thành công." });
  } catch (err) {
    console.error("Lỗi xoá ca:", err);
    return Response.json({ error: "Không thể xoá ca." }, { status: 500 });
  }
}
