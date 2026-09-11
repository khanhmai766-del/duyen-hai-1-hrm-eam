import "server-only";
import { Pool } from "pg";
import { readFileSync } from "node:fs";

const globalForPg = globalThis as unknown as { tcmsPool?: Pool };
export function getPool() {
  if (!globalForPg.tcmsPool) {
    const file = process.env.TCMS_DATABASE_URL_FILE?.trim();
    const connectionString = file ? readFileSync(file, "utf8").trim() : process.env.TCMS_DATABASE_URL || process.env.DATABASE_URL;
    if (!connectionString) throw new Error("TCMS_DATABASE_NOT_CONFIGURED");
    globalForPg.tcmsPool = new Pool({
      connectionString,
      application_name: "eam-contracts",
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      statement_timeout: 15000,
      ...(process.env.TCMS_DB_SSL === "require" ? { ssl: { rejectUnauthorized: true } } : {}),
    });
    globalForPg.tcmsPool.on("error", () => console.error("Lỗi kết nối cơ sở dữ liệu hợp đồng."));
  }
  return globalForPg.tcmsPool;
}
