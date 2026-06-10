// Chuẩn hoá "Chức vụ" (position) của user: gộp các biến thể chỉ khác hoa/thường
// (và khoảng trắng thừa) về MỘT biến thể chuẩn = biến thể được dùng NHIỀU nhất.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { position: { not: null } },
    select: { id: true, position: true },
  });

  // Gom theo key = lowercase(trim); đếm số lần mỗi biến thể xuất hiện.
  const groups = new Map(); // key -> Map(variant -> count)
  for (const u of users) {
    const p = (u.position ?? "").trim();
    if (!p) continue;
    const key = p.toLowerCase();
    if (!groups.has(key)) groups.set(key, new Map());
    const v = groups.get(key);
    v.set(p, (v.get(p) ?? 0) + 1);
  }

  // Chọn biến thể chuẩn cho mỗi nhóm: nhiều nhất; hoà thì lấy theo alphabet.
  const canonical = new Map();
  for (const [key, variants] of groups) {
    let best = null;
    let bestCount = -1;
    for (const [variant, count] of variants) {
      if (count > bestCount || (count === bestCount && variant.localeCompare(best ?? "", "vi") < 0)) {
        best = variant;
        bestCount = count;
      }
    }
    canonical.set(key, best);
  }

  // Báo cáo các nhóm có >1 biến thể.
  let mergedGroups = 0;
  for (const [key, variants] of groups) {
    if (variants.size > 1) {
      mergedGroups++;
      console.log(`• ${[...variants.keys()].join(" | ")}  →  "${canonical.get(key)}"`);
    }
  }

  // Cập nhật user có position khác bản chuẩn (hoặc còn khoảng trắng thừa).
  let updated = 0;
  for (const u of users) {
    const p = (u.position ?? "").trim();
    if (!p) continue;
    const c = canonical.get(p.toLowerCase());
    if (u.position !== c) {
      await prisma.user.update({ where: { id: u.id }, data: { position: c } });
      updated++;
    }
  }

  console.log(`\n✅ Gộp ${mergedGroups} nhóm biến thể, cập nhật ${updated} user. Tổng ${groups.size} chức vụ phân biệt sau chuẩn hoá.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
