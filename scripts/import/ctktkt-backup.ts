import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { prisma } from "../../lib/prisma";
import { readBackupArchive, archiveSummary, archiveStatements } from "../../modules/ctktkt/lib/backup-archive";
import { BACKUP_TABLES } from "../../modules/ctktkt/lib/data-backup";
import { countBackupTables, loadBackupSchemas, restoreBackup } from "../../modules/ctktkt/lib/data-backup-store";
import { inspectUpload } from "../../lib/upload-guard";

/** Mặc định chỉ kiểm tra; DB ngoài local cần đồng thời --apply và --production. */
async function main() {
  loadEnvConfig(process.cwd());
  const args = process.argv.slice(2), file = args.find(value => !value.startsWith("--"));
  if (!file) throw new Error("Cách dùng: npx tsx scripts/import/ctktkt-backup.ts <gói.zip> [--apply] [--init-schema | --production]");
  const buffer = await readFile(path.resolve(file));
  await inspectUpload(buffer, { fileName: path.basename(file), kinds: ["zip"], label: "ZIP" });
  const files = await readBackupArchive(buffer), summary = archiveSummary(files);
  console.log(JSON.stringify(summary, null, 2));
  if (!args.includes("--apply")) { console.log("Chỉ kiểm tra gói; chưa ghi dữ liệu."); return; }
  const url = new URL(process.env.DATABASE_URL ?? "");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!local && !args.includes("--production")) throw new Error("Nạp vào DB ngoài local cần xác nhận rõ bằng --apply --production.");
  if (args.includes("--production") && args.includes("--init-schema")) throw new Error("Cấu trúc production phải được áp bằng quy trình deploy trước khi nạp dữ liệu.");
  console.log(`Đích nạp KTKT: ${url.hostname}:${url.port || "5432"}${url.pathname}; chỉ bổ sung bản ghi thiếu.`);
  if (args.includes("--init-schema")) {
    // Tệp SQL nhiều câu lệnh: chạy bằng kết nối pg trực tiếp (Prisma không chạy nhiều câu trong một lệnh).
    const schemaUrl = new URL(url); schemaUrl.searchParams.delete("schema");
    const client = new pg.Client({ connectionString: schemaUrl.toString() });
    await client.connect();
    try { await client.query(await readFile("prisma/manual/add-ctktkt.sql", "utf8")); } finally { await client.end(); }
  }
  const schemas = await loadBackupSchemas();
  const before = await countBackupTables();
  const statements = archiveStatements(files, schemas, "missing");
  const changed = await restoreBackup(statements, { actorId: local ? "local-import" : "production-import", checksum: summary.checksum, mode: "missing", rowCount: summary.total });
  const afterCounts = await countBackupTables();
  const counts = BACKUP_TABLES.map((table, index) => ({ table: table.name, before: before[index], after: afterCounts[index], source: summary.tables[index].count }));
  if (counts.some(row => row.before === 0 && row.after !== row.source)) throw new Error("Số bản ghi sau nạp không khớp gói nguồn.");
  console.log(JSON.stringify({ changed, counts }, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Không nạp được gói sao lưu."); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
