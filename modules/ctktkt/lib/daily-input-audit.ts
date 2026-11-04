import type { getRawDb } from "../db/index";
import type { SessionUser } from "./auth/session";

type Db = ReturnType<typeof getRawDb>;
type Statement = Parameters<Db["batch"]>[0][number];

export async function ensureDailyInputAudit(_db: Db) { /* prisma/manual/add-ctktkt.sql */ }

// Snapshot before each mutation in the same transaction: audit failure rolls back the data save.
export async function auditedDailyBatch(db: Db, user: SessionUser, source: string, statements: Statement[]) {
  if (!statements.length) return [];
  await ensureDailyInputAudit(db);
  const batch: Statement[] = [];
  const originalIndexes: number[] = [];
  for (const statement of statements) {
    const insert = /^INSERT INTO daily_inputs\s*\(/i.test(statement.sql);
    const remove = /^DELETE FROM daily_inputs\s/i.test(statement.sql);
    if (insert || remove) {
      const [date, code, value, note] = statement.args;
      const newValue = remove ? null : value;
      // Some writers preserve the existing note on update; keep that exact behavior in the log.
      const newNoteSql = remove ? "NULL" : /note\s*=\s*excluded\.note/i.test(statement.sql) ? "?" : "COALESCE(note, '')";
      const noteArgs = newNoteSql === "?" ? [note ?? ""] : [];
      batch.push(db.prepare(`INSERT INTO daily_input_audit
        (actor_id, actor_username, actor_name, source, operating_date, field_code, action, old_value, new_value, old_note, new_note)
        SELECT ?, ?, ?, ?, ?, ?, CASE WHEN ? = 1 THEN 'delete' WHEN value IS NULL THEN 'insert' ELSE 'update' END,
          value, ?, note, ${newNoteSql}
        FROM (
          SELECT value, note FROM daily_inputs WHERE operating_date = ? AND field_code = ?
          UNION ALL SELECT NULL, NULL WHERE NOT EXISTS (SELECT 1 FROM daily_inputs WHERE operating_date = ? AND field_code = ?)
        ) AS previous_value WHERE value IS DISTINCT FROM ? OR note IS DISTINCT FROM ${newNoteSql}`)
        .bind(user.id, user.username, user.displayName, source, date, code, remove ? 1 : 0,
          newValue, ...noteArgs, date, code, date, code, newValue, ...noteArgs));
    }
    originalIndexes.push(batch.length);
    batch.push(statement);
  }
  const results = await db.batch(batch);
  return originalIndexes.map(index => results[index]);
}
