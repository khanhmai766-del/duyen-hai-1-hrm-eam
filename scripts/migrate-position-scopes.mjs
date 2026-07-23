// Migrate PositionSystemScope sang định dạng mã mới sau re-key cây thiết bị.
//
//   node scripts/migrate-position-scopes.mjs            # XEM TRƯỚC (không ghi)
//   node scripts/migrate-position-scopes.mjs --confirm  # thực sự cập nhật
//
// Vì sao: scope cũ lưu "Số thứ tự" dạng số thuần ("1.13"...). Sau re-key, cây dùng Mã
// thiết bị đầy đủ ("DH1.S1.1.13") → scope cũ không khớp gì cả và CƯƠNG VỊ CÓ SCOPE SẼ
// THẤY CÂY RỖNG. Quy tắc map 1-1: "x.y.z" → "DH1.S1.x.y.z" (chỉ áp khi node đích tồn tại).

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");

async function main() {
  const rows = await prisma
    .$queryRawUnsafe(`SELECT id, position, "systemSeq", access FROM "PositionSystemScope"`)
    .catch(() => []);
  if (!rows.length) {
    console.log("ℹ️  Không có PositionSystemScope nào — không cần migrate.");
    return;
  }

  const oldFormat = rows.filter((r) => /^[0-9]+(\.[0-9]+)*$/.test(r.systemSeq));
  const newFormat = rows.filter((r) => r.systemSeq.startsWith("DH1.S1"));
  const other = rows.length - oldFormat.length - newFormat.length;
  console.log(`📊 Scope: tổng ${rows.length} | định dạng cũ (số thuần) ${oldFormat.length} | đã đúng DH1.S1 ${newFormat.length} | khác ${other}`);

  let mapped = 0, missing = 0;
  for (const r of oldFormat) {
    const target = `DH1.S1.${r.systemSeq}`;
    const node = await prisma.equipmentNode.findUnique({ where: { seq: target }, select: { seq: true, name: true } });
    if (!node) {
      missing++;
      console.log(`   ⚠️  ${r.position} · ${r.systemSeq} → ${target} KHÔNG tồn tại trong cây mới (cần admin cấu hình lại tay)`);
      continue;
    }
    mapped++;
    if (CONFIRM) {
      await prisma.$executeRawUnsafe(`UPDATE "PositionSystemScope" SET "systemSeq" = $1 WHERE id = $2`, target, r.id);
    } else {
      console.log(`   ${r.position} · ${r.systemSeq} → ${target} (${node.name.slice(0, 40)})`);
    }
  }

  console.log(`\n${CONFIRM ? "✅ Đã cập nhật" : "ℹ️  Sẽ cập nhật"} ${mapped} scope | không map được: ${missing}`);
  if (!CONFIRM) console.log("Thêm --confirm để thực sự ghi. Sau khi ghi, admin nên rà lại màn hình phân quyền hệ thống.");
}

main()
  .catch((e) => {
    console.error("❌ Lỗi:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
