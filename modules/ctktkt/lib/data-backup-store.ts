import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { bumpReadVersions, type KtktTx } from "../db/prisma";
import { operationalWriteKeys } from "./operational-query-policy";
import { BACKUP_TABLES, type BackupColumn, type BackupRange, type BackupRow } from "./data-backup";

/**
 * Đọc / ghi sao lưu dữ liệu vận hành bằng Prisma (giai đoạn 4 — thay getRawDb + readBackupSnapshot + PRAGMA).
 * - Đọc: API Prisma theo từng bảng trong MỘT giao dịch REPEATABLE READ (ảnh chụp nhất quán giữa các bảng, như bản cũ).
 * - Ghi (khôi phục): giữ nguyên các câu `INSERT … VALUES (…),(…) ON CONFLICT …` 50 dòng/lô do `restoreStatements` sinh
 *   (Prisma không có upsert hàng loạt; upsert từng dòng chậm với gói 250.000 dòng và đếm "đã thay đổi" khác bản cũ).
 *   Câu chạy qua `$executeRaw` của Prisma: tên bảng chỉ lấy từ danh sách cho phép, tên cột chỉ từ cấu trúc bảng thật,
 *   mọi giá trị là tham số.
 */
type Table = (typeof BACKUP_TABLES)[number];
type TableName = Table["name"];
type Delegate = { findMany: (args: object) => Promise<BackupRow[]>; count: () => Promise<number> };
const DELEGATES: Record<TableName, (tx: KtktTx) => Delegate> = {
  daily_inputs: tx => tx.ctktktDailyInputs as unknown as Delegate,
  shift_readings: tx => tx.ctktktShiftReadings as unknown as Delegate,
  operating_events: tx => tx.ctktktOperatingEvents as unknown as Delegate,
  ppa_heat_rate_daily: tx => tx.ctktktPpaHeatRateDaily as unknown as Delegate,
  water_shift_logs: tx => tx.ctktktWaterShiftLogs as unknown as Delegate,
  chemical_usage_logs: tx => tx.ctktktChemicalUsageLogs as unknown as Delegate,
  measurements: tx => tx.ctktktMeasurements as unknown as Delegate,
  water_shift_leaders: tx => tx.ctktktWaterShiftLeaders as unknown as Delegate,
};
const TABLE_NAMES = new Set<string>(BACKUP_TABLES.map(table => table.name));
/** Bảng có id tự tăng mà bản sao lưu có thể ghi id (khoá là id) — đẩy bộ đếm qua id lớn nhất sau khi nạp. */
const SERIAL_TABLES = ["measurements", "daily_inputs", "shift_readings", "operating_events", "ppa_heat_rate_daily", "water_shift_leaders", "water_shift_logs", "chemical_usage_logs"];

/** Cấu trúc cột của các bảng cho phép (thay PRAGMA table_info cũ — cùng cột và cùng cách đổi kiểu). */
export async function loadBackupSchemas(db: typeof prisma = prisma) {
  const schemas = new Map<string, BackupColumn[]>();
  for (const table of BACKUP_TABLES) {
    const columns = await db.$queryRaw<BackupColumn[]>`SELECT column_name AS name,
      CASE data_type WHEN 'double precision' THEN 'REAL' WHEN 'bigint' THEN 'INTEGER' ELSE upper(data_type) END AS type,
      CASE is_nullable WHEN 'NO' THEN 1 ELSE 0 END AS notnull, column_default AS dflt_value,
      CASE WHEN column_name = 'id' THEN 1 ELSE 0 END AS pk
      FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${"ctktkt_" + table.name} ORDER BY ordinal_position`;
    schemas.set(table.name, columns);
  }
  return schemas;
}

/**
 * Đọc các bảng có trong `active` (theo khoảng ngày nếu có), sắp theo khoá, tối đa `limit` dòng mỗi bảng.
 * Cột "period" (Chỉ tiêu theo kỳ): từ tháng của ngày đầu tới hết tháng của ngày cuối — như bản cũ.
 */
export async function readBackupTables(active: readonly Table[], range: BackupRange, limit: number) {
  return prisma.$transaction(async tx => {
    const out: BackupRow[][] = [];
    for (const table of active) {
      const where = range && table.date
        ? { [table.date]: table.date === "period" ? { gte: range.from.slice(0, 7), lte: range.to.slice(0, 7) + "￿" } : { gte: range.from, lte: range.to } }
        : {};
      out.push(await DELEGATES[table.name](tx).findMany({ where, orderBy: table.keys.map(key => ({ [key]: "asc" })), take: limit }));
    }
    return out;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 120_000, maxWait: 15_000 });
}

/** Câu cũ (dạng `INSERT INTO <bảng> (…) VALUES (?,…)`) → Prisma.sql: bảng allowlist → "public"."ctktkt_<bảng>", `?` → tham số. */
function toPrismaSql(statement: { sql: string; args: (string | number | null)[] }) {
  const match = /^INSERT INTO ([a-z_]+) \(/.exec(statement.sql);
  if (!match || !TABLE_NAMES.has(match[1])) throw new Error("Câu khôi phục không hợp lệ.");
  const text = `INSERT INTO "public"."ctktkt_${match[1]}" ` + statement.sql.slice(`INSERT INTO ${match[1]} `.length);
  if (/['"`;]|--|\/\*/.test(text.slice(text.indexOf("("))) || text.split("?").length - 1 !== statement.args.length) throw new Error("Câu khôi phục không hợp lệ.");
  return Prisma.sql(text.split("?"), ...statement.args);
}

/**
 * Nạp toàn bộ câu khôi phục + nhật ký nạp trong MỘT giao dịch (lỗi ở đâu thì hoàn tác hết). Sau đó, như db/index.ts cũ:
 * tăng phiên bản đọc theo đúng khoá của từng câu, rồi đẩy bộ đếm id của bảng có ghi id. Trả số dòng đã thêm/cập nhật.
 */
export async function restoreBackup(statements: Array<{ sql: string; args: (string | number | null)[] }>, audit: { actorId: string; checksum: string; mode: string; rowCount: number }) {
  return prisma.$transaction(async tx => {
    let changed = 0;
    for (const statement of statements) changed += await tx.$executeRaw(toPrismaSql(statement));
    await tx.ctktktDataRestoreAudit.create({ data: { actor_id: audit.actorId, checksum: audit.checksum, mode: audit.mode, row_count: audit.rowCount } });
    await bumpReadVersions(tx, statements.flatMap(statement => operationalWriteKeys(statement.sql, statement.args)));
    for (const name of SERIAL_TABLES) {
      if (!statements.some(statement => new RegExp(`^\\s*INSERT(?: OR IGNORE)? INTO ${name}\\s*\\([^)]*\\bid\\b`, "i").test(statement.sql))) continue;
      // Khoá bảng để không cấp id mới xen giữa MAX(id) và setval.
      await tx.$executeRawUnsafe(`LOCK TABLE public.ctktkt_${name} IN SHARE ROW EXCLUSIVE MODE`);
      await tx.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('public.ctktkt_${name}', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM public.ctktkt_${name}`);
    }
    return changed;
  }, { timeout: 300_000, maxWait: 15_000 });
}

/** Số dòng hiện có của từng bảng sao lưu (script nạp gói kiểm trước/sau). */
export async function countBackupTables() {
  return Promise.all(BACKUP_TABLES.map(table => DELEGATES[table.name](prisma).count()));
}
