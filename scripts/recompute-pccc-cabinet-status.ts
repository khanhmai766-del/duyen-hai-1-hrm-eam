/**
 * Tính lại "Tình trạng tổng thể" của TỦ CHỮA CHÁY sau khi hai nhóm CUỘN ỐNG / LĂNG PHUN
 * chuyển hẳn xuống bảng cuộn vòi (xem TCC_ABSORBED_GROUPS trong lib/pccc-status.ts).
 *
 *   npx tsx scripts/recompute-pccc-cabinet-status.ts            # DRY-RUN
 *   npx tsx scripts/recompute-pccc-cabinet-status.ts --apply    # ghi thật
 *
 * Không có bước này thì bảng tủ hiện một đằng, tình trạng nói một nẻo: cột lăng phun đã
 * biến mất khỏi bảng nhưng tủ vẫn mang nhãn "Bất khả dụng" sinh ra từ chính cột đó.
 *
 * KHÔNG đụng kỳ đã CHỐT: kỳ chốt là bản ghi bất biến, gồm cả phần đã ký.
 * KHÔNG xoá ô tích nào — dữ liệu hai nhóm vẫn nằm nguyên trong DB.
 */
import { PrismaClient } from "@prisma/client";
import { cabinetComponentsForTcc, deriveCabinetStatus } from "../lib/pccc-status";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(APPLY ? "CHẾ ĐỘ GHI THẬT (--apply)\n" : "DRY-RUN — chưa ghi gì. Thêm --apply để ghi thật.\n");
  const periods = await prisma.pcccPeriod.findMany({ select: { id: true, label: true, isClosed: true } });

  for (const period of periods) {
    if (period.isClosed) {
      console.log(`${period.label}: BỎ QUA (kỳ đã chốt)`);
      continue;
    }
    const cabinets = await prisma.pcccCabinet.findMany({
      where: { periodId: period.id },
      select: { id: true, ma: true, tinhTrangTongThe: true, components: true },
    });
    const changes = cabinets
      .map((c) => ({ c, next: deriveCabinetStatus(cabinetComponentsForTcc(c.components)) }))
      .filter(({ c, next }) => c.tinhTrangTongThe !== next);

    const grouped = new Map<string, number>();
    for (const { c, next } of changes) {
      const key = `${c.tinhTrangTongThe ?? "∅"} → ${next}`;
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    }
    console.log(`${period.label}: ${cabinets.length} tủ, ${changes.length} tủ đổi tình trạng`);
    for (const [key, n] of [...grouped].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(4)}  ${key}`);

    if (APPLY) {
      for (const { c, next } of changes) {
        await prisma.pcccCabinet.update({ where: { id: c.id }, data: { tinhTrangTongThe: next } });
      }
      if (changes.length) console.log(`   ✔ đã ghi ${changes.length} tủ`);
    }
  }
  if (!APPLY) console.log("\nChưa ghi gì. Chạy lại với --apply để áp dụng.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
