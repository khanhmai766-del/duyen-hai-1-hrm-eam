import { fail, handle, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { buildOverhaulGrid, OVERHAUL_JOURNAL_PREVIEW, overhaulDayCell, parseSheetPercent, type OverhaulGridItem } from "@/lib/overhaul-progress-grid";
import { OVERHAUL_DAY_COUNT, overhaulDayDate } from "@/lib/overhaul-milestones-source";
import { OVERHAUL_SOURCES, type OverhaulSource } from "@/lib/work-permit-overhaul";
export const dynamic = "force-dynamic";

const FIRST_DAY = overhaulDayDate(1), LAST_DAY = overhaulDayDate(OVERHAUL_DAY_COUNT);
const isDay = (value: string | null): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

/** Số PCT "số/năm" cho dòng đầu mỗi đoạn nhật ký. */
async function permitNumbersOf(ids: string[]) {
  const permits = ids.length ? await prisma.workPermit.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, number: true, year: true } }) : [];
  return new Map(permits.map(permit => [permit.id, `${permit.number.trim()}/${permit.year}`]));
}

/**
 * GET — bảng tiến độ đại tu như 4 file Sheet (trang /tien-ich/tien-do-dai-tu). Chỉ đọc, ai đăng nhập cũng xem.
 *  - không tham số: danh sách file → tab kèm số hạng mục;
 *  - `?source=&sheet=&from=&to=`: hạng mục của tab (thứ tự hàng trên Sheet) + ô ngày TRONG CỬA SỔ from…to, nhật ký rút
 *    gọn; "% Hoàn thành" / "Trạng thái hiện tại" vẫn tính trên toàn đợt (truy vấn riêng, không kèm nhật ký);
 *  - `?source=&sheet=&code=&day=`: nhật ký đầy đủ của một ô (bấm ô trên bảng).
 * Hạng mục lấy từ bảng đã đồng bộ từ Sheet; kết quả ngày lấy từ hàng đợi ghi Sheet (web là nguồn) — cùng quy tắc gộp
 * với bộ ghi Sheet nên web và Sheet hiện giống nhau. Dữ liệu gửi xuống chỉ phụ thuộc số ngày đang xem, không phình theo
 * lượng nhật ký tích luỹ.
 */
export async function GET(req: Request) {
  return handle(async () => {
    await requireUser();
    const params = new URL(req.url).searchParams;
    const source = params.get("source") ?? "", sheet = params.get("sheet") ?? "";

    if (!source && !sheet) {
      const [rows, last] = await Promise.all([
        prisma.workPermitOverhaulItem.findMany({ where: { isActive: true }, distinct: ["source", "sheet", "code"], select: { source: true, sheet: true, kind: true } }),
        prisma.workPermitOverhaulItem.aggregate({ _max: { syncedAt: true } }),
      ]);
      const tabs = new Map<string, { source: string; sourceLabel: string; sheet: string; kind: string; items: number }>();
      for (const row of rows) {
        const key = `${row.source}\u0000${row.sheet}`;
        const tab = tabs.get(key) ?? { source: row.source, sourceLabel: OVERHAUL_SOURCES[row.source as OverhaulSource] ?? row.source, sheet: row.sheet, kind: row.kind, items: 0 };
        tab.items++;
        tabs.set(key, tab);
      }
      const order = Object.keys(OVERHAUL_SOURCES);
      return ok([...tabs.values()].sort((a, b) => order.indexOf(a.source) - order.indexOf(b.source) || a.sheet.localeCompare(b.sheet, "vi")),
        { syncedAt: last._max.syncedAt?.toISOString() ?? null });
    }
    if (!(source in OVERHAUL_SOURCES) || !sheet) return fail("Chọn file và tab tiến độ đại tu", 400);

    // Một ô: nhật ký đầy đủ.
    const code = params.get("code"), day = params.get("day");
    if (code || day) {
      if (!code || !isDay(day)) return fail("Thiếu mã hạng mục hoặc ngày", 400);
      const rows = await prisma.overhaulSheetOutbox.findMany({
        where: { source, sheet, code, day }, select: { code: true, permitId: true, kind: true, day: true, status: true, percent: true, note: true, createdAt: true },
      });
      if (!rows.length) return ok(null);
      return ok(overhaulDayCell(rows, await permitNumbersOf(rows.filter(row => row.note).map(row => row.permitId))));
    }

    const from = isDay(params.get("from")) ? params.get("from")! : FIRST_DAY;
    const to = isDay(params.get("to")) ? params.get("to")! : LAST_DAY;
    if (from > to) return fail("Khoảng ngày không hợp lệ", 400);
    const [itemRows, summaryRows, windowRows, last] = await Promise.all([
      prisma.workPermitOverhaulItem.findMany({
        where: { isActive: true, source, sheet }, orderBy: [{ sheetRow: "asc" }, { code: "asc" }],
        select: { code: true, device: true, content: true, contractor: true, positionTitle: true, percent: true },
      }),
      // Toàn đợt, chỉ cột nhỏ: tính "Trạng thái hiện tại" + "% Hoàn thành".
      prisma.overhaulSheetOutbox.findMany({ where: { source, sheet }, select: { code: true, day: true, status: true, percent: true, createdAt: true } }),
      // Đúng cửa sổ ngày đang xem, kèm nhật ký.
      prisma.overhaulSheetOutbox.findMany({
        where: { source, sheet, day: { gte: from, lte: to } },
        select: { code: true, permitId: true, kind: true, day: true, status: true, percent: true, note: true, createdAt: true },
      }),
      prisma.workPermitOverhaulItem.aggregate({ _max: { syncedAt: true } }),
    ]);
    // Cùng mã ghi cho nhiều cương vị = một hàng trên Sheet → gộp, nối tên cương vị.
    const items = new Map<string, OverhaulGridItem>();
    for (const { percent, ...row } of itemRows) {
      const existing = items.get(row.code);
      if (!existing) { items.set(row.code, { ...row, sheetPercent: parseSheetPercent(percent) }); continue; }
      existing.sheetPercent ??= parseSheetPercent(percent);
      if (row.positionTitle && !existing.positionTitle.split(", ").includes(row.positionTitle)) existing.positionTitle = [existing.positionTitle, row.positionTitle].filter(Boolean).join(", ");
    }
    const permitNumbers = await permitNumbersOf(windowRows.filter(row => row.note).map(row => row.permitId));
    return ok(buildOverhaulGrid([...items.values()], windowRows, permitNumbers, { summaryRows, previewLength: OVERHAUL_JOURNAL_PREVIEW }),
      { syncedAt: last._max.syncedAt?.toISOString() ?? null, source, sheet, from, to });
  });
}
