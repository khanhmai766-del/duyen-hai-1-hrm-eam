/**
 * Dọn ba ảnh hiện trường của các phiếu đã quyết toán quá hạn giữ.
 *
 *   cd /var/www/dh1-app && set -a && . ./.env && set +a && npx tsx scripts/purge-usage-photos.ts
 *   … --dry-run   # chỉ liệt kê, không xoá gì
 *
 * Việc dọn này CÒN được gọi ngay trong mỗi lượt quyết toán (action "settle"), nên bình
 * thường chẳng còn gì để script làm. Script là đường dự phòng cho những tuần không ai quyết
 * toán phiếu nào — hẹn giờ chạy mỗi ngày là đủ.
 *
 * Quét theo `settledAt` nên chạy lại bao nhiêu lần cũng ra cùng kết quả; sót một hôm thì
 * hôm sau dọn bù.
 */
import { PrismaClient } from "@prisma/client";
import { purgeExpiredUsagePhotos } from "../lib/material-usage-photo";
import { USAGE_PHOTO_RETENTION_DAYS } from "../lib/constants";

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const deadline = new Date(Date.now() - USAGE_PHOTO_RETENTION_DAYS * 86_400_000);
  const cho = await prisma.materialTicket.findMany({
    where: {
      settledAt: { not: null, lte: deadline },
      OR: [
        { usagePhotoBeforeKey: { not: null } },
        { usagePhotoAfterKey: { not: null } },
        { usagePhotoSpecKey: { not: null } },
      ],
    },
    select: { sequenceMonth: true, sequenceNumber: true, settledAt: true },
    orderBy: [{ sequenceMonth: "asc" }, { sequenceNumber: "asc" }],
  });

  console.log(`Hạn giữ ${USAGE_PHOTO_RETENTION_DAYS} ngày — quyết toán trước ${deadline.toLocaleString("vi-VN")}`);
  console.log(`Phiếu còn ảnh quá hạn: ${cho.length}`);
  for (const t of cho) {
    console.log(`  · VT-${t.sequenceNumber} tháng ${t.sequenceMonth} · quyết toán ${t.settledAt?.toLocaleDateString("vi-VN")}`);
  }
  if (DRY_RUN) {
    console.log("Chạy khô — chưa xoá gì. Bỏ --dry-run để dọn thật.");
    return;
  }
  const result = await purgeExpiredUsagePhotos(prisma);
  console.log(`Đã dọn ${result.removed} ảnh của ${result.tickets} phiếu.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
