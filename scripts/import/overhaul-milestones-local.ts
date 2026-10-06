/** Nạp bộ PL2 đã đối chiếu vào DB LOCAL. Chỉ thêm mã nguồn mới, không ghi đè sửa/xoá trên web.
 * npx tsx scripts/import/overhaul-milestones-local.ts */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { S2_MILESTONES_SOURCE } from "../../lib/overhaul-milestones-source";

loadEnvConfig(process.cwd());
const host = new URL(process.env.DATABASE_URL ?? "http://invalid").hostname;
if (!["localhost", "127.0.0.1", "[::1]"].includes(host) || process.env.NODE_ENV === "production") {
  throw new Error("Chỉ được nạp bộ lịch thử vào cơ sở dữ liệu localhost");
}
const prisma = new PrismaClient();
async function main() {
  const result = await prisma.overhaulMilestone.createMany({
    data: S2_MILESTONES_SOURCE.map((row) => ({
      ...row, startDate: new Date(`${row.startDate}T00:00:00Z`), endDate: row.endDate ? new Date(`${row.endDate}T00:00:00Z`) : null,
    })), skipDuplicates: true,
  });
  console.log(`Đã thêm ${result.count}/${S2_MILESTONES_SOURCE.length} mốc SCL S2 vào DB local. Mốc đã tồn tại được giữ nguyên.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
