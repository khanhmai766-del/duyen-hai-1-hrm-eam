import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import nextEnv from "@next/env";

// Explicit local/operator command only. Never imported by the application.
nextEnv.loadEnvConfig(process.cwd());
const directory = resolve("prisma/manual/tcms");
const files = (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
if (!process.argv.includes("--apply")) {
  console.log(`Chưa ghi cơ sở dữ liệu. Chuẩn bị ${files.length} tệp SQL trong prisma/manual/tcms.`);
  console.log("Chỉ sau khi được phép khởi tạo dữ liệu, chạy: npm run tcms:migrate -- --apply");
  process.exit(0);
}
const secretFile = process.env.TCMS_MIGRATION_DATABASE_URL_FILE;
const connectionString = secretFile ? (await readFile(secretFile, "utf8")).trim() : process.env.TCMS_MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("Thiếu cấu hình cơ sở dữ liệu.");
const client = new pg.Client({ connectionString, application_name: "eam-contract-migration" });
await client.connect();
try {
  await client.query("SELECT pg_advisory_lock(hashtext('eam:tcms:migration'))");
  const check = await client.query(`SELECT to_regclass('public."User"') IS NOT NULL AS present`);
  if (!check.rows[0].present) throw new Error("Cần chạy trên cơ sở dữ liệu website có bảng User.");
  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    const exists = await client.query("SELECT to_regclass('tcms.schema_migrations') IS NOT NULL AS present");
    if (exists.rows[0].present) {
      const applied = await client.query("SELECT 1 FROM tcms.schema_migrations WHERE version=$1", [version]);
      if (applied.rowCount) { console.log(`Đã có: ${file}`); continue; }
    }
    console.log(`Áp dụng: ${file}`);
    await client.query(await readFile(resolve(directory, file), "utf8"));
  }
  console.log("Đã khởi tạo phân hệ hợp đồng. Chưa tạo hợp đồng hoặc nhà thầu mẫu.");
} catch (error) {
  await client.query("ROLLBACK");
  // Never print connection strings or SQL data in errors.
  const reference = randomUUID();
  console.error(`Khởi tạo chưa hoàn tất. Mã tra cứu: ${reference}; mã lỗi: ${error?.code ?? "CONFIGURATION"}.`);
  process.exitCode = 1;
} finally {
  await client.query("SELECT pg_advisory_unlock(hashtext('eam:tcms:migration'))").catch(() => {});
  await client.end();
}
