import { PrismaClient } from "@prisma/client";
import {
  getAnnualSummary,
  getDailyLog,
  getMonthlyGrid,
  listContracts,
  listReceipts,
} from "../lib/chemical-inventory/queries";
import { createReceipt, deleteReceipt, updateReceipt } from "../lib/chemical-inventory/receipts";
import { saveDailyReading, saveMonthEndReadings } from "../lib/chemical-inventory/readings";
import { validateReceiptInput } from "../lib/chemical-inventory/validation";

/**
 * Round-trip pha 3 — chạy thẳng vào lớp dịch vụ mà các route gọi.
 *
 *   npx tsx scripts/check-chemical-api.ts
 *
 * Không đi qua HTTP để khỏi phải dựng phiên đăng nhập; phần RBAC của route được
 * kiểm riêng bằng lệnh curl (xem báo cáo pha 3). Ở đây kiểm thứ dễ hỏng hơn nhiều:
 * số liệu và các quy tắc chống trùng, khóa sổ, phân biệt null với 0.
 *
 * Script TỰ DỌN sau khi chạy: mọi bản ghi tạo ra đều bị xóa ở cuối.
 */

const prisma = new PrismaClient();
const USER = "script:check-chemical-api";

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? (passed += 1) : (failed += 1);
  console.log(
    `  ${ok ? "✓" : "✗"} ${label.padEnd(62)} ${ok ? JSON.stringify(actual) : `nhận ${JSON.stringify(actual)}, mong ${JSON.stringify(expected)}`}`
  );
}

async function expectFail(label: string, fn: () => Promise<unknown>, mustContain: string) {
  try {
    await fn();
    failed += 1;
    console.log(`  ✗ ${label.padEnd(62)} không bị chặn`);
  } catch (e) {
    // Các helper ném NextResponse; đọc thân để lấy thông báo tiếng Việt.
    let message = String(e);
    if (e instanceof Response) message = ((await e.json()) as { error?: string }).error ?? "";
    const ok = message.includes(mustContain);
    ok ? (passed += 1) : (failed += 1);
    console.log(`  ${ok ? "✓" : "✗"} ${label.padEnd(62)} "${message}"`);
  }
}

async function main() {
  console.log("═".repeat(96));
  console.log("  ROUND-TRIP PHA 3 — LỚP DỊCH VỤ TỒN KHO HÓA CHẤT");
  console.log("═".repeat(96));

  const nh3 = await prisma.chemicalInventoryItem.findUniqueOrThrow({ where: { code: "NH3_99" } });
  const hcl = await prisma.chemicalInventoryItem.findUniqueOrThrow({ where: { code: "HCL_31" } });

  // -------------------------------------------------------------------------
  console.log("\n▌1. LƯỚI TỒN KHO THÁNG 07/2026\n");
  const grid = await getMonthlyGrid(prisma, "2026-07");
  const nh3Row = grid.rows.find((r) => r.code === "NH3_99")!;
  check("số mặt hàng", grid.rows.length, 16);
  check("số cột cương vị", grid.positions.length, 7);
  check("NH3 tồn đầu", nh3Row.openingTotal, 105646);
  check("NH3 nhập trong kỳ", nh3Row.receivedTotal, 354180);
  check("NH3 tồn cuối", nh3Row.closingTotal, 165158);
  check("NH3 lượng sử dụng", nh3Row.consumedTotal, 294668);
  check("NH3 là ô CHỈ ĐỌC (suy từ nhật ký)", nh3Row.editable, false);
  check("HCl sửa được", grid.rows.find((r) => r.code === "HCL_31")!.editable, true);
  check("KPI tách theo đơn vị, không gộp", Object.keys(grid.totalsByUnit).sort(), ["KG", "LITER", "TON"]);
  check("suất hao đầu cực (kg/MWh)", Number((grid.specificConsumption ?? 0).toFixed(3)), 0.712);

  const doLhp = grid.rows.find((r) => r.code === "DO_LO_HOI_PHU")!;
  check("mức bồn ghi bằng chữ → không thành số", doLhp.closingTotal, null);
  check("  …nguyên văn vẫn còn", Boolean(Object.values(doLhp.cells).some((c) => c.rawText)), true);

  // -------------------------------------------------------------------------
  console.log("\n▌2. NHẬT KÝ NGÀY NH3\n");
  const log = await getDailyLog(prisma, "2026-07", nh3.id);
  check("số ngày trong tháng", log!.rows.length, 31);
  check("tồn đầu tháng", log!.monthOpening, 105646);
  check("tổng nhập", log!.monthReceived, 354180);
  check("tồn cuối tháng", log!.monthClosing, 165158);
  check("lượng sử dụng", log!.monthConsumed, 294668);
  const day1 = log!.rows[0];
  check("ngày 01: tồn 00h suy từ kỳ trước", day1.openingStock, 105646);
  check("ngày 01: nhập trong ngày", day1.importedToday, 41820);
  check("ngày 01: số chuyến xe", day1.trucks.length, 2);
  check("ngày 02: không có xe → null chứ không phải 0", log!.rows[1].importedToday, null);

  // -------------------------------------------------------------------------
  console.log("\n▌3. TỔNG HỢP NĂM 2026\n");
  const annual = await getAnnualSummary(prisma, 2026);
  const nh3Annual = annual.rows.find((r) => r.code === "NH3_99")!;
  check("số tháng", annual.months.length, 12);
  check("NH3 tổng sử dụng 2026", nh3Annual.consumedTotal, 3172847);
  check("tháng 12 chưa mở kỳ → null, không phải 0", nh3Annual.consumed[11], null);
  check("tháng 08 đã có kỳ (từ phiếu nhập)", annual.openPeriods.includes("2026-08"), true);

  // -------------------------------------------------------------------------
  console.log("\n▌4. PHIẾU NHẬP — TẠO, CHỐNG TRÙNG, SỬA, XÓA\n");
  const payload = validateReceiptInput({
    itemId: hcl.id,
    receivedAt: "2026-08-15",
    vehicleNumber: "51C-999.88",
    plantWeight: 12000,
    contractorWeight: 12050,
    receivingPosition: "MIXED_WATER_TREATMENT",
  });
  if (!payload.ok) throw new Error(payload.error);

  const created = await prisma.$transaction((tx) =>
    createReceipt(tx, payload.value, { source: "MANUAL", userId: USER })
  );
  check("tạo phiếu mới", created.status, "created");

  const stored = await prisma.chemicalReceipt.findUniqueOrThrow({ where: { id: created.id } });
  check("biển số chuẩn hóa còn 8 ký tự", stored.vehicleNumber, "51C99988");
  check("khối lượng công nhận = số cân nhỏ hơn", Number(stored.acceptedWeight), 12000);
  check("kỳ do server suy từ ngày", stored.periodKey, "2026-08");

  // Cùng ngày, cùng khối lượng, biển số ghi tắt → phải GẮN vào phiếu cũ.
  const second = validateReceiptInput({
    itemId: hcl.id,
    receivedAt: "2026-08-15",
    vehicleNumber: "988",
    plantWeight: 12000,
    contractorWeight: 12050,
  });
  if (!second.ok) throw new Error(second.error);
  const linked = await prisma.$transaction((tx) =>
    createReceipt(tx, second.value, { source: "DAILY_LOG", userId: USER })
  );
  check("ghi lại cùng chuyến → gắn vào phiếu cũ", linked.status, "linked");
  check("  …đúng phiếu cũ, không tạo dòng thứ hai", linked.id, created.id);
  check(
    "tổng phiếu ngày 15/08 vẫn là 1",
    await prisma.chemicalReceipt.count({ where: { itemId: hcl.id, receivedAt: new Date("2026-08-15") } }),
    1
  );

  const updatePayload = validateReceiptInput({
    itemId: hcl.id,
    receivedAt: "2026-08-16",
    vehicleNumber: "51C-999.88",
    plantWeight: 11500,
    contractorWeight: 11480,
    receivingPosition: "MIXED_WATER_TREATMENT",
  });
  if (!updatePayload.ok) throw new Error(updatePayload.error);
  const updated = await prisma.$transaction((tx) => updateReceipt(tx, created.id, updatePayload.value, USER));
  check("sửa phiếu: lấy lại số cân nhỏ hơn", Number(updated.acceptedWeight), 11480);

  // -------------------------------------------------------------------------
  console.log("\n▌5. QUY TẮC CHẶN\n");
  await expectFail(
    "chỉ một số cân mà không ghi chú",
    async () => {
      const r = validateReceiptInput({ itemId: hcl.id, receivedAt: "2026-08-20", plantWeight: 1000 });
      if (!r.ok) throw new Response(JSON.stringify({ error: r.error }));
      return r;
    },
    "phải ghi chú"
  );

  await expectFail(
    "biển số quá 8 ký tự",
    async () => {
      const r = validateReceiptInput({
        itemId: hcl.id,
        receivedAt: "2026-08-20",
        vehicleNumber: "51C-999.88.77",
        plantWeight: 1000,
        contractorWeight: 1000,
      });
      if (!r.ok) throw new Response(JSON.stringify({ error: r.error }));
      return r;
    },
    "tối đa 8 ký tự"
  );

  await expectFail(
    "ghi vào kỳ chưa mở",
    () =>
      prisma.$transaction(async (tx) =>
        saveMonthEndReadings(
          tx,
          "2027-05",
          [{ itemId: hcl.id, positionCode: "MIXED_WATER_TREATMENT", quantity: 1, note: null }],
          USER
        )
      ),
    "chưa được mở"
  );

  await expectFail(
    "gõ tay tồn cuối của mặt hàng theo dõi ngày",
    () =>
      prisma.$transaction(async (tx) =>
        saveMonthEndReadings(tx, "2026-08", [{ itemId: nh3.id, positionCode: "AUX_BOILER_NH3", quantity: 1, note: null }], USER)
      ),
    "không nhập tay được"
  );

  // Khóa kỳ rồi thử ghi.
  await prisma.chemicalInventoryPeriod.update({ where: { periodKey: "2026-08" }, data: { status: "LOCKED" } });
  await expectFail(
    "ghi vào kỳ đã khóa sổ",
    () =>
      prisma.$transaction(async (tx) =>
        saveMonthEndReadings(tx, "2026-08", [{ itemId: hcl.id, positionCode: "MIXED_WATER_TREATMENT", quantity: 1, note: null }], USER)
      ),
    "đã khóa sổ"
  );
  await prisma.chemicalInventoryPeriod.update({ where: { periodKey: "2026-08" }, data: { status: "DRAFT" } });

  // -------------------------------------------------------------------------
  console.log("\n▌6. TỒN CUỐI THÁNG CỦA NH3 TỰ SINH TỪ NHẬT KÝ\n");
  const before = await getMonthlyGrid(prisma, "2026-07");
  check("trước khi sửa: tồn cuối NH3", before.rows.find((r) => r.code === "NH3_99")!.closingTotal, 165158);

  await prisma.$transaction((tx) =>
    saveDailyReading(
      tx,
      {
        itemId: nh3.id,
        periodKey: "2026-07",
        readDate: new Date(Date.UTC(2026, 6, 31)),
        positionCode: "AUX_BOILER_NH3",
        quantity: 170000,
        note: null,
      },
      USER
    )
  );
  const after = await getMonthlyGrid(prisma, "2026-07");
  check("sửa tồn 24h ngày 31 → ô tháng đổi theo", after.rows.find((r) => r.code === "NH3_99")!.closingTotal, 170000);
  check("  …và lượng sử dụng tính lại", after.rows.find((r) => r.code === "NH3_99")!.consumedTotal, 289826);

  // Trả về số cũ.
  await prisma.$transaction((tx) =>
    saveDailyReading(
      tx,
      {
        itemId: nh3.id,
        periodKey: "2026-07",
        readDate: new Date(Date.UTC(2026, 6, 31)),
        positionCode: "AUX_BOILER_NH3",
        quantity: 165158,
        note: null,
      },
      USER
    )
  );
  const restored = await getMonthlyGrid(prisma, "2026-07");
  check("khôi phục về số gốc", restored.rows.find((r) => r.code === "NH3_99")!.closingTotal, 165158);

  // -------------------------------------------------------------------------
  console.log("\n▌7. HỢP ĐỒNG & DANH SÁCH PHIẾU\n");
  const contracts = await listContracts(prisma, 2025);
  check("số hợp đồng 2025", contracts.length, 5);
  const hclContract = contracts.find((c) => c.itemCode === "HCL_31")!;
  check("khối lượng hợp đồng HCl", hclContract.contractQuantity, 458723);
  check("đã nhận = cộng lại từ phiếu, không lấy cột sheet", hclContract.received, 0);
  check("còn lại = hợp đồng − đã nhận", hclContract.remaining, 458723);
  check("thiếu hụt không bao giờ âm", hclContract.shortfall >= 0, true);

  const page = await listReceipts(prisma, { periodKey: "2026-07", pageSize: 10 });
  check("phân trang trả đúng kích thước trang", page.rows.length, 10);
  check(
    "tổng phiếu tháng 07/2026 khớp số đếm thật",
    page.total,
    await prisma.chemicalReceipt.count({ where: { periodKey: "2026-07" } })
  );
  const search = await listReceipts(prisma, { periodKey: "2026-07", q: "51c214" });
  check("tìm kiếm không dấu theo biển số", search.rows.length > 0, true);

  // -------------------------------------------------------------------------
  console.log("\n▌8. DỌN DẸP\n");
  await prisma.$transaction((tx) => deleteReceipt(tx, created.id));
  const leftovers = await prisma.chemicalReceipt.count({ where: { createdById: USER } });
  check("đã xóa hết bản ghi do script tạo", leftovers, 0);

  console.log("\n" + "═".repeat(96));
  console.log(`  KẾT QUẢ: ${passed} đạt · ${failed} sai`);
  console.log("═".repeat(96));
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch(async (e) => {
    if (e instanceof Response) console.error("❌", await e.json());
    else console.error("❌", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
