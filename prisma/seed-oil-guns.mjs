// ============================================================
// prisma/seed-oil-guns.mjs — Seed 36 vòi dầu cho mỗi tổ máy (S1, S2)
// Chạy (đứng ở thư mục dự án, Prisma tự đọc DATABASE_URL từ .env):
//     node prisma/seed-oil-guns.mjs
// An toàn chạy lại nhiều lần (upsert, không tạo trùng, không đè khiếm khuyết đã nhập).
// ============================================================
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Bố trí theo bảng vận hành: mỗi cụm 3 vòi (1 cột trên sơ đồ)
const REAR_GROUPS = [
  ["D1", "E1", "F1"], ["D2", "E2", "F2"], ["D3", "E3", "F3"],
  ["A3", "B3", "C3"], ["A2", "B2", "C2"], ["A1", "B1", "C1"],
];
const FRONT_GROUPS = [
  ["C4", "B4", "A4"], ["C5", "B5", "A5"], ["C6", "B6", "A6"],
  ["F6", "E6", "D6"], ["F5", "E5", "D5"], ["F4", "E4", "D4"],
];

const MACHINES = ["S1", "S2"];

function buildLayout() {
  const rows = [];
  let pos = 0;
  for (const group of REAR_GROUPS) for (const code of group) rows.push({ code, wall: "REAR", position: pos++ });
  for (const group of FRONT_GROUPS) for (const code of group) rows.push({ code, wall: "FRONT", position: pos++ });
  return rows;
}

async function main() {
  const layout = buildLayout();
  let created = 0, kept = 0;

  for (const machine of MACHINES) {
    for (const g of layout) {
      const existing = await prisma.oilGun.findUnique({
        where: { machine_code: { machine, code: g.code } },
      });
      if (existing) {
        // Chỉ đồng bộ lại wall/position, KHÔNG đụng status/defect đã nhập
        await prisma.oilGun.update({
          where: { machine_code: { machine, code: g.code } },
          data: { wall: g.wall, position: g.position },
        });
        kept++;
      } else {
        await prisma.oilGun.create({
          data: { machine, code: g.code, wall: g.wall, position: g.position, status: "available" },
        });
        created++;
      }
    }
    console.log(`  ${machine}: ${layout.length} vòi`);
  }

  console.log(`\n✅ Seed xong: tạo mới ${created}, giữ nguyên ${kept} (tổng ${MACHINES.length * layout.length} vòi).`);
}

main()
  .catch((e) => { console.error("❌", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
