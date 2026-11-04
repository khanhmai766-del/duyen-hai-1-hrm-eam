// Only shared operating data is cacheable. Auth, permissions, HR, Work PX,
// audit logs and credentials are deliberately absent.
export const OPERATIONAL_TABLES = new Set([
  'daily_inputs', 'shift_readings', 'water_shift_logs',
  'ppa_heat_rate_daily', 'chemical_usage_logs', 'operating_events',
]);

const dateColumn = (table: string) => table === 'water_shift_logs' ? 'log_date'
  : table === 'chemical_usage_logs' ? 'usage_date' : 'operating_date';
const isoDate = /^20\d{2}-(0[1-9]|1[0-2])-[0-3]\d$/;
const isIsoDate = (value: unknown): value is string => typeof value === 'string' && isoDate.test(value)
  && !Number.isNaN(Date.parse(value + 'T12:00:00Z'))
  && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;

function monthsBetween(first: string, last: string) {
  if (first > last) return [];
  const months: string[] = [];
  let month = first.slice(0, 7);
  while (month <= last.slice(0, 7) && months.length <= 1200) {
    months.push(month);
    const year = Number(month.slice(0, 4)), next = Number(month.slice(5)) + 1;
    month = next === 13 ? `${year + 1}-01` : `${year}-${String(next).padStart(2, '0')}`;
  }
  return months;
}

function parameterIndex(sql: string, position: number) {
  let count = 0, quote = '';
  for (let i = 0; i < position; i++) {
    const ch = sql[i];
    if (quote) {
      if (ch === quote) {
        if (sql[i + 1] === quote) i++;
        else quote = '';
      }
    } else if (ch === "'" || ch === '"' || ch === '\x60') quote = ch;
    else if (ch === '?') count++;
  }
  return count;
}

export function operationalReadKeys(sql: string, args: unknown[]): string[] | null {
  if (!/^\s*SELECT\b/i.test(sql) || /;|--|\/\*|\b(JOIN|UNION|INTERSECT|EXCEPT|CURRENT_DATE|CURRENT_TIME|CURRENT_TIMESTAMP|RANDOM|RANDOMBLOB)\b|\b(?:date|time|datetime|strftime|julianday)\s*\(/i.test(sql)) return null;
  if ((sql.match(/\bSELECT\b/gi) || []).length !== 1 || (sql.match(/\bFROM\b/gi) || []).length !== 1) return null;
  const match = /\bFROM\s+[`"]?([a-z_][a-z_0-9]*)[`"]?\s*(?:WHERE|ORDER\s+BY|GROUP\s+BY|LIMIT|$)/i.exec(sql);
  const table = match?.[1].toLowerCase();
  if (!table || !OPERATIONAL_TABLES.has(table)) return null;
  const column = dateColumn(table);
  // Only infer date bounds when they are the first predicates/placeholders.
  // Any more complex SQL uses the whole-table revision instead.
  if (!/\bOR\b/i.test(sql)) {
    const bounds = new RegExp(`\\bWHERE\\s+${column}\\s*>=\\s*\\?\\s+AND\\s+${column}\\s*<\\s*\\?`, 'i').exec(sql);
    if (bounds && sql.indexOf('?') === bounds.index + bounds[0].indexOf('?')
      && typeof args[0] === 'string' && typeof args[1] === 'string'
      && isIsoDate(args[0]) && isIsoDate(args[1]) && args[0] < args[1]) {
      const end = new Date(`${args[1]}T12:00:00Z`);
      end.setUTCDate(end.getUTCDate() - 1);
      return [`${table}:all`, ...monthsBetween(args[0], end.toISOString().slice(0, 10)).map(month => `${table}:${month}`)];
    }
    const equal = new RegExp(`\\bWHERE\\s+${column}\\s*=\\s*\\?(?:\\s|$)`, 'i').exec(sql);
    if (equal && sql.indexOf('?') === equal.index + equal[0].indexOf('?') && isIsoDate(args[0])) {
      return [`${table}:all`, `${table}:${args[0].slice(0, 7)}`];
    }
  }
  return [table];
}

export function operationalWriteKeys(sql: string, args: unknown[]): string[] {
  const match = /^\s*(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|REPLACE\s+INTO|UPDATE(?:\s+OR\s+\w+)?|DELETE\s+FROM|ALTER\s+TABLE|DROP\s+TABLE(?:\s+IF\s+EXISTS)?)\s+[`"]?([a-z_][a-z_0-9]*)/i.exec(sql);
  const table = match?.[1].toLowerCase();
  if (!table || !OPERATIONAL_TABLES.has(table)) return [];
  const dates = args.filter(isIsoDate);
  // DDL, unbounded/range mutations and SQL literals invalidate every month.
  // Date-bounded point writes are the only localized case.
  const column = dateColumn(table);
  const insertDateFirst = new RegExp("^\\s*(?:INSERT(?:\\s+OR\\s+\\w+)?\\s+INTO|REPLACE\\s+INTO)\\s+[\x60\"]?" + table + "[\x60\"]?\\s*\\(\\s*[\x60\"]?" + column + "[\x60\"]?\\s*,[^)]*\\)\\s*VALUES\\s*\\(\\s*\\?", 'i').test(sql);
  const whereDate = new RegExp(`\\bWHERE\\s+${column}\\s*=\\s*\\?(?:\\s|$)`, 'i').exec(sql);
  const whereDateFirst = Boolean(whereDate && isIsoDate(args[parameterIndex(sql, sql.indexOf('?', whereDate.index))]));
  const changesDate = new RegExp(`\\b${column}\\s*=`, 'i').test(sql.split(/\bWHERE\b/i)[0]);
  const pointWrite = !/;|--|\/\*|\b(SELECT|OR)\b|\b(?:operating_date|log_date|usage_date)\s*(?:>=|<=|<|>|BETWEEN|IN\s*\()/i.test(sql)
    && ((insertDateFirst && isIsoDate(args[0])) || (whereDateFirst && !changesDate));
  if (!pointWrite || !dates.length) return [table, `${table}:all`];
  const months = [...new Set(dates.map(date => date.slice(0, 7)))];
  return [table, ...months.map(month => `${table}:${month}`)];
}
