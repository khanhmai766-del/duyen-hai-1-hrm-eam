import { requireSession } from "@/modules/ctktkt/lib/auth/server";
import { getRawDb } from "@/modules/ctktkt/db";
import { ensureWaterSchema } from "@/modules/ctktkt/lib/water-report/schema";

export async function GET() {
  const session = await requireSession(); if (!session.ok) return session.response;
  try {
    const rawDb = getRawDb();
    await ensureWaterSchema(rawDb);

    const countRes = (await rawDb.prepare("SELECT count(*) as count FROM water_shift_logs").first()) as { count?: number } | null;
    const totalCount = Number(countRes?.count || 0);

    const monthsRes = await rawDb.prepare(`
      SELECT substr(log_date, 1, 7) as month, count(*) as count, min(log_date) as min_date, max(log_date) as max_date
      FROM water_shift_logs
      GROUP BY substr(log_date, 1, 7)
      ORDER BY month ASC
    `).all();

    const rowsRes = await rawDb.prepare(`
      SELECT * FROM water_shift_logs
      ORDER BY log_date ASC,
               CASE shift_time WHEN '06h00' THEN 1 WHEN '14h00' THEN 2 WHEN '22h00' THEN 3 ELSE 9 END ASC
    `).all();

    const leadersRes = await rawDb.prepare(`
      SELECT * FROM water_shift_leaders ORDER BY display_order ASC
    `).all();

    return Response.json({
      ok: true,
      totalCount,
      months: monthsRes.results,
      rows: rowsRes.results,
      leaders: leadersRes.results,
    });
  } catch (err) {
    console.error("Lỗi lấy dữ liệu đối chiếu:", err);
    return Response.json({ error: "Chưa tải được dữ liệu đối chiếu." }, { status: 500 });
  }
}
