import { getRawDb } from "@/modules/ctktkt/db";
import { getSessionUser } from "@/modules/ctktkt/lib/auth/server";
import { canEditAnyWaterField } from "@/modules/ctktkt/lib/water-report/permissions";
import { ensureWaterSchema } from "@/modules/ctktkt/lib/water-report/schema";
import { extractWorkbookShifts, scanWorkbookBuffer } from "@/modules/ctktkt/lib/water-report/excel-importer";
import { recalculateWaterShiftChain, type WaterShiftLog } from "@/modules/ctktkt/lib/water-report/calculations";
import {waterAdjustmentsFromRow} from "@/modules/ctktkt/lib/water-report/adjustments";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

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
  };
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Vui lòng đăng nhập để tải lên file." }, { status: 401 });
  }

  if (!canEditAnyWaterField(user)) {
    return Response.json({ error: "Tài khoản của bạn không có quyền nhập liệu." }, { status: 403 });
  }

  try {
    const rawDb = getRawDb();
    await ensureWaterSchema(rawDb);

    const formData = await request.formData();
    const uploaded = formData.get("file");
    const file = uploaded instanceof File ? uploaded : null;
    if (file && (file.size <= 0 || file.size > MAX_UPLOAD_BYTES)) {
      return Response.json({ error: "File trống hoặc vượt quá 12 MB." }, { status: 413 });
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
      return Response.json({ error: "Chưa chọn file Excel." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();

    // 1. Chế độ quét thông tin các sheet trong file
    if (action === "scan") {
      const scanResults = await scanWorkbookBuffer(arrayBuffer);
      return Response.json({ ok: true, sheets: scanResults });
    }

    // 2. Chế độ nạp dữ liệu (import)
    const { shifts, months } = await extractWorkbookShifts(arrayBuffer, targetSheets);

    if (shifts.length === 0) {
      return Response.json({ error: "Không tìm thấy dữ liệu ca trực nào trong file." }, { status: 400 });
    }

    // Lưu theo từng chunk để tối ưu Turso batch
    const CHUNK_SIZE = 100;
    for (let i = 0; i < shifts.length; i += CHUNK_SIZE) {
      const chunk = shifts.slice(i, i + CHUNK_SIZE);
      const statements = chunk.map(s => ({
        sql: `INSERT INTO water_shift_logs (
          log_date, shift_time, shift_team, shift_leader,
          elec_rec_s1, elec_rec_s2, elec_gen_s1, elec_gen_s2,
          water_rec_s1, water_rec_s2, water_used_s1, water_used_s2,
          water_ratio_s1, water_ratio_s2,
          condenser_rec_s1, condenser_rec_s2, condenser_used_s1, condenser_used_s2,
          resin_water_s1_24h, resin_water_s2_24h, note, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 0, 0, 0, 0, ?, ?, 0, 0, ?, ?, '', CURRENT_TIMESTAMP)
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
          updated_at = CURRENT_TIMESTAMP`,
        args: [
          s.logDate,
          s.shiftTime,
          s.shiftTeam,
          s.shiftLeader,
          s.elecRecS1,
          s.elecRecS2,
          s.waterRecS1,
          s.waterRecS2,
          s.condenserRecS1,
          s.condenserRecS2,
          s.resinWaterS1_24h,
          s.resinWaterS2_24h,
        ],
      }));

      await rawDb.batch(statements);
    }

    // Tự động tính toán lại chênh lệch cho tất cả các tháng bị ảnh hưởng
    for (const monthStr of months) {
      const [yearStr, mStr] = monthStr.split("-");
      const y = Number(yearStr);
      const m = Number(mStr);
      const nextM = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;

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

      for (let j = 0; j < shiftsToUpdate.length; j += CHUNK_SIZE) {
        const updateChunk = shiftsToUpdate.slice(j, j + CHUNK_SIZE);
        const updateStmts = updateChunk.map(item => ({
          sql: `UPDATE water_shift_logs
               SET elec_gen_s1 = ?, elec_gen_s2 = ?,
                   water_used_s1 = ?, water_used_s2 = ?,
                   water_ratio_s1 = ?, water_ratio_s2 = ?,
                   condenser_used_s1 = ?, condenser_used_s2 = ?
               WHERE log_date = ? AND shift_time = ?`,
          args: [
            item.elecGenS1,
            item.elecGenS2,
            item.waterUsedS1,
            item.waterUsedS2,
            item.waterRatioS1,
            item.waterRatioS2,
            item.condenserUsedS1,
            item.condenserUsedS2,
            item.logDate,
            item.shiftTime,
          ],
        }));
        await rawDb.batch(updateStmts);
      }
    }

    return Response.json({
      ok: true,
      totalShifts: shifts.length,
      months,
      message: `Đã nạp thành công ${shifts.length} ca trực của ${months.length} tháng vào hệ thống.`,
    });
  } catch (err) {
    console.error("Lỗi xử lý file tháng:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Không thể xử lý file Excel." },
      { status: 500 }
    );
  }
}
