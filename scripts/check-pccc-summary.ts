import { PrismaClient } from "@prisma/client";
import {
  periodEndDate,
  summarizeCabinets,
  summarizeExtinguishers,
  summarizeBulks,
  summarizeFm200,
} from "../lib/pccc-summary";

const p = new PrismaClient();
const LABEL = process.argv[2] ?? "T08.2026";

async function main() {
  const period = await p.pcccPeriod.findUniqueOrThrow({ where: { label: LABEL } });
  const end = periodEndDate(LABEL);

  const bcc = await p.pcccExtinguisher.findMany({
    where: { periodId: period.id },
    select: { chungLoai: true, tinhTrang: true, tinhTrangNgoai: true, denHanThayThe: true },
  });
  const s = summarizeExtinguishers(bcc, end);
  console.log(`\n=== I. BÌNH CHỮA CHÁY (${LABEL}) — mốc hạn: ${end.toISOString().slice(0, 10)} ===`);
  console.table(
    [...s.rows, s.total].map((r) => ({
      "Chỉ số": r.chungLoai,
      "Tổng số": r.tongSo,
      "Đạt": r.dat,
      "Không đạt": r.khongDat,
      "Chưa cập nhật": r.chuaCapNhat,
      "Quá hạn": r.quaHanThayThe,
      "Sắp đến hạn": r.sapDenHan,
      "Gỉ thân": r.giSetThanBinh,
      "Gỉ tay nắm": r.giSetTayNam,
      "% Đạt": (r.phanTramDat * 100).toFixed(2) + "%",
    }))
  );

  const cabinets = await p.pcccCabinet.findMany({ where: { periodId: period.id }, include: { components: true } });
  const c = summarizeCabinets(cabinets);
  console.log("=== II. TỦ CHỮA CHÁY ===");
  console.table(
    c.rows.map((r) => ({
      "Linh kiện": r.groupLabel,
      "Loại tủ": r.loaiTu,
      "Bình thường": r.binhThuong,
      "Hư hỏng 1 phần": r.huHong1Phan,
      "Hư hỏng hoàn toàn": r.huHongHoanToan,
    }))
  );
  console.log("TỔNG CỘNG:", c.total);

  console.log("=== II.b RON CHỮA CHÁY (tính từ khối ô ☑) ===");
  console.table(
    c.ron.map((r) => ({
      "Loại ron": r.loaiRon,
      "Loại tủ": r.loaiTu,
      "Số tủ": r.soTu,
      "Tổng vị trí ron": r.tongRon,
      "Đầy đủ": r.dayDu,
      "Thiếu ron": r.thieuRon,
      "Chi tiết thiếu": JSON.stringify(r.thieuRonTheoNhom),
    }))
  );

  const bulks = await p.pcccBulk.findMany({ where: { periodId: period.id }, select: { ten: true, phanTramConLai: true } });
  console.log("=== III. FOAM/CO2/DIESEL ===");
  console.table(
    summarizeBulks(bulks).map((b) => ({
      Tên: b.ten,
      "% còn lại": b.phanTramConLai === null ? "—" : (b.phanTramConLai * 100).toFixed(1) + "%",
      "Tình trạng": b.tinhTrang,
    }))
  );

  const panels = await p.pcccFm200Panel.findMany({ where: { periodId: period.id } });
  const fm = summarizeFm200(
    panels.map((x) => ({
      panelKey: x.panelKey,
      binhLabels: x.binhLabels,
      mucMin: x.mucMin,
      mucMax: x.mucMax,
      mucValues: x.mucValues as Record<string, number | null>,
      apMin: x.apMin,
      apMax: x.apMax,
      apValues: x.apValues as Record<string, number | null>,
    }))
  );
  console.log(
    "=== IV. FM200 ===",
    fm.map((f) => `${f.panelKey}: ${f.binh.length} bình, ${f.binh.filter((b) => b.muc.value !== null).length} bình đã có số liệu mức`)
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
