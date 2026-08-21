import { PrismaClient } from "@prisma/client";
import { linkTicketTrucks, unlinkTicketTrucks } from "../lib/chemical-inventory/ticket-link";
import { getMonthlyGrid, listReceipts } from "../lib/chemical-inventory/queries";

/**
 * Round-trip pha 5 — nối phiếu vật tư với sổ tồn kho hóa chất.
 *
 *   npx tsx scripts/check-chemical-ticket-link.ts
 *
 * DB dev không có phiếu nào thuộc luồng hóa chất nên script TỰ TẠO một phiếu mẫu,
 * chạy hết các nhánh rồi XÓA SẠCH — kể cả khi giữa chừng có lỗi.
 */

const prisma = new PrismaClient();
const USER = "script:check-chemical-ticket-link";
const MARK = "KIEMTHU-PHA5";

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? (passed += 1) : (failed += 1);
  console.log(
    `  ${ok ? "✓" : "✗"} ${label.padEnd(58)} ${ok ? JSON.stringify(actual) : `nhận ${JSON.stringify(actual)}, mong ${JSON.stringify(expected)}`}`
  );
}

async function expectFail(label: string, fn: () => Promise<unknown>, mustContain: string) {
  try {
    await fn();
    failed += 1;
    console.log(`  ✗ ${label.padEnd(58)} không bị chặn`);
  } catch (e) {
    let message = String(e);
    if (e instanceof Response) message = ((await e.json()) as { error?: string }).error ?? "";
    const ok = message.includes(mustContain);
    ok ? (passed += 1) : (failed += 1);
    console.log(`  ${ok ? "✓" : "✗"} ${label.padEnd(58)} "${message.slice(0, 80)}"`);
  }
}

async function cleanup() {
  const tickets = await prisma.materialTicket.findMany({ where: { proposalNote: MARK }, select: { id: true, chemicalReceiptIds: true } });
  for (const ticket of tickets) {
    await prisma.$transaction((tx) => unlinkTicketTrucks(tx, ticket.id, ticket.chemicalReceiptIds)).catch(() => null);
    await prisma.materialTicketItem.deleteMany({ where: { ticketId: ticket.id } });
    await prisma.materialTicket.delete({ where: { id: ticket.id } }).catch(() => null);
  }
  await prisma.chemicalReceipt.deleteMany({ where: { createdById: USER } });
  return tickets.length;
}

async function main() {
  console.log("═".repeat(90));
  console.log("  ROUND-TRIP PHA 5 — NỐI PHIẾU VẬT TƯ VỚI SỔ HÓA CHẤT");
  console.log("═".repeat(90));

  await cleanup();

  const material = await prisma.material.findFirst({ orderBy: { name: "asc" } });
  if (!material) throw new Error("DB dev không có Material nào để gắn vào phiếu mẫu");

  const naoh = await prisma.chemicalInventoryItem.findUniqueOrThrow({ where: { code: "NAOH_32" } });
  console.log(`\n  Mặt hàng đích: ${naoh.name} · mã ERP ${naoh.materialCode ?? "(chưa có)"}`);

  // ---------------------------------------------------------------------
  console.log("\n▌1. TẠO PHIẾU HÓA CHẤT MẪU\n");
  const ticket = await prisma.materialTicket.create({
    data: {
      sequenceMonth: "2026-08",
      sequenceNumber: 9901,
      sequenceScope: "CHEMICAL",
      type: "HOA_CHAT",
      unit: "COMMON",
      status: "NHAN_VAT_TU",
      assignedPosition: "XLN hỗn hợp",
      materialCategory: "Hóa chất",
      proposalNote: MARK,
      createdById: USER,
      createdByName: "Script kiểm thử",
      items: {
        create: [{ materialId: material.id, erpCode: naoh.materialCode, erpName: naoh.name, quantity: 20000 }],
      },
    },
    include: { items: { include: { material: { select: { code: true, name: true } } } } },
  });
  check("phiếu đã tạo, đang ở bước xác nhận lãnh", ticket.status, "NHAN_VAT_TU");
  check("chưa gắn chuyến xe nào", ticket.chemicalReceiptIds.length, 0);

  const ticketArg = {
    id: ticket.id,
    assignedPosition: ticket.assignedPosition,
    chemicalReceiptIds: ticket.chemicalReceiptIds,
    items: ticket.items.map((i) => ({ erpCode: i.erpCode, erpName: i.erpName, material: i.material })),
  };

  // ---------------------------------------------------------------------
  console.log("\n▌2. GHI 3 CHUYẾN XE\n");
  const result = await prisma.$transaction((tx) =>
    linkTicketTrucks(
      tx,
      ticketArg,
      [
        { receivedAt: "2026-08-10", vehicleNumber: "51C-111.22", plantWeight: 10000 },
        { receivedAt: "2026-08-10", vehicleNumber: "51C-333.44", plantWeight: 9800 },
        { receivedAt: "2026-08-12", vehicleNumber: "51C-555.66", plantWeight: 10200 },
      ],
      { userId: USER }
    )
  );
  check("số chuyến ghi được", result.receiptIds.length, 3);
  check("tạo mới", result.created, 3);
  check("tổng = Σ khối lượng hàng trên phiếu cân", result.totalAccepted, 30000);

  const stored = await prisma.chemicalReceipt.findMany({
    where: { materialTicketId: ticket.id },
    orderBy: [{ receivedAt: "asc" }, { vehicleNumber: "asc" }],
  });
  check("biển số chuẩn hóa 8 ký tự", stored.map((r) => r.vehicleNumber), ["51C11122", "51C33344", "51C55566"]);
  check("nguồn ghi đúng", [...new Set(stored.map((r) => r.source))], ["MATERIAL_TICKET"]);
  // Phiếu giao cho "XLN hỗn hợp" → lưu MÃ cương vị, không lưu nhãn tự do.
  check("cương vị lấy từ phiếu, dạng MÃ", [...new Set(stored.map((r) => r.receivingPosition))], ["MIXED_WATER_TREATMENT"]);
  check("kỳ do server suy từ ngày", [...new Set(stored.map((r) => r.periodKey))], ["2026-08"]);
  check(
    "phiếu giữ con trỏ sang sổ hóa chất",
    (await prisma.materialTicket.findUniqueOrThrow({ where: { id: ticket.id } })).chemicalReceiptIds.length,
    3
  );

  // ---------------------------------------------------------------------
  console.log("\n▌3. GHI LẠI (SỬA PHIẾU) — KHÔNG ĐƯỢC ĐẺ THÊM DÒNG\n");
  const again = await prisma.$transaction((tx) =>
    linkTicketTrucks(
      tx,
      { ...ticketArg, chemicalReceiptIds: result.receiptIds },
      [
        { receivedAt: "2026-08-10", vehicleNumber: "51C-111.22", plantWeight: 10000 },
        { receivedAt: "2026-08-12", vehicleNumber: "51C-555.66", plantWeight: 10200 },
      ],
      { userId: USER }
    )
  );
  check("ghi lại còn 2 chuyến", again.receiptIds.length, 2);
  check(
    "tổng dòng trong sổ đúng 2, chuyến bỏ đi đã xóa",
    await prisma.chemicalReceipt.count({ where: { materialTicketId: ticket.id } }),
    2
  );

  // ---------------------------------------------------------------------
  console.log("\n▌4. CHỐNG TRÙNG VỚI NHẬT KÝ NGÀY\n");
  // Dựng một chuyến do nhật ký ngày ghi trước, rồi để phiếu ghi lại đúng chuyến đó.
  const fromLog = await prisma.chemicalReceipt.create({
    data: {
      itemId: naoh.id,
      receivedAt: new Date("2026-08-20"),
      periodKey: "2026-08",
      vehicleNumber: "51C77788",
      acceptedWeight: 8888,
      source: "DAILY_LOG",
      createdById: USER,
    },
  });
  const linkOver = await prisma.$transaction((tx) =>
    linkTicketTrucks(
      tx,
      { ...ticketArg, chemicalReceiptIds: again.receiptIds },
      [{ receivedAt: "2026-08-20", vehicleNumber: "777", plantWeight: 8888, contractorWeight: 8900 }],
      { userId: USER }
    )
  );
  check("chuyến đã có ở nhật ký → GẮN, không tạo mới", linkOver.linked, 1);
  check("  …và đúng bản ghi cũ", linkOver.receiptIds[0], fromLog.id);
  check(
    "tổng dòng ngày 20/08 vẫn là 1",
    await prisma.chemicalReceipt.count({ where: { itemId: naoh.id, receivedAt: new Date("2026-08-20") } }),
    1
  );
  const merged = await prisma.chemicalReceipt.findUniqueOrThrow({ where: { id: fromLog.id } });
  check("giữ biển số đầy đủ của nhật ký", merged.vehicleNumber, "51C77788");
  check("nhận thêm khối lượng theo phiếu cân", Number(merged.plantWeight), 8888);

  // ---------------------------------------------------------------------
  console.log("\n▌5. QUY TẮC CHẶN\n");
  await expectFail(
    "không nhập khối lượng hàng",
    () =>
      prisma.$transaction((tx) =>
        linkTicketTrucks(tx, { ...ticketArg, chemicalReceiptIds: [] }, [{ receivedAt: "2026-08-05" }], { userId: USER })
      ),
    "chưa nhập khối lượng hàng"
  );
  await expectFail(
    "khối lượng bằng 0",
    () =>
      prisma.$transaction((tx) =>
        linkTicketTrucks(tx, { ...ticketArg, chemicalReceiptIds: [] }, [{ receivedAt: "2026-08-05", plantWeight: 0 }], { userId: USER })
      ),
    "phải lớn hơn 0"
  );
  await expectFail(
    "hai dòng trùng ngày và biển số",
    () =>
      prisma.$transaction((tx) =>
        linkTicketTrucks(
          tx,
          { ...ticketArg, chemicalReceiptIds: [] },
          [
            { receivedAt: "2026-08-06", vehicleNumber: "51C-999.11", plantWeight: 100 },
            { receivedAt: "2026-08-06", vehicleNumber: "51C-999.11", plantWeight: 200 },
          ],
          { userId: USER }
        )
      ),
    "trùng ngày và biển số"
  );
  await expectFail("không gửi chuyến nào", () => prisma.$transaction((tx) => linkTicketTrucks(tx, ticketArg, [], { userId: USER })), "Chưa nhập chuyến xe nào");

  // Kỳ khóa sổ thì phiếu cũng không ghi được.
  await prisma.chemicalInventoryPeriod.update({ where: { periodKey: "2026-08" }, data: { status: "LOCKED" } });
  await expectFail(
    "ghi vào kỳ đã khóa sổ",
    () =>
      prisma.$transaction((tx) =>
        linkTicketTrucks(
          tx,
          { ...ticketArg, chemicalReceiptIds: [] },
          [{ receivedAt: "2026-08-07", vehicleNumber: "51C-222.33", plantWeight: 500 }],
          { userId: USER }
        )
      ),
    "đã khóa sổ"
  );
  await prisma.chemicalInventoryPeriod.update({ where: { periodKey: "2026-08" }, data: { status: "DRAFT" } });

  // ---------------------------------------------------------------------
  console.log("\n▌6. SỐ LIỆU CHẢY SANG SỔ TỒN KHO\n");
  // Tháng 08/2026 đã có sẵn phiếu NaOH nhập từ sheet, nên so theo MỨC TĂNG chứ không
  // so con số tuyệt đối — dữ liệu nền thay đổi thì bài kiểm tuyệt đối sẽ sai oan.
  const grid = await getMonthlyGrid(prisma, "2026-08");
  const row = grid.rows.find((r) => r.code === "NAOH_32")!;
  check("chuyến của phiếu đã cộng vào lượng nhập tháng", (row.receivedTotal ?? 0) >= 8888, true);
  check("phiếu từ ticket KHÔNG bị gắn cờ thiếu số cân", (await prisma.chemicalReceipt.findMany({ where: { source: "MATERIAL_TICKET" }, select: { warnings: true } })).every((r) => !r.warnings.includes("MISSING_WEIGHT")), true);
  check(
    "  …tổng khớp đúng số đếm được từ sổ",
    row.receivedTotal,
    Math.round(
      (
        await prisma.chemicalReceipt.findMany({ where: { itemId: naoh.id, periodKey: "2026-08" }, select: { acceptedWeight: true } })
      ).reduce((s, r) => s + r.acceptedWeight.toNumber(), 0) * 10_000
    ) / 10_000
  );

  const list = await listReceipts(prisma, { periodKey: "2026-08", itemId: naoh.id });
  const linkedRow = list.rows.find((r) => r.id === fromLog.id)!;
  check("phiếu gắn ticket thì KHÔNG xóa được ở màn tồn kho", linkedRow.deletable, false);

  // ---------------------------------------------------------------------
  console.log("\n▌7. XÓA PHIẾU — GỠ ĐÚNG CÁCH\n");
  // ---------------------------------------------------------------------
  console.log("\n▌6b. PHIẾU NH3: GHI CHUYẾN XE XONG MỚI HOÀN TẤT\n");
  const nh3Item = await prisma.chemicalInventoryItem.findUniqueOrThrow({ where: { code: "NH3_99" } });
  const nh3Ticket = await prisma.materialTicket.create({
    data: {
      sequenceMonth: "2026-08",
      sequenceNumber: 9902,
      sequenceScope: "CHEMICAL",
      type: "GHI_NHAN",
      unit: "COMMON",
      status: "NHAN_VAT_TU",
      assignedPosition: "NH3 - Lò hơi phụ",
      materialCategory: "Hóa chất",
      proposalNote: MARK,
      createdById: USER,
      createdByName: "Script kiểm thử",
      items: { create: [{ materialId: material.id, erpName: nh3Item.name, quantity: 60000 }] },
    },
    include: { items: { include: { material: { select: { code: true, name: true } } } } },
  });
  check("phiếu NH3 lập xong CHƯA hoàn tất", nh3Ticket.status, "NHAN_VAT_TU");

  const nh3Link = await prisma.$transaction((tx) =>
    linkTicketTrucks(
      tx,
      {
        id: nh3Ticket.id,
        assignedPosition: nh3Ticket.assignedPosition,
        chemicalReceiptIds: [],
        items: nh3Ticket.items.map((i) => ({ erpCode: i.erpCode, erpName: i.erpName, material: i.material })),
      },
      // Đúng tờ phiếu cân xe thật: chỉ một số, dòng "Trọng lượng hàng" = 21.080 kg.
      [{ receivedAt: "2026-08-21", vehicleNumber: "51D-49269", plantWeight: 21080 }],
      { userId: USER, chemicalItemId: nh3Item.id }
    )
  );
  check("ghi được chuyến xe", nh3Link.receiptIds.length, 1);
  check("khối lượng lấy đúng dòng phiếu cân", nh3Link.totalAccepted, 21080);
  const nh3Receipt = await prisma.chemicalReceipt.findUniqueOrThrow({ where: { id: nh3Link.receiptIds[0] } });
  check("đúng mặt hàng NH3", nh3Receipt.itemId, nh3Item.id);
  check("biển số chuẩn hóa 8 ký tự", nh3Receipt.vehicleNumber, "51D49269");
  // Phiếu NH3 giao cho "NH3 - Lò hơi phụ" — đúng một trong bảy cương vị của sổ.
  check("cương vị nhận là mã hợp lệ", nh3Receipt.receivingPosition, "AUX_BOILER_NH3");
  check("không gắn cờ thiếu số cân", nh3Receipt.warnings.includes("MISSING_WEIGHT"), false);

  // ---------------------------------------------------------------------
  console.log("\n▌7. XÓA PHIẾU — GỠ ĐÚNG CÁCH\n");
  const beforeDelete = await prisma.materialTicket.findUniqueOrThrow({ where: { id: ticket.id } });
  await prisma.$transaction((tx) => unlinkTicketTrucks(tx, ticket.id, beforeDelete.chemicalReceiptIds));
  const survivor = await prisma.chemicalReceipt.findUnique({ where: { id: fromLog.id } });
  check("chuyến vốn có từ nhật ký ngày KHÔNG bị xóa", Boolean(survivor), true);
  check("  …chỉ bị tháo liên kết", survivor?.materialTicketId, null);
  check(
    "chuyến do phiếu tạo đã bị xóa hết",
    await prisma.chemicalReceipt.count({ where: { materialTicketId: ticket.id } }),
    0
  );

  console.log("\n" + "═".repeat(90));
  console.log(`  KẾT QUẢ: ${passed} đạt · ${failed} sai`);
  console.log("═".repeat(90));
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch(async (e) => {
    if (e instanceof Response) console.error("❌", await e.json());
    else console.error("❌", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    const removed = await cleanup().catch(() => 0);
    console.log(`\n🧹 Đã dọn ${removed} phiếu mẫu và toàn bộ chuyến xe do script tạo.`);
    await prisma.$disconnect();
  });
