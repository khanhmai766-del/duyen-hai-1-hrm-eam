/**
 * Kiểm tra nhanh sổ TBYCNN sau khi nạp: đếm theo cương vị / danh mục / tình trạng /
 * hạn kiểm định và dựng thử file Excel (ghi ra `--out` nếu có).
 *
 *   npx tsx scripts/check-tbycnn.ts [--out <đường dẫn .xlsx>]
 *
 * Chạy thẳng vào tầng dịch vụ nên không cần đăng nhập — dùng để soát dữ liệu và bố cục
 * báo cáo mà không phải mở giao diện.
 */
import { writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { computeTinhTrang, displayKdDate, kdStatus, TBYCNN_COLUMNS } from "../lib/tbycnn";

const prisma = new PrismaClient();

function argValue(name: string) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function main() {
  const period = await prisma.tbycnnPeriod.findFirst({
    where: { isClosed: false },
    orderBy: [{ year: "desc" }, { monthNo: "desc" }],
  });
  if (!period) throw new Error("Chưa có kỳ nào — chạy `npm run import:tbycnn` trước.");

  const rows = await prisma.tbycnnEquipment.findMany({
    where: { periodId: period.id },
    orderBy: [{ khuVuc: "asc" }, { nhomSo: "asc" }, { tt: "asc" }, { id: "asc" }],
  });

  console.log(`Kỳ ${period.label} — ${rows.length} thiết bị`);

  const byKhuVuc = new Map<string, number>();
  const byDanhMuc = new Map<string, number>();
  let khaDung = 0;
  let khongKhaDung = 0;
  let chuaCapNhat = 0;
  let quaHan = 0;
  let sapHan = 0;
  let khongCoHan = 0;
  let coChuKhongPhaiNgay = 0;

  for (const r of rows) {
    byKhuVuc.set(r.khuVuc, (byKhuVuc.get(r.khuVuc) ?? 0) + 1);
    byDanhMuc.set(r.danhMuc, (byDanhMuc.get(r.danhMuc) ?? 0) + 1);
    if ((r.soLuongKhongKhaDung ?? 0) > 0) khongKhaDung++;
    else if ((r.soLuongKhaDung ?? 0) > 0) khaDung++;
    else chuaCapNhat++;
    const s = kdStatus(r.kdTiepTheo);
    if (!s) {
      khongCoHan++;
      if (r.kdTiepTheoText) coChuKhongPhaiNgay++;
    } else if (s.type === "overdue") quaHan++;
    else if (s.type === "soon") sapHan++;
  }

  console.log(`\nCương vị (${byKhuVuc.size}):`);
  for (const [k, v] of [...byKhuVuc].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
  console.log(`\nDanh mục (${byDanhMuc.size}):`);
  for (const [k, v] of [...byDanhMuc].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);

  console.log("\nTình trạng:");
  console.log(`  khả dụng ${khaDung} · có thiết bị hỏng ${khongKhaDung} · chưa cập nhật ${chuaCapNhat}`);
  console.log("Hạn kiểm định:");
  console.log(
    `  quá hạn ${quaHan} · sắp đến hạn ${sapHan} · chưa có hạn ${khongCoHan} (trong đó ${coChuKhongPhaiNgay} ô ghi chữ, giữ nguyên văn)`
  );

  console.log("\n5 dòng đầu:");
  for (const r of rows.slice(0, 5)) {
    console.log(
      `  ${r.khuVuc} | ${r.nhom} | #${r.tt} ${r.tenThietBi} | KĐ tiếp theo: ${displayKdDate(r.kdTiepTheo, r.kdTiepTheoText) || "—"} | ${computeTinhTrang(r.soLuongKhaDung, r.soLuongKhongKhaDung) || "chưa cập nhật"}`
    );
  }

  const out = argValue("--out");
  if (!out) return;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`TBYCNN ${period.label}`);
  ws.addRow(["Cương vị quản lý", ...TBYCNN_COLUMNS.map((c) => c.label)]);
  for (const r of rows) {
    ws.addRow([
      r.khuVuc,
      ...TBYCNN_COLUMNS.map((c) => {
        if (c.key === "kdGanNhat") return displayKdDate(r.kdGanNhat, r.kdGanNhatText);
        if (c.key === "kdTiepTheo") return displayKdDate(r.kdTiepTheo, r.kdTiepTheoText);
        if (c.key === "tinhTrang") return computeTinhTrang(r.soLuongKhaDung, r.soLuongKhongKhaDung);
        const v = (r as unknown as Record<string, unknown>)[c.key];
        return v == null ? "" : String(v);
      }),
    ]);
  }
  writeFileSync(out, Buffer.from(await wb.xlsx.writeBuffer()));
  console.log(`\nĐã ghi thử ${out}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
