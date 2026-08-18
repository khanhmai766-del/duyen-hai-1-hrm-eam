/**
 * DỰNG DỮ LIỆU NỀN ĐỂ CHẠY THỬ ĐỦ CÁC LUỒNG PHIẾU THAY THẾ VẬT TƯ — TỪ KHÂU TẠO ĐỀ XUẤT.
 *
 * Script KHÔNG tạo sẵn phiếu. Nó chỉ dựng phần dữ liệu nền mà form "Tạo đề xuất" đòi hỏi,
 * để người kiểm thử tự lập phiếu rồi đi hết các bước. Một phiếu chỉ lập được khi HỘI ĐỦ:
 *
 *   1. `PositionSystemScope` có dòng cho cương vị được giao — nếu bảng này có dữ liệu mà
 *      cương vị đang chọn không có dòng nào thì POST /api/material-tickets từ chối thẳng.
 *   2. `ErpMaterial` có mã tương ứng, `isActive` và `mappingStatus = CONFIRMED` — options
 *      lọc bỏ mọi vật tư không có mã ERP đã duyệt, nên vật tư sẽ không hiện trong dropdown.
 *   3. `MaterialReplacement` có điểm thay thế mà `managingPosition` khớp cương vị được giao.
 *   4. `MaterialStockLot` có lô — bước "Sử dụng vật tư" trừ kho theo lô, tồn chỉ nằm ở
 *      `Material.quantity` mà không có lô nào là chết với "Số lượng hiện có không đủ".
 *
 * MỖI LUỒNG MỘT VẬT TƯ RIÊNG, cố ý: các luồng đều trừ chung một kho, dùng chung vật tư thì
 * chạy thử luồng thứ hai sẽ hết hàng vì luồng thứ nhất.
 *
 * CHẠY LẠI AN TOÀN: mọi thứ đều upsert theo khoá tự nhiên, và lô chỉ dựng lại khi vật tư
 * demo chưa có lô nào (không nạp thêm hàng vào kho đang có phiếu dở dang).
 *
 *   npx tsx scripts/seed-material-ticket-flow-demo.ts
 */
import { prisma } from "../lib/prisma";
import { positionCodeOf } from "../lib/position-catalog";
import { backfillOpeningLots } from "./backfill-opening-stock-lots.mjs";

const DEMO_NOTE = "Dữ liệu mẫu chạy thử các luồng phiếu thay thế vật tư";

type Track = {
  /** Luồng sẽ chạy thử với vật tư này — chỉ để in ra hướng dẫn. */
  flow: string;
  code: string;
  name: string;
  /** `Material.category` (danh mục), KHÔNG phải nhãn loại vật tư trên phiếu. */
  category: string;
  /** Nhãn loại vật tư phải chọn trong form (TICKET_MATERIAL_CATEGORIES). */
  ticketCategory: string;
  unit: string;
  machine: "S1" | "S2" | "COMMON";
  /** Nhãn cương vị trong POSITION_CATALOG — vừa là cương vị được giao, vừa là chủ điểm thay thế. */
  position: string;
  /** Nhánh cây thiết bị phân giao cho cương vị đó; điểm thay thế lấy một thiết bị lá dưới đây. */
  systemSeq: string;
  /** Hai lô để bước Nghiệm thu có nhiều hơn một phiếu giao hàng mà chọn. */
  lots: Array<{ deliveryNote: string; quantity: number; daysAgo: number }>;
};

const TRACKS: Track[] = [
  {
    flow: "Đề xuất (7 bước: xác nhận → Thống kê ĐXVT → lãnh → sử dụng → nghiệm thu → BBNT D-Office → quyết toán)",
    code: "DEMO-FLOW-DX-001",
    name: "[LUỒNG] Dầu bôi trơn quạt khói — thử luồng Đề xuất",
    category: "Dầu bôi trơn",
    ticketCategory: "Dầu bôi trơn",
    unit: "Lít",
    machine: "S1",
    position: "Lò trưởng",
    systemSeq: "DH1.S1.1",
    lots: [
      { deliveryNote: "PGH-2026-001", quantity: 20, daysAgo: 60 },
      { deliveryNote: "PGH-2026-014", quantity: 30, daysAgo: 10 },
    ],
  },
  {
    flow: "Ứng (VHV lãnh trước → sử dụng → nghiệm thu → xác nhận ĐXVT → quyết toán)",
    code: "DEMO-FLOW-UNG-001",
    name: "[LUỒNG] Dầu bôi trơn bơm cấp — thử luồng Ứng",
    category: "Dầu bôi trơn",
    ticketCategory: "Dầu bôi trơn",
    unit: "Lít",
    machine: "S1",
    position: "Máy trưởng",
    systemSeq: "DH1.S1.2",
    lots: [
      { deliveryNote: "PGH-2026-002", quantity: 15, daysAgo: 45 },
      { deliveryNote: "PGH-2026-015", quantity: 25, daysAgo: 7 },
    ],
  },
  {
    flow: "Sử dụng hiện có (lãnh từ tồn → sử dụng → nghiệm thu → Thống kê xác nhận mã → quyết toán)",
    code: "DEMO-FLOW-HIENCO-001",
    name: "[LUỒNG] Dầu cách điện máy cắt — thử luồng Sử dụng hiện có",
    category: "Dầu bôi trơn",
    ticketCategory: "Dầu bôi trơn",
    unit: "Lít",
    machine: "S1",
    position: "Trưởng kíp điện",
    systemSeq: "DH1.S1.3",
    lots: [
      { deliveryNote: "PGH-2026-003", quantity: 12, daysAgo: 90 },
      { deliveryNote: "PGH-2026-016", quantity: 18, daysAgo: 5 },
    ],
  },
  {
    flow: "Hóa chất (3 bước: xác nhận bồn → chốt lịch giao → VHV xác nhận khối lượng lãnh)",
    code: "DEMO-FLOW-HOACHAT-001",
    name: "[LUỒNG] NaOH 32% — thử luồng hóa chất 3 bước",
    category: "Hóa Chất",
    ticketCategory: "Hóa chất",
    unit: "Kg",
    machine: "S1",
    position: "Lò trưởng",
    systemSeq: "DH1.S1.1",
    lots: [{ deliveryNote: "PGH-HC-2026-001", quantity: 500, daysAgo: 20 }],
  },
  {
    flow: "Bi nghiền (giống luồng Đề xuất nhưng BBNT ký tay dùng mẫu riêng bbnt-do-template-bi.docx)",
    code: "DEMO-FLOW-BI-001",
    name: "[LUỒNG] Bi nghiền than Ø40 — thử BBNT mẫu bi",
    category: "Bi Nghiền Than",
    ticketCategory: "Bi nghiền",
    unit: "Kg",
    machine: "S1",
    position: "Máy nghiền",
    systemSeq: "DH1.S1.1",
    lots: [
      { deliveryNote: "PGH-BI-2026-001", quantity: 2000, daysAgo: 30 },
      { deliveryNote: "PGH-BI-2026-002", quantity: 3000, daysAgo: 3 },
    ],
  },
  {
    /* Mã cố định trong SINGLE_STEP_TICKET_MATERIAL_CODES — đổi mã là mất luồng một bước. */
    flow: "Ghi nhận một bước (lập phiếu xong là HOÀN TẤT, không có bước nào tiếp)",
    code: "1.61.16.003.VIE.00.000",
    name: "Hóa chât NH3 lỏng",
    category: "Hóa Chất",
    ticketCategory: "Hóa chất",
    unit: "Kg",
    machine: "S1",
    position: "Lò trưởng",
    systemSeq: "DH1.S1.1",
    lots: [{ deliveryNote: "PGH-NH3-2026-001", quantity: 8000, daysAgo: 15 }],
  },
];

/** Một thiết bị lá dưới nhánh, để gắn điểm thay thế. Lấy sâu dần cho khỏi trùng nhau. */
async function leafUnder(systemSeq: string, skip: number) {
  return prisma.equipmentNode.findFirst({
    where: { seq: { startsWith: `${systemSeq}.` }, childCount: 0 },
    orderBy: [{ depth: "asc" }, { sort: "asc" }],
    select: { seq: true, name: true, parentSeq: true },
    skip,
  });
}

/**
 * Phân giao nhánh thiết bị cho cương vị.
 *
 * Dọn luôn các dòng cũ bị HỎNG MÃ TIẾNG VIỆT (`LÃ² trÆ°á»Ÿng S1`) do lần seed cũ ghi bằng
 * bảng mã sai: kiểm tra quyền lập phiếu so khớp chuỗi CHÍNH XÁC với nhãn cương vị, nên một
 * dòng hỏng mã vừa không dùng được vừa làm `totalScopeCount > 0` — tức là chặn mọi cương vị
 * chưa được phân giao mà chẳng cho ai đi qua.
 */
async function grantScope(position: string, systemSeq: string) {
  const positionCode = positionCodeOf(position);
  if (positionCode) {
    const broken = await prisma.positionSystemScope.findMany({
      where: { systemSeq, positionCode: null },
      select: { id: true, position: true },
    });
    for (const row of broken) {
      if (positionCodeOf(row.position) === positionCode || row.position.includes("Ã")) {
        await prisma.positionSystemScope.delete({ where: { id: row.id } });
      }
    }
  }
  return prisma.positionSystemScope.upsert({
    where: { position_systemSeq: { position, systemSeq } },
    update: { access: "edit", positionCode },
    create: { position, systemSeq, access: "edit", positionCode },
  });
}

async function main() {
  const creator =
    (await prisma.user.findUnique({ where: { email: "admin@powerplant.vn" } })) ??
    (await prisma.user.findFirst({ where: { role: "ADMIN", isActive: true } }));
  if (!creator) throw new Error("Không tìm thấy tài khoản quản trị để đứng tên dữ liệu mẫu");

  const summary: Array<Record<string, string | number>> = [];
  const leafCursor = new Map<string, number>();

  for (const track of TRACKS) {
    // --- cương vị được giao phải có phạm vi thiết bị ---
    await grantScope(track.position, track.systemSeq);

    // --- mã ERP: không có dòng CONFIRMED thì vật tư không hiện trong dropdown ---
    await prisma.erpMaterial.upsert({
      where: { code: track.code },
      update: { name: track.name, unit: track.unit, isActive: true, mappingStatus: "CONFIRMED" },
      create: {
        code: track.code,
        name: track.name,
        unit: track.unit,
        category: track.category,
        erpStock: 100_000,
        isActive: true,
        mappingStatus: "CONFIRMED",
        note: DEMO_NOTE,
      },
    });

    // --- vật tư trong Danh mục ---
    const totalIn = track.lots.reduce((sum, lot) => sum + lot.quantity, 0);
    const material = await prisma.material.upsert({
      where: { code_machine: { code: track.code, machine: track.machine } },
      update: { name: track.name, unit: track.unit, category: track.category, erpCodes: [track.code], note: DEMO_NOTE },
      create: {
        code: track.code,
        erpCodes: [track.code],
        name: track.name,
        unit: track.unit,
        machine: track.machine,
        category: track.category,
        quantity: 0,
        minStock: Math.max(1, Math.round(totalIn * 0.2)),
        note: DEMO_NOTE,
      },
    });

    // --- điểm thay thế thuộc cương vị được giao ---
    const cursor = leafCursor.get(track.systemSeq) ?? 0;
    leafCursor.set(track.systemSeq, cursor + 1);
    const device = await leafUnder(track.systemSeq, cursor);
    if (!device) throw new Error(`Không tìm thấy thiết bị lá dưới nhánh ${track.systemSeq}`);
    const parent = device.parentSeq
      ? await prisma.equipmentNode.findUnique({ where: { seq: device.parentSeq }, select: { name: true } })
      : null;
    const pointData = {
      deviceSeq: device.seq,
      machine: track.machine,
      location: device.name,
      system: parent?.name ?? null,
      managingPosition: track.position,
      managingPositionCode: positionCodeOf(track.position),
      quantity: Math.max(1, Math.round(totalIn / 10)),
      deviceCount: 1,
      intervalMonths: 6,
      nextDueAt: new Date(Date.now() + 180 * 86_400_000),
      note: DEMO_NOTE,
    };
    const existingPoint = await prisma.materialReplacement.findFirst({
      where: { materialId: material.id, note: DEMO_NOTE },
      select: { id: true },
    });
    if (existingPoint) {
      await prisma.materialReplacement.update({ where: { id: existingPoint.id }, data: pointData });
    } else {
      await prisma.materialReplacement.create({
        data: { ...pointData, materialId: material.id, isActive: false, createdById: creator.id },
      });
    }

    // --- lô tồn: chỉ nạp khi vật tư demo chưa có lô nào ---
    const lotCount = await prisma.materialStockLot.count({ where: { materialCode: track.code } });
    if (lotCount === 0) {
      for (const lot of track.lots) {
        await prisma.materialStockLot.create({
          data: {
            materialCode: track.code,
            deliveryNote: lot.deliveryNote,
            erpCode: track.code,
            receivedAt: new Date(Date.now() - lot.daysAgo * 86_400_000),
            quantityIn: lot.quantity,
            quantityLeft: lot.quantity,
            note: DEMO_NOTE,
          },
        });
      }
    }
    // `Material.quantity` vẫn là nguồn đọc của mọi màn hình — kéo về đúng tổng các lô.
    const onHand = await prisma.materialStockLot.aggregate({
      where: { materialCode: track.code },
      _sum: { quantityLeft: true },
    });
    const quantity = Math.max(0, onHand._sum.quantityLeft ?? 0);
    await prisma.material.updateMany({ where: { code: track.code }, data: { quantity } });

    summary.push({
      "Luồng": track.flow,
      "Loại vật tư (chọn trong form)": track.ticketCategory,
      "Tên vật tư": track.name,
      "Tổ máy": track.machine,
      "Cương vị được giao": track.position,
      "Điểm thay thế": `${device.seq} — ${device.name}`,
      "Tồn": `${quantity} ${track.unit}`,
    });
  }

  // --- vật tư cũ chưa có mã ERP: bước Nghiệm thu tra ErpMaterial nên thiếu là hỏng phiếu ---
  const knownCategories = new Set(TRACKS.map((track) => track.category));
  const orphanErp = await prisma.material.findMany({
    where: { category: { in: [...knownCategories] } },
    select: { code: true, name: true, unit: true, category: true },
  });
  const erpCodes = new Set(
    (await prisma.erpMaterial.findMany({ select: { code: true } })).map((row) => row.code)
  );
  // Mã ERP có sẵn nhưng chưa duyệt mapping cũng bị options lọc bỏ y như thiếu hẳn — vật tư
  // biến mất khỏi dropdown mà không có lời giải thích nào trên màn hình. Ở DB kiểm thử thì
  // duyệt luôn; TRÊN PROD ĐỪNG LÀM THẾ — mapping loại dầu là việc người dùng phải xác nhận.
  const unconfirmed = await prisma.erpMaterial.updateMany({
    where: {
      code: { in: orphanErp.map((material) => material.code) },
      OR: [{ mappingStatus: { not: "CONFIRMED" } }, { isActive: false }],
    },
    data: { mappingStatus: "CONFIRMED", isActive: true },
  });

  const addedErp: string[] = [];
  for (const material of orphanErp) {
    if (erpCodes.has(material.code)) continue;
    erpCodes.add(material.code);
    await prisma.erpMaterial.create({
      data: {
        code: material.code,
        name: material.name,
        unit: material.unit,
        category: material.category,
        erpStock: 100_000,
        isActive: true,
        mappingStatus: "CONFIRMED",
        note: DEMO_NOTE,
      },
    });
    addedErp.push(material.code);
  }

  // --- tồn cũ chưa có lô: bước Sử dụng vật tư trừ kho theo lô nên thiếu lô là chết bước ---
  const openingLots = await backfillOpeningLots(prisma);

  console.log("\n=== DỮ LIỆU NỀN CHO CÁC LUỒNG PHIẾU VẬT TƯ ===\n");
  console.table(summary);
  console.log(`\nMã ERP bổ sung cho vật tư cũ (${addedErp.length}): ${addedErp.join(", ") || "(không có)"}`);
  console.log(`Mã ERP đã có nhưng chưa duyệt, nay chuyển CONFIRMED: ${unconfirmed.count}`);
  console.log(`Lô "Tồn đầu kỳ" dựng cho tồn cũ chưa có lô (${openingLots.length}): ${openingLots.map((m) => m.code).join(", ") || "(không có)"}`);
  console.log(`\nCương vị đã được phân giao: ${[...new Set(TRACKS.map((t) => `${t.position} → ${t.systemSeq}`))].join(", ")}`);
  console.log("Đăng nhập admin@powerplant.vn / password123 để đi qua mọi bước không vướng phân quyền.\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
