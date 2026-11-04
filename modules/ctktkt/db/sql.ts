/** Các tên bảng được cố định; không lấy tên bảng/cột từ yêu cầu của trình duyệt. */
export const TABLES = [
  "measurements", "daily_inputs", "shift_readings", "operating_events", "ppa_heat_rate_daily",
  "water_shift_leaders", "water_shift_logs", "chemical_usage_logs", "operational_read_versions",
  "daily_input_audit", "data_restore_audit", "coal_meter_photos", "coal_photo_usage",
  "coal_gemini_settings", "coal_gemini_settings_events", "google_mirror_credentials", "google_mirror_status",
] as const;

const tables = new Set<string>(TABLES);

/**
 * Giữ câu truy vấn và công thức từ gói bàn giao, chuyển cú pháp gắn tham số sang PostgreSQL.
 * Bộ tách token bỏ qua literal/comment: dấu ? và tên bảng trong giá trị không bị sửa.
 */
export function postgresSql(source: string): string {
  let parameter = 0;
  let previous = "";
  const tokens = source.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|\?|[A-Za-z_][A-Za-z_0-9]*|[\s\S]/g) ?? [];
  let result = tokens.map(token => {
    if (token === "?") return `$${++parameter}`;
    if(token.startsWith('"')) {
      previous="IDENTIFIER";
      const name=token.slice(1,-1);
      return tables.has(name)?`"public"."ctktkt_${name}"`:token;
    }
    if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(token)) return token;
    const before = previous;
    previous = token.toUpperCase();
    if (tables.has(token)) return `"public"."ctktkt_${token}"`;
    if (before === "AS" && /[A-Z]/.test(token) && !["TEXT", "REAL", "INTEGER", "NUMERIC"].includes(token)) return `"${token}"`;
    // Các cột thời gian nguồn là chuỗi UTC, cần giữ định dạng để xuất/nạp backup nguyên vẹn.
    if (token.toUpperCase() === "CURRENT_TIMESTAMP") return "to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')";
    return token;
  }).join("");
  if (/^\s*INSERT OR IGNORE\b/i.test(result)) {
    result = result.replace(/INSERT OR IGNORE/i, "INSERT").replace(/;\s*$/, "") + " ON CONFLICT DO NOTHING";
  }
  return result;
}
