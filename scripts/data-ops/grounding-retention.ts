/** Mặc định chỉ đọc số liệu; --apply thực sự xoá lịch sử tiếp địa/chống sét quá 1 tháng 15 ngày. */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { prisma } = await import("../../lib/prisma");
  const { groundingRetentionCounts, purgeGroundingHistory } = await import("../../lib/server/grounding-retention");
  try {
    const now = new Date();
    console.log("Lịch sử quá hạn (trước mốc 06h Việt Nam):", await groundingRetentionCounts(prisma, now));
    if (process.argv.includes("--apply")) console.log("Đã xoá:", await purgeGroundingHistory(prisma, now));
    else console.log("Chỉ kiểm tra. Dùng --apply để xoá; không xoá danh mục, kết quả hiện tại hoặc ảnh.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
