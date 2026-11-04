import { Pool, types, type PoolClient, type QueryResultRow } from "pg";
import { postgresSql, TABLES } from "./sql";
import { operationalWriteKeys } from "../lib/operational-query-policy";

export type Statement = { sql: string; args: unknown[] };
type Result = { success: boolean; meta: { changes: number; last_row_id: number } };

const globalDb = globalThis as typeof globalThis & { ctktktPool?: Pool };
export function getPool() {
  if (!globalDb.ctktktPool) {
    const url = new URL(process.env.DATABASE_URL ?? "");
    url.searchParams.delete("schema");
    globalDb.ctktktPool = new Pool({
      connectionString: url.toString(), max: 5, connectionTimeoutMillis: 10_000,
      types: { getTypeParser: (oid: number) => oid === 20 ? Number : types.getTypeParser(oid) },
    });
  }
  return globalDb.ctktktPool;
}

async function query(client: PoolClient, statement: Statement) {
  const pragma = /^\s*PRAGMA table_info\(([a-z_]+)\)\s*$/i.exec(statement.sql);
  if (pragma) {
    if (!(TABLES as readonly string[]).includes(pragma[1])) throw new Error("Bảng dữ liệu không hợp lệ.");
    return client.query(`SELECT column_name AS name,
      CASE data_type WHEN 'double precision' THEN 'REAL' WHEN 'bigint' THEN 'INTEGER' ELSE upper(data_type) END AS type,
      CASE is_nullable WHEN 'NO' THEN 1 ELSE 0 END AS notnull, column_default AS dflt_value,
      CASE WHEN column_name = 'id' THEN 1 ELSE 0 END AS pk
      FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, [`ctktkt_${pragma[1]}`]);
  }
  return client.query(postgresSql(statement.sql), statement.args);
}

function meta(rows: QueryResultRow[], count: number | null): Result {
  return { success: true, meta: { changes: count ?? 0, last_row_id: Number(rows[0]?.id ?? 0) } };
}

/** Giao dịch dữ liệu + nhật ký + phiên bản đọc cùng commit; bất kỳ câu nào lỗi đều rollback. */
export async function transaction(statements: Statement[], readOnly = false) {
  const client = await getPool().connect();
  try {
    await client.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
    const results = [];
    for (const statement of statements) results.push(await query(client, statement));
    if (!readOnly) {
      const keys = [...new Set(statements.flatMap(s => operationalWriteKeys(s.sql, s.args)))];
      for (const key of keys) await client.query(`INSERT INTO public.ctktkt_operational_read_versions(cache_key, version)
        VALUES ($1, 1) ON CONFLICT(cache_key) DO UPDATE SET version = ctktkt_operational_read_versions.version + 1`, [key]);
      // Backup có thể chứa ID lịch sử; sequence phải tiếp tục sau ID cao nhất.
      const serialTables = ["measurements", "daily_inputs", "shift_readings", "operating_events", "ppa_heat_rate_daily", "water_shift_leaders", "water_shift_logs", "chemical_usage_logs"];
      for (const name of serialTables) {
        if (!statements.some(s => new RegExp(`^\\s*INSERT(?: OR IGNORE)? INTO ${name}\\s*\\([^)]*\\bid\\b`, "i").test(s.sql))) continue;
        // Khoá bảng ngăn cấp ID mới xen giữa MAX(id) và setval khi khôi phục.
        await client.query(`LOCK TABLE public.ctktkt_${name} IN SHARE ROW EXCLUSIVE MODE`);
        await client.query(`SELECT setval(pg_get_serial_sequence('public.ctktkt_${name}', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM public.ctktkt_${name}`);
      }
    }
    await client.query("COMMIT");
    return results;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

function statement(sql: string, args: unknown[] = []) {
  const read = async () => (await transaction([{ sql, args }], /^\s*(SELECT|PRAGMA)\b/i.test(sql)))[0];
  return {
    sql, args,
    all: async () => ({ results: (await read()).rows }),
    first: async () => (await read()).rows[0] ?? null,
    run: async () => { const r = await read(); return meta(r.rows, r.rowCount); },
  };
}
export function getRawDb() {
  return {
    prepare: (sql: string) => ({ ...statement(sql), bind: (...args: unknown[]) => statement(sql, args) }),
    batch: async (statements: Statement[]) => (await transaction(statements)).map(r => meta(r.rows, r.rowCount)),
  };
}
export async function readBackupSnapshot(statements: Statement[]) {
  return (await transaction(statements, true)).map(result => result.rows);
}
export async function getOperationalReadVersions() {
  const { results } = await getRawDb().prepare("SELECT cache_key, version FROM operational_read_versions").all();
  return Object.fromEntries(results.map(row => [String(row.cache_key), Number(row.version)]));
}
