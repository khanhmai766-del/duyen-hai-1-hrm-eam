import { PrismaClient } from "@prisma/client";

/**
 * Tạo PHIẾU HÓA CHẤT MẪU để xem hai màn hình của pha 5 trên máy cục bộ.
 *
 *   npx tsx scripts/demo-chemical-tickets.ts              # tạo
 *   npx tsx scripts/demo-chemical-tickets.ts --xoa        # gỡ sạch
 *   npx tsx scripts/demo-chemical-tickets.ts "Cương vị"   # giao cho cương vị khác
 *
 * DB dev không có phiếu nào thuộc luồng hóa chất và cũng không có vật tư loại
 * "Hóa chất", nên script tạo cả hai. Mọi thứ đều mang dấu [DEMO] để gỡ lại được.
 *
 * CHỈ dùng cho DB dev. Không chạy trên production.
 */

const prisma = new PrismaClient();

const DEMO_TAG = "[DEMO PHA5]";
const DEFAULT_POSITION = "Trưởng kíp Lò - Máy";
const MONTH = "2026-08";

/** Hai mặt hàng mẫu, mã ERP lấy đúng từ tab Hợp đồng của workbook nguồn. */
const DEMO_MATERIALS = [
  { code: "DEMO-HC-NAOH", name: "[DEMO] Dung dịch NaOH 32%", unit: "Kg", erp: "1.61.16.008.VIE.00.000" },
  { code: "DEMO-HC-NH3", name: "[DEMO] Dung dịch NH3 99%", unit: "Kg", erp: null },
];

async function wipe() {
  const tickets = await prisma.materialTicket.findMany({
    where: { proposalNote: { startsWith: DEMO_TAG } },
    select: { id: true, chemicalReceiptIds: true, sequenceNumber: true },
  });

  for (const ticket of tickets) {
    // Gỡ chuyến xe khỏi sổ hóa chất trước, đúng như khi xóa phiếu thật.
    if (ticket.chemicalReceiptIds.length > 0) {
      const rows = await prisma.chemicalReceipt.findMany({ where: { id: { in: ticket.chemicalReceiptIds } } });
      for (const row of rows) {
        if (row.source === "MATERIAL_TICKET") await prisma.chemicalReceipt.delete({ where: { id: row.id } });
        else await prisma.chemicalReceipt.update({ where: { id: row.id }, data: { materialTicketId: null } });
      }
    }
    await prisma.materialTicketItem.deleteMany({ where: { ticketId: ticket.id } });
    await prisma.materialTicket.delete({ where: { id: ticket.id } });
  }

  const { count: materials } = await prisma.material.deleteMany({
    where: { code: { in: DEMO_MATERIALS.map((m) => m.code) } },
  });

  console.log(`🧹 Đã gỡ ${tickets.length} phiếu mẫu và ${materials} vật tư mẫu.`);
}

async function main() {
  if (process.argv.includes("--xoa")) {
    await wipe();
    return;
  }

  const position = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? DEFAULT_POSITION;
  await wipe();

  console.log("═".repeat(84));
  console.log("  TẠO PHIẾU HÓA CHẤT MẪU");
  console.log("═".repeat(84));
  console.log(`  Giao cho cương vị: ${position}`);

  // --- Vật tư mẫu loại "Hóa chất" -----------------------------------------
  const materials = [];
  for (const m of DEMO_MATERIALS) {
    materials.push(
      await prisma.material.create({
        data: {
          code: m.code,
          name: m.name,
          unit: m.unit,
          category: "Hóa chất",
          quantity: 0,
          erpCodes: m.erp ? [m.erp] : [],
        },
      })
    );
  }
  console.log(`  Đã tạo ${materials.length} vật tư mẫu loại "Hóa chất"`);

  const last = await prisma.materialTicket.findFirst({
    where: { sequenceMonth: MONTH, sequenceScope: "CHEMICAL" },
    orderBy: { sequenceNumber: "desc" },
    select: { sequenceNumber: true },
  });
  let seq = (last?.sequenceNumber ?? 0) + 1;

  // --- Phiếu 1: luồng hóa chất, đang chờ VHV xác nhận lãnh ------------------
  const naoh = materials[0];
  const chemical = await prisma.materialTicket.create({
    data: {
      sequenceMonth: MONTH,
      sequenceNumber: seq++,
      sequenceScope: "CHEMICAL",
      type: "HOA_CHAT",
      unit: "COMMON",
      status: "NHAN_VAT_TU",
      assignedPosition: position,
      materialCategory: "Hóa chất",
      proposalNote: `${DEMO_TAG} Phiếu hóa chất — đang ở bước VHV xác nhận lãnh`,
      deliveryScheduledAt: new Date("2026-08-18"),
      deliveryQuantity: 20000,
      createdById: "script:demo-chemical-tickets",
      createdByName: "Dữ liệu mẫu",
      items: { create: [{ materialId: naoh.id, erpCode: naoh.erpCodes[0] ?? null, erpName: naoh.name, quantity: 20000 }] },
    },
  });

  // --- Phiếu 2: NH3 khai một bước, đã hoàn tất -----------------------------
  const nh3 = materials[1];
  const nh3Ticket = await prisma.materialTicket.create({
    data: {
      sequenceMonth: MONTH,
      sequenceNumber: seq++,
      sequenceScope: "CHEMICAL",
      type: "GHI_NHAN",
      unit: "COMMON",
      // Từ 2026-08-21 phiếu NH3 KHÔNG hoàn tất ngay lúc lập — chờ VHV ghi chuyến xe.
      status: "NHAN_VAT_TU",
      assignedPosition: position,
      materialCategory: "Hóa chất",
      proposalNote: `${DEMO_TAG} Phiếu NH3 — lập đề xuất xong, chờ VHV ghi chuyến xe để hoàn tất`,
      createdById: "script:demo-chemical-tickets",
      createdByName: "Dữ liệu mẫu",
      items: { create: [{ materialId: nh3.id, erpName: nh3.name, quantity: 60000 }] },
    },
  });

  console.log(`\n  ✓ Phiếu #${chemical.sequenceNumber} — luồng hóa chất (NaOH 32%)`);
  console.log(`      trạng thái: Chờ VHV xác nhận lãnh · lịch giao 18/08/2026 · đề xuất 20.000 Kg`);
  console.log(`      → mở phiếu để thấy BẢNG NHIỀU DÒNG XE ở bước xác nhận lãnh`);
  console.log(`\n  ✓ Phiếu #${nh3Ticket.sequenceNumber} — NH3 lỏng`);
  console.log(`      trạng thái: Chờ VHV ghi chuyến xe · đề xuất 60.000 Kg (chỉ là số tham khảo)`);
  console.log(`      → ghi khối lượng nhập + biển số + ngày nhập để HOÀN TẤT phiếu`);

  console.log(`\n  Xem tại:  http://localhost:3031/materials  → tab "Hóa chất" → tháng 08/2026`);
  console.log(`  Gỡ sạch:  npx tsx scripts/demo-chemical-tickets.ts --xoa`);
  console.log("═".repeat(84));
}

main()
  .catch((e) => {
    console.error("❌ Lỗi:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
