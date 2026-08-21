import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { buildImportPlan, SEED_PERIOD_KEY, type ImportPlan, type ReconcileRow } from "../lib/chemical-inventory/importer";
import { commitImportPlan } from "../lib/chemical-inventory/import-commit";
import { SEED_ITEMS } from "../lib/chemical-inventory/constants";

/**
 * Nhập workbook "Theo dõi hóa chất nhập" vào DB.
 *
 *   npx tsx scripts/import-chemical-inventory.ts <đường-dẫn.xlsx>              # thử khô, không ghi
 *   npx tsx scripts/import-chemical-inventory.ts <đường-dẫn.xlsx> --commit     # ghi thật
 *
 * Mặc định là THỬ KHÔ. Phải gõ --commit mới ghi.
 */

const prisma = new PrismaClient();

const DEFAULT_FILE = "exports/20260105 Theo dõi hóa chất nhập năm 2026.xlsx";
const CHEMICAL_CODES = SEED_ITEMS.filter((i) => i.itemType === "CHEMICAL").map((i) => i.code);
const NAME_BY_CODE = new Map(SEED_ITEMS.map((i) => [i.code, i.name]));

const num = (v: number | null, dp = 3) =>
  v === null ? "—" : v.toLocaleString("vi-VN", { minimumFractionDigits: dp, maximumFractionDigits: dp });

function printPlan(plan: ImportPlan) {
  console.log("═".repeat(96));
  console.log(`  ĐỌC WORKBOOK: ${plan.fileName}`);
  console.log(`  Mã tệp: ${plan.fileHash}`);
  console.log("═".repeat(96));

  console.log("\n▌TỪNG TAB\n");
  console.log("  Tab                              Vai trò    Đọc  Hợp lệ  Bỏ qua   Lỗi");
  console.log("  " + "─".repeat(76));
  for (const s of plan.bySheet) {
    if (s.rowsRead === 0 && s.role !== "MONTHLY" && s.role !== "RECEIPT") {
      console.log(`  ${s.sheet.padEnd(32)} ${s.role.padEnd(9)}    (bỏ qua)`);
      continue;
    }
    console.log(
      `  ${s.sheet.padEnd(32)} ${s.role.padEnd(9)} ${String(s.rowsRead).padStart(4)} ${String(s.rowsValid).padStart(7)} ${String(s.rowsSkipped).padStart(7)} ${String(s.rowsError).padStart(5)}`
    );
  }

  console.log("\n▌KẾ HOẠCH GHI\n");
  console.log(`  Kỳ            : ${plan.periods.length}  (${plan.periods.map((p) => p.periodKey + (p.isSeed ? "*" : "")).join(", ")})`);
  console.log(`                  * = kỳ mồi, chỉ lấy tồn cuối làm tồn đầu cho tháng sau`);
  console.log(`  Bản đọc tồn   : ${plan.readings.length}`);
  console.log(`  Phiếu nhập    : ${plan.receipts.length}`);
  console.log(`  Hợp đồng      : ${plan.contracts.length}`);
  console.log(`  Mã vật tư ERP : ${Object.keys(plan.itemMaterialCodes).length} mặt hàng được gắn mã`);

  const errors = plan.issues.filter((i) => i.severity === "error");
  const warnings = plan.issues.filter((i) => i.severity === "warning");
  const infos = plan.issues.filter((i) => i.severity === "info");

  console.log(`\n▌VẤN ĐỀ: ${errors.length} lỗi · ${warnings.length} cảnh báo · ${infos.length} ghi chú\n`);

  const byCode = new Map<string, number>();
  for (const issue of [...errors, ...warnings]) byCode.set(issue.code, (byCode.get(issue.code) ?? 0) + 1);
  for (const [code, count] of [...byCode.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)} × ${code}`);
  }

  if (errors.length) {
    console.log("\n  LỖI (chặn ghi):");
    for (const e of errors.slice(0, 15)) {
      console.log(`   ✗ [${e.sheet}${e.row ? ` dòng ${e.row}` : ""}] ${e.message}`);
    }
    if (errors.length > 15) console.log(`   … và ${errors.length - 15} lỗi nữa`);
  }

  if (warnings.length) {
    console.log("\n  CẢNH BÁO (không chặn ghi):");
    for (const w of warnings.slice(0, 12)) {
      console.log(`   ! [${w.sheet}${w.row ? ` dòng ${w.row}` : ""}] ${w.message}`);
    }
    if (warnings.length > 12) console.log(`   … và ${warnings.length - 12} cảnh báo nữa`);
  }

  if (infos.length) {
    console.log("\n  GHI CHÚ:");
    for (const i of infos) console.log(`   · [${i.sheet}] ${i.message}`);
  }
}

/** Bảng đối soát: lượng sử dụng 6 hóa chất, từng tháng, tính lại so với cột O của sheet. */
function printReconciliation(plan: ImportPlan) {
  console.log("\n" + "═".repeat(96));
  console.log("  ĐỐI SOÁT LƯỢNG SỬ DỤNG — TÍNH LẠI TỪ NGUỒN vs CỘT O CỦA SHEET (kg)");
  console.log("═".repeat(96));

  const consumed = plan.reconcile.filter((r) => r.field === "consumed");
  const periodKeys = [...new Set(consumed.map((r) => r.periodKey))].sort();

  console.log("\n  Hóa chất        " + periodKeys.map((p) => p.slice(5) + "/" + p.slice(2, 4)).map((s) => s.padStart(12)).join("") + "        TỔNG");
  console.log("  " + "─".repeat(94));

  const totals: Record<string, { computed: number; sheet: number; allOk: boolean }> = {};

  for (const code of CHEMICAL_CODES) {
    let sumComputed = 0;
    let sumSheet = 0;
    let allOk = true;
    const cells: string[] = [];

    for (const periodKey of periodKeys) {
      const row = consumed.find((r) => r.itemCode === code && r.periodKey === periodKey);
      if (!row || row.computed === null) {
        cells.push("—".padStart(12));
        continue;
      }
      sumComputed += row.computed;
      if (row.sheetValue !== null) sumSheet += row.sheetValue;
      if (!row.ok) allOk = false;
      cells.push((row.ok ? "" : "!") + num(row.computed, 0).padStart(row.ok ? 12 : 11));
    }

    totals[code] = { computed: sumComputed, sheet: sumSheet, allOk };
    const label = (NAME_BY_CODE.get(code) ?? code).replace("Dung dịch ", "");
    console.log("  " + label.padEnd(16) + cells.join("") + num(sumComputed, 0).padStart(12));
  }

  console.log("\n  " + "─".repeat(94));
  console.log("  TỔNG 01–07/2026: tính lại  vs  tổng cột O của sheet\n");
  let mismatches = 0;
  for (const code of CHEMICAL_CODES) {
    const t = totals[code];
    const delta = t.computed - t.sheet;
    const magnitude = Math.abs(delta);
    // Dưới 10 g là số cộng tay trong công thức của sheet, không phải sai sót tính toán.
    const mark = magnitude < 0.001 ? "✓" : magnitude < 0.01 ? "≈" : "✗";
    if (mark === "✗") mismatches += 1;
    const label = (NAME_BY_CODE.get(code) ?? code).replace("Dung dịch ", "");
    console.log(
      `  ${mark} ${label.padEnd(18)} tính ${num(t.computed).padStart(15)}   sheet ${num(t.sheet).padStart(15)}   lệch ${num(delta).padStart(10)}`
    );
  }
  console.log("\n  ✓ khớp tuyệt đối   ≈ lệch dưới 10 g do sheet cộng tay   ✗ lệch thật, cần xem");

  const adjustments = plan.reconcile.filter((r) => r.kind === "MANUAL_ADJUSTMENT");
  const realMismatches = plan.reconcile.filter((r) => r.kind === "MISMATCH");

  if (adjustments.length) {
    console.log(`\n  SỐ CỘNG TAY TRONG SHEET: ${adjustments.length} ô (không phải lỗi tính toán)`);
    for (const r of adjustments.slice(0, 8)) {
      console.log(
        `   ≈ ${(NAME_BY_CODE.get(r.itemCode) ?? r.itemCode).padEnd(28)} ${r.periodKey} ${r.field.padEnd(9)} tính ${num(r.computed)} · sheet ${num(r.sheetValue)} · lệch ${num(r.delta)}`
      );
    }
    if (adjustments.length > 8) console.log(`   … và ${adjustments.length - 8} ô nữa`);
  }

  if (realMismatches.length) {
    console.log(`\n  LỆCH THẬT: ${realMismatches.length} ô`);
    for (const r of realMismatches.slice(0, 10)) {
      console.log(
        `   ✗ ${(NAME_BY_CODE.get(r.itemCode) ?? r.itemCode).padEnd(28)} ${r.periodKey} ${r.field.padEnd(9)} tính ${num(r.computed)} · sheet ${num(r.sheetValue)} · lệch ${num(r.delta)}`
      );
    }
    if (realMismatches.length > 10) console.log(`   … và ${realMismatches.length - 10} ô nữa`);
  } else {
    console.log("\n  LỆCH THẬT: không có ô nào.");
  }

  return mismatches;
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");
  const file = args.find((a) => !a.startsWith("--")) ?? DEFAULT_FILE;

  const buffer = readFileSync(file);
  const plan = buildImportPlan(buffer, file.split(/[\\/]/).pop() ?? file);

  printPlan(plan);
  const mismatches = printReconciliation(plan);

  const errorCount = plan.issues.filter((i) => i.severity === "error").length;

  console.log("\n" + "═".repeat(96));
  if (!commit) {
    console.log("  THỬ KHÔ — chưa ghi gì vào cơ sở dữ liệu.");
    console.log(`  Thêm --commit để ghi thật.${errorCount ? "  (còn lỗi, sẽ bị chặn)" : ""}`);
    console.log("═".repeat(96));
    return;
  }

  if (errorCount > 0) {
    console.log(`  ✗ CHẶN GHI: còn ${errorCount} lỗi phải xử lý trước.`);
    console.log("═".repeat(96));
    process.exitCode = 1;
    return;
  }

  console.log("  ĐANG GHI…");
  const result = await commitImportPlan(prisma, plan, "script:import-chemical-inventory");
  console.log(`\n  Kỳ            : ${result.periodsUpserted}`);
  console.log(`  Bản đọc tồn   : ${result.readingsUpserted}`);
  console.log(`  Phiếu nhập    : ${result.receiptsCreated} tạo mới · ${result.receiptsUpdated} cập nhật · ${result.receiptsLinked} gắn vào phiếu đã có`);
  console.log(`  Hợp đồng      : ${result.contractsUpserted}`);
  console.log(`  Mã vật tư ERP : ${result.itemsUpdated} mặt hàng`);
  console.log(`  Lô import     : ${result.batchId}`);
  console.log(`\n  Đối soát: ${mismatches === 0 ? "khớp toàn bộ 6 hóa chất" : `${mismatches} hóa chất còn lệch`}`);
  console.log(`  Kỳ mồi ${SEED_PERIOD_KEY} không hiển thị trên giao diện.`);
  console.log("═".repeat(96));
}

main()
  .catch((e) => {
    console.error("❌ Lỗi:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
