import { requireSession } from "@/modules/ctktkt/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { loadAllWaterRows } from "@/modules/ctktkt/lib/water-report/store";

export async function GET() {
  const session = await requireSession(); if (!session.ok) return session.response;
  try {
    const rows = await loadAllWaterRows(prisma);
    const totalCount = rows.length;
    // Gộp theo tháng (= GROUP BY substr(log_date, 1, 7) ORDER BY month): các dòng đã theo ngày tăng dần.
    const months: Array<{ month: string; count: number; min_date: string; max_date: string }> = [];
    for (const row of rows) {
      const month = row.log_date.slice(0, 7), last = months.at(-1);
      if (last?.month === month) { last.count++; last.max_date = row.log_date; }
      else months.push({ month, count: 1, min_date: row.log_date, max_date: row.log_date });
    }
    const leaders = await prisma.ctktktWaterShiftLeaders.findMany({ orderBy: { display_order: "asc" } });

    return Response.json({
      ok: true,
      totalCount,
      months,
      rows,
      leaders,
    });
  } catch (err) {
    console.error("Lỗi lấy dữ liệu đối chiếu:", err);
    return Response.json({ error: "Chưa tải được dữ liệu đối chiếu." }, { status: 500 });
  }
}
