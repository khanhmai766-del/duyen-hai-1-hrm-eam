// Nhân bản KHAI BÁO VẬT TƯ & ĐIỂM THAY THẾ từ tổ máy S1 sang S2.
//
// MaterialReplacement machine="S1" → machine="S2", gồm cả dòng khai báo vật tư
// (isActive=false) lẫn điểm thay thế (isActive=true). materialId được ánh xạ sang
// vật tư CÙNG MÃ trong danh mục S2; vật tư S1 chưa có bản S2 thì tạo bản sao vào
// danh mục S2 (giữ nguyên mọi trường).
//
// KHÔNG sao chép: lịch sử thay thế (MaterialReplacementLog), lịch sử sửa chữa,
// khiếm khuyết, thẻ QR — đó là dữ liệu vận hành riêng của từng tổ máy.
//
// KHÔNG tạo EquipmentProfile: cấu trúc cây dùng chung, phạm vi tổ máy của một nút
// suy ra từ số nhánh của seq (machinesOf() trong lib/equipment-units.ts). Bảng
// EquipmentProfile chỉ dùng để LƯU GHI ĐÈ tên/KKS khi một tổ máy đặt khác đi.
//
// Chạy:
//   node scripts/create-s2-from-s1.mjs               # dry-run, chỉ in báo cáo
//   node scripts/create-s2-from-s1.mjs --apply       # ghi vào DB
//   ... --keep-dates    giữ nguyên lastReplacedAt/nextDueAt của S1
//                       (mặc định: xoá lastReplacedAt, nextDueAt = hôm nay + chu kỳ)
//
// Idempotent: chạy lại chỉ bổ sung phần còn thiếu.
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const KEEP_DATES = argv.includes("--keep-dates");

const addMonths = (date, months) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// ---------------------------------------------- khai báo vật tư & điểm thay thế
async function copyReplacements() {
  console.log("\n=== KHAI BÁO VẬT TƯ & ĐIỂM THAY THẾ S1 → S2 ===");

  const [sources, materials] = await Promise.all([
    prisma.materialReplacement.findMany({
      where: { machine: "S1" },
      include: { material: { select: { id: true, code: true, name: true, machine: true, unit: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.material.findMany({ select: { id: true, code: true, name: true, machine: true } }),
  ]);

  const declarations = sources.filter((r) => !r.isActive);
  const points = sources.filter((r) => r.isActive);
  console.log(`Nguồn S1: ${sources.length} dòng — ${declarations.length} khai báo vật tư (isActive=false), ${points.length} điểm thay thế (isActive=true)`);
  if (!sources.length) {
    console.log("  ⚠️  Không có dòng nào machine='S1' — không có gì để nhân bản.");
    return;
  }

  // Ánh xạ vật tư: cùng mã, danh mục S2. Vật tư COMMON dùng chung nên giữ nguyên id.
  const s2ByCode = new Map(materials.filter((m) => m.machine === "S2").map((m) => [m.code, m]));
  console.log(`Danh mục vật tư S2: ${s2ByCode.size} mã`);

  // Vật tư S1 đang được khai báo nhưng danh mục S2 chưa có → nhân bản sang S2
  // (giữ nguyên mọi trường, chỉ đổi machine) để không mất dòng khai báo nào.
  const needMaterialClone = new Map();
  for (const r of sources) {
    if (r.material.machine === "COMMON") continue;
    if (s2ByCode.has(r.material.code)) continue;
    needMaterialClone.set(r.material.code, r.material.id);
  }
  if (needMaterialClone.size) {
    console.log(`\nVật tư S1 chưa có bản S2 (sẽ nhân bản sang danh mục S2): ${needMaterialClone.size}`);
    const originals = await prisma.material.findMany({ where: { id: { in: [...needMaterialClone.values()] } } });
    for (const m of originals) console.log(`   ${m.code} · ${m.name} · ${m.category ?? "-"} · ĐVT ${m.unit}`);
    if (APPLY) {
      for (const m of originals) {
        const { id: _id, createdAt: _createdAt, ...rest } = m;
        const clone = await prisma.material.create({ data: { ...rest, machine: "S2" } });
        s2ByCode.set(clone.code, clone);
      }
      console.log(`   ✅ Đã nhân bản ${originals.length} vật tư sang danh mục S2.`);
    }
  }

  // Khoá nhận diện bản sao đã tồn tại (bảng không có unique constraint).
  const keyOf = (materialId, r) =>
    [materialId, r.deviceSeq ?? "", r.system ?? "", r.location ?? "", r.intervalMonths, r.isActive].join("|");

  const existingS2 = await prisma.materialReplacement.findMany({
    where: { machine: "S2" },
    select: {
      materialId: true, deviceSeq: true, system: true, location: true,
      intervalMonths: true, isActive: true,
    },
  });
  const have = new Set(existingS2.map((r) => keyOf(r.materialId, r)));
  console.log(`Đã có ${existingS2.length} dòng machine='S2' trong DB`);

  const now = new Date();
  const toCreate = [];
  const unmapped = new Map(); // mã vật tư S1 không có bản S2
  let skipped = 0;

  for (const r of sources) {
    let materialId;
    if (r.material.machine === "COMMON") {
      materialId = r.material.id; // vật tư dùng chung — không cần bản sao S2
    } else {
      const twin = s2ByCode.get(r.material.code);
      if (twin) {
        materialId = twin.id;
      } else if (!APPLY && needMaterialClone.has(r.material.code)) {
        // dry-run: bản sao S2 sẽ được tạo ở bước trên khi chạy --apply
        materialId = `<S2:${r.material.code}>`;
      } else {
        const e = unmapped.get(r.material.code) ?? { name: r.material.name, count: 0 };
        e.count++;
        unmapped.set(r.material.code, e);
        continue;
      }
    }

    if (have.has(keyOf(materialId, r))) {
      skipped++;
      continue;
    }
    have.add(keyOf(materialId, r));

    const lastReplacedAt = KEEP_DATES ? r.lastReplacedAt : null;
    const nextDueAt = KEEP_DATES ? r.nextDueAt : addMonths(lastReplacedAt ?? now, r.intervalMonths);

    toCreate.push({
      id: randomUUID(),
      materialId,
      deviceSeq: r.deviceSeq,
      machine: "S2",
      location: r.location,
      system: r.system,
      quantity: r.quantity,
      deviceCount: r.deviceCount,
      managingPosition: r.managingPosition,
      managingPositionCode: r.managingPositionCode,
      intervalMonths: r.intervalMonths,
      intervalNote: r.intervalNote,
      lastReplacedAt,
      nextDueAt,
      note: r.note,
      isActive: r.isActive,
      createdById: r.createdById,
    });
  }

  const newDecl = toCreate.filter((r) => !r.isActive).length;
  const newPoints = toCreate.filter((r) => r.isActive).length;
  console.log(`Sẽ tạo: ${toCreate.length} dòng S2 — ${newDecl} khai báo vật tư, ${newPoints} điểm thay thế`);
  console.log(`Bỏ qua vì đã có bản S2 tương ứng: ${skipped}`);
  console.log(`Ngày tháng: ${KEEP_DATES ? "GIỮ NGUYÊN của S1" : "xoá 'lần thay gần nhất', hạn kế tiếp = hôm nay + chu kỳ"}`);

  if (unmapped.size) {
    console.log(`\n  ⚠️  ${unmapped.size} mã vật tư S1 KHÔNG có bản tương ứng trong danh mục S2 — đã bỏ qua:`);
    for (const [code, e] of unmapped) console.log(`     ${code} · ${e.name} (${e.count} dòng)`);
    console.log("     → Thêm các vật tư này vào danh mục Tổ Máy S2 rồi chạy lại script.");
  }

  if (toCreate.length) {
    console.log("\n  Ví dụ dòng sẽ tạo:");
    for (const r of toCreate.slice(0, 5)) {
      console.log(`    ${r.deviceSeq ?? r.system ?? "—"} · ${r.quantity}×${r.deviceCount} · chu kỳ ${r.intervalNote ?? `${r.intervalMonths} tháng`} · ${r.isActive ? "điểm thay thế" : "khai báo"}`);
    }
  }

  if (!APPLY || !toCreate.length) return;

  let created = 0;
  for (const batch of chunk(toCreate, 500)) {
    const res = await prisma.materialReplacement.createMany({ data: batch });
    created += res.count;
    process.stdout.write(`\r  Đã tạo ${created}/${toCreate.length} dòng...`);
  }
  console.log(`\n  ✅ Tạo ${created} dòng vật tư S2.`);
}

async function main() {
  console.log(APPLY ? "🚀 CHẾ ĐỘ GHI (--apply)" : "🔍 CHẾ ĐỘ THỬ (dry-run) — thêm --apply để ghi vào DB");
  console.log(`   DB: ${(process.env.DATABASE_URL ?? "").replace(/:[^:@/]*@/, ":***@")}`);

  await copyReplacements();

  console.log("\nXong.");
}

main()
  .catch((e) => {
    console.error("\n❌ Lỗi:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
