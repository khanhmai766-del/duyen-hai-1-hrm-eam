/**
 * Áp bốn thay đổi của bản web mới lên DỮ LIỆU đã có (mã nguồn đã đổi ở commit đi kèm).
 *
 *   npx tsx scripts/apply-pccc-web-moi.ts            # DRY-RUN
 *   npx tsx scripts/apply-pccc-web-moi.ts --apply    # ghi thật
 *
 * 1. Ngưỡng FOAM/CO2/Diesel 0,90/0,70 → 0,75/0,50: tính lại nhãn `tinhTrang` đã lưu sẵn.
 * 2. Nhóm KÍNH của tủ chữa cháy: 2 mức (Khả dụng | Bất khả dụng) → 3 mức mẫu mới
 *    (Khả dụng | Nứt | Bể).
 *
 * Áp suất → phần trăm nằm ở prisma/manual/convert-pccc-apsuat-to-percent.sql vì đó là
 * đổi KIỂU CỘT, phải chạy trước khi prisma client biết cột này là số.
 *
 * CHỈ ĐỤNG KỲ CHƯA CHỐT. Kỳ đã chốt giữ nguyên: đổi 3 mức kính làm "Nứt" tụt từ khiếm
 * khuyết NẶNG xuống khiếm khuyết NHẸ, tức là lật kết luận của một số tủ từ Không đạt sang
 * Đạt — sửa kết luận kiểm tra của một kỳ đã ký là chuyện khác hẳn đổi cách ghi.
 *
 * Idempotent: chạy lại lần hai không đổi gì thêm.
 */
import { PrismaClient } from "@prisma/client";
import { fcdStatus } from "../lib/pccc-summary";
import { deriveCabinetStatus } from "../lib/pccc-status";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

/** Ghi chú của tủ cho biết kính nứt hay bể; không nói gì thì giữ mức NẶNG. */
function glassStatusFrom(note: string | null): "Nứt" | "Bể" {
  const g = (note ?? "").toLowerCase();
  if (g.includes("nứt")) return "Nứt";
  // Mặc định "Bể" khi ghi chú không nói: hạ xuống "Nứt" là tự ý NỚI kết luận an toàn
  // cháy nổ của một cái tủ mà không ai kiểm tra lại.
  return "Bể";
}

async function main() {
  console.log(APPLY ? "CHẾ ĐỘ GHI THẬT (--apply)\n" : "DRY-RUN — chưa ghi gì. Thêm --apply để ghi thật.\n");

  const periods = await prisma.pcccPeriod.findMany({ select: { id: true, label: true, closedAt: true } });
  const open = periods.filter((p) => !p.closedAt);
  console.log(`Kỳ mở: ${open.map((p) => p.label).join(", ") || "(không có)"}`);
  console.log(`Kỳ đã chốt (bỏ qua): ${periods.filter((p) => p.closedAt).map((p) => p.label).join(", ") || "(không có)"}\n`);

  // ---- 1. Ngưỡng FOAM/CO2/Diesel
  console.log("--- 1. Ngưỡng FOAM/CO2/Diesel ---");
  for (const p of open) {
    const bulks = await prisma.pcccBulk.findMany({ where: { periodId: p.id }, select: { id: true, ten: true, phanTramConLai: true, tinhTrang: true } });
    for (const b of bulks) {
      const next = fcdStatus(b.phanTramConLai);
      if (next === b.tinhTrang) continue;
      const pct = b.phanTramConLai === null ? "—" : `${(b.phanTramConLai * 100).toFixed(1)}%`;
      console.log(`  ${p.label} ${b.ten} (${pct}): "${b.tinhTrang}" → "${next}"`);
      if (APPLY) await prisma.pcccBulk.update({ where: { id: b.id }, data: { tinhTrang: next } });
    }
  }

  // ---- 2. Nhóm KÍNH 2 mức → 3 mức
  console.log("\n--- 2. Nhóm KÍNH của tủ chữa cháy ---");
  let themO = 0;
  let doiTich = 0;
  const lat: string[] = [];
  for (const p of open) {
    const cabinets = await prisma.pcccCabinet.findMany({
      where: { periodId: p.id },
      select: { id: true, ma: true, ghiChu: true, tinhTrangTongThe: true, components: true },
    });
    for (const cab of cabinets) {
      const kinh = cab.components.filter((c) => c.groupLabel === "KÍNH");
      if (!kinh.length) continue;
      if (kinh.some((c) => c.status === "Bể")) continue; // đã quy đổi rồi

      const batKhaDung = kinh.find((c) => c.status === "Bất khả dụng");
      if (!batKhaDung) continue;
      const dich = batKhaDung.checked ? glassStatusFrom(cab.ghiChu) : "Bể";
      const groupOrder = batKhaDung.groupOrder;

      // "Bất khả dụng" (thứ tự 1) trở thành "Nứt", và thêm ô "Bể" ở thứ tự 2.
      themO += 1;
      if (dich === "Nứt" && batKhaDung.checked) lat.push(`${p.label} ${cab.ma} — "${(cab.ghiChu ?? "").slice(0, 45)}"`);
      if (batKhaDung.checked) doiTich += 1;

      if (APPLY) {
        await prisma.pcccCabinetComponent.update({
          where: { id: batKhaDung.id },
          data: { status: "Nứt", statusOrder: 1, checked: dich === "Nứt" && batKhaDung.checked },
        });
        await prisma.pcccCabinetComponent.create({
          data: {
            cabinetId: cab.id,
            groupLabel: "KÍNH",
            groupOrder,
            status: "Bể",
            statusOrder: 2,
            checked: dich === "Bể" && batKhaDung.checked,
          },
        });
        const fresh = await prisma.pcccCabinetComponent.findMany({ where: { cabinetId: cab.id } });
        const tinhTrang = deriveCabinetStatus(fresh);
        if (tinhTrang !== cab.tinhTrangTongThe) {
          await prisma.pcccCabinet.update({ where: { id: cab.id }, data: { tinhTrangTongThe: tinhTrang } });
        }
      }
    }
  }
  console.log(`  ${themO} tủ được thêm ô "Bể"; ${doiTich} tủ đang tích kính hỏng được phân loại lại.`);
  if (lat.length) {
    console.log(`\n  ⚠ ${lat.length} tủ chuyển sang "Nứt" — theo mẫu mới đây là khiếm khuyết NHẸ nên`);
    console.log("    tình trạng tổng thể lật từ Không đạt sang ĐẠT. Cần người kiểm tra soi lại:");
    for (const line of lat) console.log(`      ${line}`);
  }

  if (!APPLY) console.log("\nChưa ghi gì. Chạy lại với --apply để áp dụng.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
