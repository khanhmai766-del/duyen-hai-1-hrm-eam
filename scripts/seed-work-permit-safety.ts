/** Chỉ thêm nội dung trích từ 3 phiếu người dùng cung cấp; không ghi đè danh mục đã sửa. */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import samples from "@/data/work-permit-safety-samples.json";
import { normalizeText } from "@/lib/nav";
loadEnvConfig(process.cwd());
const url = new URL(process.env.DATABASE_URL ?? "");
const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.port === "5433";
if (!local && !process.argv.includes("--allow-remote")) throw new Error("Chỉ đồng bộ DB ngoài local khi truyền rõ --allow-remote");
const db = new PrismaClient();
async function main() {
  const result = await db.workPermitSafetyMeasure.createMany({ data: samples.map(row => ({ ...row, searchText: normalizeText([row.hazard, row.measure, row.source].join(" ")) })), skipDuplicates: true });
  console.log(`Đã bổ sung ${result.count}/${samples.length} mục an toàn Cơ – Nhiệt – Hóa còn thiếu. Các mục đã có được giữ nguyên; danh mục Điện giữ riêng.`);
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
