import { normalizeText } from "@/lib/nav";
import { a1Tab, batchGetValues, batchUpdateSpreadsheet, getProtectedRanges, getSpreadsheet, GoogleSheetsError, serviceAccountEmail, spreadsheetIdFromUrl } from "@/lib/server/google-sheets";
import { overhaulScheduleLinks } from "@/lib/server/overhaul-schedules";
import { OVERHAUL_SOURCES, type OverhaulSource } from "@/lib/work-permit-overhaul";

/*
 * Khoá CẢ TAB CƯƠNG VỊ của 4 file tiến độ đại tu (nghiệp vụ 13/10/2026): tab hạng mục web đọc/ghi (hàng tiêu đề có
 * "Mã hạng mục" + "Nội dung công việc", trừ tab nháp "Điện_1") khoá toàn bộ — chỉ tài khoản dịch vụ + --editor (và chủ
 * file) sửa được; web ghi bằng tài khoản dịch vụ nên vẫn ghi được. Tab "Tiến độ …" để mở cho mọi người cập nhật; tab
 * nguồn ("Lò- Cơ", "Turbine- Cơ", "Chi tiết …"), README, "Điện_1" giữ nguyên khoá A:E có sẵn (user chọn 13/10/2026).
 *
 * Nhãn riêng LOCK_TAG — KHÁC tiền tố "[dh1-web] Ô do web ghi" của --protect/--unprotect cột (overhaul-sheet-writer.ts),
 * nên chạy lại hai lệnh đó không gỡ mất khoá cả tab. Vùng khoá có sẵn của người khác (A:E…) giữ nguyên, chỉ liệt kê.
 * Mặc định chỉ báo; apply=true mới ghi. Chạy lại an toàn: khoá cũ của lệnh này được thay bằng khoá mới (cập nhật người sửa).
 */
export const OVERHAUL_TAB_LOCK_TAG = "[dh1-web] Khoá cả tab";

/** Tab cương vị = tab hạng mục: 30 hàng đầu có "Mã hạng mục", "Nội dung công việc", "Trạng thái hiện tại" cùng hàng; trừ tab nháp "Điện_1". */
export function isOverhaulPositionTab(title: string, rows: string[][]) {
  if (normalizeText(title).trim() === "dien_1") return false;
  return rows.some(row => {
    const cells = row.map(cell => normalizeText(String(cell ?? "")));
    // Tab nguồn ("Lò- Cơ", "Turbine- Cơ" — 6 cột) cũng có hai ô trên nhưng không có cột "Trạng thái hiện tại" / cột ngày.
    return cells.some(cell => cell.includes("ma hang muc")) && cells.some(cell => cell.includes("noi dung cong viec")) && cells.some(cell => cell.includes("trang thai hien tai"));
  });
}

export async function lockOverhaulTabs(apply: boolean, editorEmails: string[], options: { unlock?: boolean } = {}) {
  const sa = serviceAccountEmail();
  if (!sa) throw new GoogleSheetsError("Máy chủ chưa cấu hình tài khoản dịch vụ Google (GOOGLE_SA_KEY_FILE).", 503);
  const editors = [...new Set([sa, ...editorEmails].map(email => email.trim().toLowerCase()).filter(Boolean))];
  if (!options.unlock && editors.length < 2) throw new GoogleSheetsError("Thiếu --editor <email> — khoá cả tab mà chỉ tài khoản dịch vụ sửa được thì không ai chỉnh tay được nữa.", 400);
  const links = await overhaulScheduleLinks();
  const report: string[] = [options.unlock ? "Gỡ khoá cả tab do lệnh này tạo" : `Khoá cả tab cương vị — người được sửa: ${editors.join(", ")} (+ chủ file); tab khác giữ nguyên`];
  for (const source of Object.keys(OVERHAUL_SOURCES) as OverhaulSource[]) {
    const spreadsheetId = spreadsheetIdFromUrl(links.find(link => link.id === source)?.url ?? "");
    if (!spreadsheetId) { report.push(`${OVERHAUL_SOURCES[source]}: chưa có link — bỏ qua`); continue; }
    const meta = await getSpreadsheet(spreadsheetId);
    const existing = await getProtectedRanges(spreadsheetId);
    const heads = await batchGetValues(spreadsheetId, meta.tabs.map(tab => `${a1Tab(tab.title)}!A1:J30`));
    const requests: object[] = [];
    report.push(`${OVERHAUL_SOURCES[source]} · ${meta.title}`);
    for (const [index, tab] of meta.tabs.entries()) {
      const ranges = existing.get(tab.title) ?? [];
      const ours = ranges.filter(item => item.description?.startsWith(OVERHAUL_TAB_LOCK_TAG));
      const others = ranges.filter(item => !item.description?.startsWith(OVERHAUL_TAB_LOCK_TAG));
      for (const item of ours) requests.push({ deleteProtectedRange: { protectedRangeId: item.protectedRangeId } });
      const open = options.unlock || !isOverhaulPositionTab(tab.title, (heads[index] ?? []).map(row => row.map(String)));
      if (!open) requests.push({ addProtectedRange: { protectedRange: {
        range: { sheetId: tab.sheetId }, description: `${OVERHAUL_TAB_LOCK_TAG} · ${tab.title}`, warningOnly: false, editors: { users: editors },
      } } });
      const action = open ? (ours.length ? `gỡ ${ours.length} khoá cả tab` : "giữ nguyên") : `KHOÁ CẢ TAB${ours.length ? " (thay khoá cũ)" : ""}`;
      // Khoá của người khác trên tab để mở thì vẫn còn hiệu lực — báo rõ để người dùng tự gỡ nếu muốn mở hẳn.
      const note = others.length ? ` · giữ ${others.length} khoá khác: ${others.map(item => item.description || `#${item.protectedRangeId}`).join("; ")}` : "";
      report.push(`  “${tab.title}”: ${action}${note}`);
    }
    if (apply && requests.length) for (let k = 0; k < requests.length; k += 500) await batchUpdateSpreadsheet(spreadsheetId, requests.slice(k, k + 500));
  }
  if (!apply) report.push("(Xem trước — chưa ghi. Thêm --apply để ghi.)");
  return report;
}
