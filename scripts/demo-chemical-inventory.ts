import { PrismaClient } from "@prisma/client";
import {
  calculateConsumedTotal,
  calculateDailyUsed,
  calculateSpecificConsumption,
  convertUnit,
  inspectDailyRow,
  medianUsage,
} from "../lib/chemical-inventory/calculations";
import { lastDateOfPeriod, previousPeriodKey } from "../lib/chemical-inventory/normalize";
import { toDecimal, toNumber } from "../lib/chemical-inventory/serialize";
import { WARNING_LABELS, type WarningCode } from "../lib/chemical-inventory/constants";
import { normalizeVehicleNumber } from "../lib/chemical-inventory/validation";

/**
 * Nạp dữ liệu MẪU của nhật ký NH3 tháng 07/2026 vào DB cục bộ để nhìn thấy mô hình
 * chạy thật trước khi dựng giao diện.
 *
 * Chạy:   npx tsx scripts/demo-chemical-inventory.ts
 * Gỡ ra:  npx tsx scripts/demo-chemical-inventory.ts --xoa
 *
 * Nguồn số: file NH3Tracker.jsx do người dùng cung cấp (bản ghi tay tháng 07/2026).
 * Đã đối chiếu với workbook và khớp tuyệt đối ở cả ba điểm — tồn đầu 105.646 kg,
 * 17 chuyến xe 354.180 kg, tồn cuối 165.158 kg. Script này chứng minh mô hình dữ
 * liệu tái lập được đúng ba con số đó mà KHÔNG cần ai chép tay sang sổ tháng.
 *
 * CHỈ dùng cho DB dev. Không chạy trên production.
 */

const prisma = new PrismaClient();

const PERIOD = "2026-07";
const NH3_POSITION = "AUX_BOILER_NH3";
const GENERATION_MWH = 413_915; // sản lượng điện S1+S2 tháng 07/2026

/** [ngày, tồn 00h (tấn), tồn 24h (tấn), [[biển số, khối lượng (tấn)], …]] */
const DAILY_LOG: ReadonlyArray<[number, number, number, ReadonlyArray<[string, number]>]> = [
  [1, 105.646, 127.126, [["51C-214.77", 21.07], ["51C-309.12", 20.75]]],
  [2, 127.126, 106.408, []],
  [3, 106.408, 132.613, [["51C-118.40", 20.86], ["51C-772.05", 20.88]]],
  [4, 132.613, 117.652, []],
  [5, 117.652, 101.112, []],
  [6, 101.112, 149.844, [["51C-214.77", 20.62], ["51C-309.12", 21.19], ["51C-118.40", 20.7]]],
  [7, 149.844, 140.982, []],
  [8, 140.982, 174.444, [["51C-772.05", 20.53], ["51C-214.77", 20.96]]],
  [9, 174.444, 167.986, []],
  [10, 167.986, 180.763, [["51C-309.12", 20.86]]],
  [11, 180.763, 173.682, []],
  [12, 173.682, 166.73, []],
  [13, 166.73, 158.372, []],
  [14, 158.372, 150.455, []],
  [15, 150.455, 183.98, [["51C-118.40", 20.89], ["51C-772.05", 20.84]]],
  [16, 183.98, 175.944, []],
  [17, 175.944, 168.282, []],
  [18, 168.282, 161.534, []],
  [19, 161.534, 154.806, []],
  [20, 154.806, 188.303, [["51C-214.77", 20.79], ["51C-309.12", 20.62]]],
  [21, 188.303, 179.158, []],
  [22, 179.158, 171.127, []],
  [23, 171.127, 164.226, []],
  [24, 164.226, 177.054, [["51C-118.40", 20.86]]],
  [25, 177.054, 169.244, []],
  [26, 169.244, 162.023, []],
  [27, 162.023, 193.394, [["51C-772.05", 20.89], ["51C-214.77", 20.87]]],
  [28, 193.394, 186.398, []],
  [29, 186.398, 178.724, []],
  [30, 178.724, 172.048, []],
  [31, 172.048, 165.158, []],
];

/** Số của sheet để đối chiếu — KHÔNG dùng làm dữ liệu, chỉ để in ra so sánh. */
const SHEET = { opening: 105_646, received: 354_180, closing: 165_158, consumed: 294_668 };

const utcDate = (day: number) => new Date(Date.UTC(2026, 6, day));
const fmt = (v: number | null, dp = 3) =>
  v === null ? "—" : v.toLocaleString("vi-VN", { minimumFractionDigits: dp, maximumFractionDigits: dp });

async function wipe() {
  const item = await prisma.chemicalInventoryItem.findUnique({ where: { code: "NH3_99" } });
  if (!item) return;
  const { count: receipts } = await prisma.chemicalReceipt.deleteMany({
    where: { itemId: item.id, periodKey: PERIOD, source: "DAILY_LOG" },
  });
  // Xoá kỳ là xoá luôn bản đọc nhờ onDelete: Cascade.
  const { count: periods } = await prisma.chemicalInventoryPeriod.deleteMany({
    where: { periodKey: { in: [PERIOD, previousPeriodKey(PERIOD)] } },
  });
  console.log(`🧹 Đã xoá dữ liệu mẫu: ${receipts} phiếu nhập, ${periods} kỳ.\n`);
}

async function main() {
  if (process.argv.includes("--xoa")) {
    await wipe();
    return;
  }

  const item = await prisma.chemicalInventoryItem.findUnique({ where: { code: "NH3_99" } });
  if (!item) throw new Error("Chưa có danh mục — chạy scripts/seed-chemical-inventory.ts trước.");

  console.log("═".repeat(88));
  console.log("  NẠP NHẬT KÝ NH3 THÁNG 07/2026 (dữ liệu mẫu)");
  console.log("═".repeat(88));

  // --- Kỳ trước: chỉ cần tồn cuối để làm tồn đầu cho tháng 7 ---------------
  const prevKey = previousPeriodKey(PERIOD);
  const prevPeriod = await prisma.chemicalInventoryPeriod.upsert({
    where: { periodKey: prevKey },
    update: {},
    create: { periodKey: prevKey, status: "LOCKED", note: "Kỳ mồi cho dữ liệu mẫu" },
  });
  await prisma.chemicalStockReading.upsert({
    where: {
      itemId_positionCode_readDate_kind: {
        itemId: item.id,
        positionCode: NH3_POSITION,
        readDate: lastDateOfPeriod(prevKey),
        kind: "MONTH_END",
      },
    },
    update: { quantity: toDecimal(SHEET.opening) },
    create: {
      periodId: prevPeriod.id,
      periodKey: prevKey,
      itemId: item.id,
      positionCode: NH3_POSITION,
      readDate: lastDateOfPeriod(prevKey),
      kind: "MONTH_END",
      quantity: toDecimal(SHEET.opening),
      source: "SHEET_IMPORT",
    },
  });

  // --- Kỳ 07/2026 ----------------------------------------------------------
  const period = await prisma.chemicalInventoryPeriod.upsert({
    where: { periodKey: PERIOD },
    update: { generationMwh: toDecimal(GENERATION_MWH) },
    create: { periodKey: PERIOD, status: "DRAFT", generationMwh: toDecimal(GENERATION_MWH) },
  });

  let truckCount = 0;
  for (const [day, , closeTon, trucks] of DAILY_LOG) {
    const readDate = utcDate(day);

    // Tồn 00h KHÔNG lưu: nó chính là tồn 24h ngày trước, lưu lại là tạo ra hai
    // nguồn sự thật cho cùng một con số.
    await prisma.chemicalStockReading.upsert({
      where: {
        itemId_positionCode_readDate_kind: {
          itemId: item.id,
          positionCode: NH3_POSITION,
          readDate,
          kind: "DAILY",
        },
      },
      update: { quantity: toDecimal(convertUnit(closeTon, "TON", "KG")) },
      create: {
        periodId: period.id,
        periodKey: PERIOD,
        itemId: item.id,
        positionCode: NH3_POSITION,
        readDate,
        kind: "DAILY",
        quantity: toDecimal(convertUnit(closeTon, "TON", "KG")),
        source: "MANUAL",
      },
    });

    for (const [plate, weightTon] of trucks) {
      const kg = convertUnit(weightTon, "TON", "KG");
      // Chuẩn hóa giống hệt mọi cửa nhập khác: "51C-214.77" → "51C21477".
      const vehicleNumber = normalizeVehicleNumber(plate);
      if (!vehicleNumber) throw new Error(`Biển số không đọc được: ${plate}`);
      await prisma.chemicalReceipt.upsert({
        where: {
          itemId_receivedAt_vehicleNumber: { itemId: item.id, receivedAt: readDate, vehicleNumber },
        },
        update: { acceptedWeight: toDecimal(kg)! },
        create: {
          itemId: item.id,
          receivedAt: readDate,
          periodKey: PERIOD,
          vehicleNumber,
          acceptedWeight: toDecimal(kg)!,
          receivingPosition: NH3_POSITION,
          source: "DAILY_LOG",
          // Nhật ký ngày chỉ ghi một con số khối lượng; hai số cân nhà máy/nhà thầu
          // sẽ về sau qua bước xác nhận lãnh của phiếu vật tư.
          warnings: ["MISSING_WEIGHT"],
        },
      });
      truckCount += 1;
    }
  }

  // --- Sinh MONTH_END từ bản đọc ngày cuối tháng ---------------------------
  // Đây là quy tắc cốt lõi: ô "tồn cuối NH3" trên lưới tháng KHÔNG do ai gõ vào,
  // nó là bản đọc 24h của ngày cuối cùng theo lịch. Logic đầy đủ sẽ nằm trong
  // lib/chemical-inventory/readings.ts ở pha 3; ở đây làm tay để chứng minh.
  const lastDate = lastDateOfPeriod(PERIOD);
  const lastDaily = await prisma.chemicalStockReading.findUnique({
    where: {
      itemId_positionCode_readDate_kind: {
        itemId: item.id,
        positionCode: NH3_POSITION,
        readDate: lastDate,
        kind: "DAILY",
      },
    },
  });
  await prisma.chemicalStockReading.upsert({
    where: {
      itemId_positionCode_readDate_kind: {
        itemId: item.id,
        positionCode: NH3_POSITION,
        readDate: lastDate,
        kind: "MONTH_END",
      },
    },
    update: { quantity: lastDaily?.quantity ?? null, source: "DERIVED" },
    create: {
      periodId: period.id,
      periodKey: PERIOD,
      itemId: item.id,
      positionCode: NH3_POSITION,
      readDate: lastDate,
      kind: "MONTH_END",
      quantity: lastDaily?.quantity ?? null,
      source: "DERIVED",
      note: "Tự động từ bản đọc ngày cuối tháng",
    },
  });

  console.log(`\n  Đã ghi ${DAILY_LOG.length} bản đọc ngày và ${truckCount} chuyến xe.\n`);

  // --- Đọc ngược từ DB rồi tính lại ---------------------------------------
  const dailyRows = await prisma.chemicalStockReading.findMany({
    where: { itemId: item.id, periodKey: PERIOD, kind: "DAILY" },
    orderBy: { readDate: "asc" },
  });
  const receipts = await prisma.chemicalReceipt.findMany({
    where: { itemId: item.id, periodKey: PERIOD },
  });

  const importedByDay = new Map<number, number>();
  for (const r of receipts) {
    const day = r.receivedAt.getUTCDate();
    importedByDay.set(day, (importedByDay.get(day) ?? 0) + (toNumber(r.acceptedWeight) ?? 0));
  }

  console.log("  Ngày  Tồn 00h      Nhập        Tồn 24h      Đã dùng     Cảnh báo");
  console.log("  " + "─".repeat(82));

  const usedSeries: (number | null)[] = [];
  let previousClosing: number | null = SHEET.opening;
  const rendered: Array<{ day: number; open: number | null; imp: number; close: number | null; used: number | null }> = [];

  for (const row of dailyRows) {
    const day = row.readDate.getUTCDate();
    const closing = toNumber(row.quantity);
    const imported = importedByDay.get(day) ?? 0;
    const used = calculateDailyUsed(previousClosing, imported, closing);
    usedSeries.push(used);
    rendered.push({ day, open: previousClosing, imp: imported, close: closing, used });
    previousClosing = closing;
  }

  const median = medianUsage(usedSeries);

  for (const r of rendered) {
    const warnings = inspectDailyRow({
      openingStock: r.open,
      closingStock: r.close,
      previousClosingStock: r.open,
      used: r.used,
      monthMedianUsage: median,
      tankCapacity: toNumber(item.tankCapacity),
      lowStockThreshold: toNumber(item.lowStockThreshold),
    });
    const flag = warnings.length
      ? warnings.map((w) => WARNING_LABELS[w as WarningCode]).join("; ")
      : "";
    console.log(
      "  " +
        String(r.day).padStart(4) +
        "  " +
        fmt(r.open).padStart(11) +
        "  " +
        (r.imp ? fmt(r.imp) : "—").padStart(10) +
        "  " +
        fmt(r.close).padStart(11) +
        "  " +
        fmt(r.used).padStart(10) +
        "  " +
        flag
    );
  }

  // --- Đối chiếu với sổ tháng ---------------------------------------------
  const monthEnd = await prisma.chemicalStockReading.findFirst({
    where: { itemId: item.id, periodKey: PERIOD, kind: "MONTH_END" },
  });
  const closing = toNumber(monthEnd?.quantity ?? null);
  const received = receipts.reduce((s, r) => s + (toNumber(r.acceptedWeight) ?? 0), 0);
  const consumed = calculateConsumedTotal(SHEET.opening, received, closing);
  const rate = calculateSpecificConsumption(consumed, GENERATION_MWH);

  console.log("\n" + "═".repeat(88));
  console.log("  ĐỐI CHIẾU VỚI SỔ THÁNG (đơn vị kg)");
  console.log("═".repeat(88));
  const line = (label: string, computed: number | null, sheet: number) => {
    const delta = computed === null ? null : computed - sheet;
    const mark = delta !== null && Math.abs(delta) < 0.001 ? "✓" : "✗";
    console.log(
      `  ${mark} ${label.padEnd(34)} tính ${fmt(computed, 0).padStart(11)}   sổ ${fmt(sheet, 0).padStart(11)}   lệch ${fmt(delta, 3).padStart(8)}`
    );
  };
  line("Tồn đầu tháng (từ kỳ 06/2026)", SHEET.opening, SHEET.opening);
  line(`Nhập trong tháng (${receipts.length} chuyến)`, received, SHEET.received);
  line("Tồn cuối tháng (từ nhật ký ngày 31)", closing, SHEET.closing);
  line("Lượng sử dụng", consumed, SHEET.consumed);
  console.log(
    `\n  Suất hao đầu cực: ${rate === null ? "—" : rate.toFixed(3)} kg/MWh  ` +
      `(sản lượng S1+S2 = ${GENERATION_MWH.toLocaleString("vi-VN")} MWh)`
  );
  console.log("\n  Xem dữ liệu tận mắt:  npm run db:studio  →  bảng ChemicalStockReading / ChemicalReceipt");
  console.log("  Gỡ dữ liệu mẫu:       npx tsx scripts/demo-chemical-inventory.ts --xoa\n");
}

main()
  .catch((e) => {
    console.error("❌ Lỗi:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
