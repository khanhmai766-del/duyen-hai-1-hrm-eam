/**
 * Dọn dữ liệu tủ chữa cháy về đúng quy tắc ô ☑ và tính lại tình trạng tổng thể.
 *
 *   npm run normalize:tcc              # DRY-RUN: chỉ in ra sẽ đổi gì
 *   npm run normalize:tcc -- --apply   # ghi thật
 *
 * Hai việc:
 *  1. Bỏ tích "Khả dụng" ở nhóm nào đang tích CẢ HAI thái cực ("Khả dụng" +
 *     "Bất khả dụng"/"Hư hỏng nặng") — giữ mức nặng hơn, đúng `normalizeTccRow()` của
 *     bản web demo. Dữ liệu nhập tay từ Excel có vài dòng như vậy.
 *  2. Tính lại `tinhTrangTongThe` cho mọi tủ theo `deriveCabinetStatus()`.
 *
 * Idempotent: chạy lại lần 2 ra 0 thay đổi.
 */
import { PrismaClient } from "@prisma/client";
import { deriveCabinetStatus, tccPolarityViolations } from "../lib/pccc-status";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(APPLY ? "CHẾ ĐỘ GHI THẬT (--apply)\n" : "DRY-RUN — chưa ghi gì. Thêm --apply để ghi thật.\n");

  const cabinets = await prisma.pcccCabinet.findMany({
    include: { period: { select: { label: true } }, components: true },
    orderBy: [{ ma: "asc" }],
  });

  let untick = 0;
  let restatus = 0;
  const byGroup = new Map<string, number>();

  for (const cab of cabinets) {
    // 1) hai thái cực cùng tích → bỏ "Khả dụng"
    for (const v of tccPolarityViolations(cab.components)) {
      const cell = cab.components.find((c) => c.groupLabel === v.groupLabel && c.status === v.okStatus);
      if (!cell) continue;
      untick += 1;
      byGroup.set(v.groupLabel, (byGroup.get(v.groupLabel) ?? 0) + 1);
      console.log(`  ${cab.period.label} · ${cab.ma} · ${v.groupLabel}: bỏ tích "${v.okStatus}" (đang tích cả 2 thái cực)`);
      if (APPLY) await prisma.pcccCabinetComponent.update({ where: { id: cell.id }, data: { checked: false } });
      cell.checked = false;
    }

    // 2) tính lại tình trạng tổng thể
    const derived = deriveCabinetStatus(cab.components);
    if (derived !== cab.tinhTrangTongThe) {
      restatus += 1;
      console.log(`  ${cab.period.label} · ${cab.ma}: tình trạng ${cab.tinhTrangTongThe ?? "∅"} → ${derived}`);
      if (APPLY) await prisma.pcccCabinet.update({ where: { id: cab.id }, data: { tinhTrangTongThe: derived } });
    }
  }

  console.log(`\n${cabinets.length} tủ · ${untick} ô bỏ tích · ${restatus} tủ đổi tình trạng`);
  if (byGroup.size > 0) console.log("Bỏ tích theo nhóm:", Object.fromEntries(byGroup));
  if (!APPLY && untick + restatus > 0) console.log("\nChưa ghi gì. Chạy lại với --apply để áp dụng.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
