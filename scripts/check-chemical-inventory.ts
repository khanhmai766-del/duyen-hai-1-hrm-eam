import { PrismaClient } from "@prisma/client";
import {
  calculateAcceptedWeight,
  calculateClosingTotal,
  calculateConsumedTotal,
  calculateContractRemaining,
  calculateContractShortfall,
  calculateContractSurplus,
  calculateDailyUsed,
  calculateSpecificConsumption,
  convertUnit,
  medianUsage,
} from "../lib/chemical-inventory/calculations";
import {
  normalizeChemicalName,
  normalizeInventoryPeriod,
  normalizeInventoryPosition,
  parseCellNumber,
} from "../lib/chemical-inventory/normalize";
import { toDecimal, toNumber, sumDecimals } from "../lib/chemical-inventory/serialize";
import { ITEM_TYPE_LABELS, UNIT_LABELS, type BaseUnit, type ChemicalItemType } from "../lib/chemical-inventory/constants";

/**
 * Kiểm chứng pha 1 — CHỈ ĐỌC, không ghi gì vào DB.
 *
 * Chạy:  npx tsx scripts/check-chemical-inventory.ts
 *
 * Repo không có test runner nên đây là cách kiểm các hàm thuần: nạp đúng những
 * con số và những cách viết CÓ THẬT trong workbook nguồn rồi đối chiếu kết quả.
 */

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed += 1;
  else failed += 1;
  const mark = ok ? "  ✓" : "  ✗";
  const detail = ok ? `${JSON.stringify(actual)}` : `nhận ${JSON.stringify(actual)}, mong đợi ${JSON.stringify(expected)}`;
  console.log(`${mark} ${label.padEnd(58)} ${detail}`);
}

const fmt = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("vi-VN", { maximumFractionDigits: 3 });

async function main() {
  console.log("═".repeat(92));
  console.log("  KIỂM CHỨNG PHA 1 — MODULE TỒN KHO HÓA CHẤT");
  console.log("═".repeat(92));

  // -------------------------------------------------------------------------
  console.log("\n▌1. DANH MỤC MẶT HÀNG TRONG DB\n");
  const items = await prisma.chemicalInventoryItem.findMany({ orderBy: { sortOrder: "asc" } });

  console.log(
    "  Dòng  Mã                Tên                                Loại          Đơn vị  Theo dõi  Tab phiếu"
  );
  console.log("  " + "─".repeat(88));
  for (const it of items) {
    console.log(
      "  " +
        String(it.sheetRow ?? "").padStart(4) +
        "  " +
        it.code.padEnd(16) +
        "  " +
        it.name.padEnd(33) +
        "  " +
        ITEM_TYPE_LABELS[it.itemType as ChemicalItemType].padEnd(12) +
        "  " +
        UNIT_LABELS[it.baseUnit as BaseUnit].padEnd(6) +
        "  " +
        (it.trackingMode === "DAILY" ? "hằng ngày" : "hằng tháng").padEnd(9) +
        " " +
        (it.receiptSheet ?? "—")
    );
  }
  console.log(`\n  Tổng: ${items.length} mặt hàng`);

  const nh3 = items.find((i) => i.code === "NH3_99");
  if (nh3) {
    console.log(
      `  NH3: lưu bằng ${UNIT_LABELS[nh3.baseUnit as BaseUnit]}, hiển thị ${UNIT_LABELS[(nh3.displayUnit ?? nh3.baseUnit) as BaseUnit]}` +
        `, sức chứa ${fmt(toNumber(nh3.tankCapacity))} kg, ngưỡng thấp ${fmt(toNumber(nh3.lowStockThreshold))} kg`
    );
  }

  // -------------------------------------------------------------------------
  console.log("\n▌2. KHỐI LƯỢNG ĐƯỢC CÔNG NHẬN = SỐ CÂN NHỎ HƠN\n");
  // Ba dòng có thật trong tab NH3 của workbook.
  check("21500 / 21510  → lấy số nhà máy", calculateAcceptedWeight(21500, 21510).value, 21500);
  check("21740 / 21690  → lấy số nhà thầu", calculateAcceptedWeight(21740, 21690).value, 21690);
  check("21950 / 21950  → hai số bằng nhau", calculateAcceptedWeight(21950, 21950).value, 21950);
  check("chỉ có một số cân → cảnh báo", calculateAcceptedWeight(20000, null).warnings, ["MISSING_WEIGHT"]);

  // -------------------------------------------------------------------------
  console.log("\n▌3. TỒN CUỐI THÁNG — Ô TRỐNG KHÁC SỐ 0\n");
  // Dòng HCl 31% tháng 07/2026: chỉ ba cương vị có số (F, G, K).
  check("HCl 07/2026: 6435 + 8080 + 7214", calculateClosingTotal([null, 6435, 8080, null, null, null, 7214]), 21729);
  check("tất cả ô trống → null, KHÔNG phải 0", calculateClosingTotal([null, null, null]), null);
  check("có một ô ghi số 0 → tổng bằng 0", calculateClosingTotal([null, 0, null]), 0);

  // -------------------------------------------------------------------------
  console.log("\n▌4. LƯỢNG SỬ DỤNG — GIỮ NGUYÊN GIÁ TRỊ ÂM\n");
  // NH3 tháng 07/2026: tồn đầu 105.646, nhập 354.180, tồn cuối 165.158 (kg).
  check("NH3 07/2026 = 105646 + 354180 − 165158", calculateConsumedTotal(105_646, 354_180, 165_158), 294_668);
  // Bồn dầu HFO 1 tháng 12/2024: sheet không theo dõi lượng bơm vào bồn nên ra âm.
  check("HFO 1 (không có nguồn nhập) → âm, giữ nguyên", calculateConsumedTotal(351.3, null, 772.747), -421.447);
  check("thiếu tồn cuối → null, không đoán", calculateConsumedTotal(100, 50, null), null);

  // -------------------------------------------------------------------------
  console.log("\n▌5. NHẬT KÝ NGÀY NH3 (số thật tháng 07/2026, đơn vị tấn)\n");
  check("ngày 01: 105,646 + 41,82 − 127,126", calculateDailyUsed(105.646, 41.82, 127.126), 20.34);
  check("ngày 02: không có xe về", calculateDailyUsed(127.126, null, 106.408), 20.718);
  check("ngày 06: ba xe = 62,51 tấn", calculateDailyUsed(101.112, 62.51, 149.844), 13.778);
  // Trung vị thật (4 giá trị → trung bình hai số giữa). NH3Tracker.jsx lấy số
  // giữa trên cho gọn; ở đây dùng định nghĩa đúng vì nó là mốc phát hiện ngày bất thường.
  check("trung vị lượng dùng, bỏ qua null", medianUsage([20.34, 20.718, 13.778, null, 8.862]), 17.059);

  // -------------------------------------------------------------------------
  console.log("\n▌6. SUẤT HAO ĐẦU CỰC & QUY ĐỔI ĐƠN VỊ\n");
  const rate = calculateSpecificConsumption(294_668, 413_915);
  check("294.668 kg ÷ 413.915 MWh (kg/MWh)", rate === null ? null : Number(rate.toFixed(3)), 0.712);
  check("sản lượng bằng 0 → null, không chia cho 0", calculateSpecificConsumption(1000, 0), null);
  check("165158 kg → tấn", convertUnit(165_158, "KG", "TON"), 165.158);
  check("354,18 tấn → kg", convertUnit(354.18, "TON", "KG"), 354_180);
  try {
    convertUnit(100, "LITER", "KG");
    check("lít → kg phải bị chặn", "không ném lỗi", "ném lỗi");
  } catch {
    check("lít → kg bị chặn (hai đại lượng khác nhau)", "ném lỗi", "ném lỗi");
  }

  // -------------------------------------------------------------------------
  console.log("\n▌7. HỢP ĐỒNG — SỬA LẠI LỖI ĐẢO DẤU CỦA SHEET\n");
  // HCl 31% hợp đồng 2025: khối lượng 458.723 kg, nhu cầu đến cuối năm 51.004 kg.
  const remaining = calculateContractRemaining(458_723, 300_000);
  check("còn lại = 458.723 − 300.000", remaining, 158_723);
  check("thặng dư khi còn nhiều hơn nhu cầu", calculateContractSurplus(51_004, remaining), 107_719);
  check("thiếu hụt khi đó = 0, không âm", calculateContractShortfall(51_004, remaining), 0);
  check("thiếu hụt thật khi còn ít hơn nhu cầu", calculateContractShortfall(51_004, 20_000), 31_004);

  // -------------------------------------------------------------------------
  console.log("\n▌8. ĐỌC THÁNG DẠNG MMYYYY\n");
  const p1 = normalizeInventoryPeriod(12026);
  check('12026 → "2026-01"', p1.ok ? p1.periodKey : null, "2026-01");
  const p2 = normalizeInventoryPeriod(102024);
  check('102024 → "2024-10"', p2.ok ? p2.periodKey : null, "2024-10");
  const p3 = normalizeInventoryPeriod("072026");
  check('tên tab "072026" → "2026-07"', p3.ok ? p3.periodKey : null, "2026-07");
  const p4 = normalizeInventoryPeriod(72525);
  check("72525 (gõ nhầm trong sheet) → bị chặn", p4.ok, false);

  // -------------------------------------------------------------------------
  console.log("\n▌9. CHUẨN HÓA CƯƠNG VỊ — 14 CÁCH VIẾT CÓ THẬT\n");
  const variants = [
    "Máy phó",
    "XLNHH",
    "xlnhh",
    "XLNT",
    "XLN thải",
    "Trực phụ điện",
    "Trạm nước thô",
    "Nhà dầu 300 -MNK",
    "Máy phó + XLNT",
    "Máy phó, XLNHH",
    "XLHH + Máy phó",
    "Máy phó (5970kg)+ XLNHH (1800kg)",
    "Máy phó + XLNKK",
    "Máy phó+ máyphó",
    "",
  ];
  for (const v of variants) {
    const r = normalizeInventoryPosition(v);
    const verdict = r.multi
      ? "ĐA CƯƠNG VỊ → giữ nguyên văn, chờ tách tay"
      : r.code
        ? `→ ${r.code}`
        : v === ""
          ? "→ (bỏ trống)"
          : "KHÔNG NHẬN RA → cảnh báo";
    console.log(`  ${JSON.stringify(v).padEnd(36)} ${verdict}`);
  }
  check("số dòng đa cương vị nhận ra được", variants.filter((v) => normalizeInventoryPosition(v).multi).length, 6);

  // -------------------------------------------------------------------------
  console.log("\n▌10. KHỚP TÊN MẶT HÀNG & Ô GHI BẰNG CHỮ\n");
  check('"Dung dịch NH3 99%"', normalizeChemicalName("Dung dịch NH3 99%"), "NH3_99");
  check('"Dung dịch PAC 12% lỏng " (dư dấu cách)', normalizeChemicalName("Dung dịch PAC 12% lỏng "), "PAC_12");
  check('"DUNG DỊCH NAOH 32%" (viết hoa)', normalizeChemicalName("DUNG DỊCH NAOH 32%"), "NAOH_32");
  const mm = parseCellNumber("794 mm (DCS), \n 760 mm (Local)");
  check("mức bồn DO ghi bằng mm → không thành số", mm.value, null);
  check("  …và được giữ nguyên văn + cảnh báo", mm.warnings, ["NON_NUMERIC_VALUE"]);
  check("ô số bình thường", parseCellNumber(21500).value, 21500);

  // -------------------------------------------------------------------------
  console.log("\n▌11. VÒNG ĐỜI DECIMAL (nhóm bảng đầu tiên của repo dùng Decimal)\n");
  const d = toDecimal(191_068.904);
  check("number → Decimal → number giữ nguyên 3 số lẻ", toNumber(d), 191_068.904);
  check("cộng bằng Decimal, không tích lũy sai số", sumDecimals([0.1, 0.2]), 0.3);
  check("cộng bằng float thường thì lệch", 0.1 + 0.2 === 0.3, false);
  check("null bị bỏ qua, không hóa thành 0", sumDecimals([null, null]), null);
  try {
    toDecimal(Number.POSITIVE_INFINITY);
    check("Infinity phải bị chặn", "không ném lỗi", "ném lỗi");
  } catch {
    check("Infinity bị chặn trước khi ghi DB", "ném lỗi", "ném lỗi");
  }

  // -------------------------------------------------------------------------
  console.log("\n" + "═".repeat(92));
  console.log(`  KẾT QUẢ: ${passed} đạt · ${failed} sai`);
  console.log("═".repeat(92));
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("❌ Lỗi:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
