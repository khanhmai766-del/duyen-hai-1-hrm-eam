// So hai lần crawl (mốc TRƯỚC và SAU thay đổi). Bỏ qua thời gian tải và thứ tự API/console.
//   node scripts/verify/compare-crawl.mjs <truoc.json> <sau.json>
// Thoát 0 nếu giống hệt và không trang nào có lỗi JS; thoát 1 nếu có khác biệt hoặc pageError.
import { readFileSync } from "node:fs";

const [beforeFile, afterFile] = process.argv.slice(2);
if (!beforeFile || !afterFile) {
  console.error("Cách dùng: node scripts/verify/compare-crawl.mjs <truoc.json> <sau.json>");
  process.exit(2);
}
const before = JSON.parse(readFileSync(beforeFile, "utf8"));
const after = JSON.parse(readFileSync(afterFile, "utf8"));

const sorted = (x) => (Array.isArray(x) ? [...x].sort() : x);
const normalize = (o) => {
  if (o === undefined) return "(không có)";
  if (typeof o !== "object" || o === null) return JSON.stringify(o);
  return JSON.stringify({ ...o, ms: 0, api: sorted(o.api), console: sorted(o.console), toasts: sorted(o.toasts) });
};

const routes = [...new Set([...Object.keys(before), ...Object.keys(after)])];
let diff = 0;
let withErrors = 0;
for (const route of routes) {
  if (normalize(before[route]) !== normalize(after[route])) {
    diff++;
    console.log(`KHÁC ${route}\n  trước: ${normalize(before[route]).slice(0, 400)}\n  sau:   ${normalize(after[route]).slice(0, 400)}`);
  }
  if (Array.isArray(after[route]?.pageErrors) && after[route].pageErrors.length) {
    withErrors++;
    console.log(`LỖI JS ${route}: ${after[route].pageErrors.join(" | ").slice(0, 300)}`);
  }
}
console.log(`\nSố trang: ${routes.length} | khác mốc: ${diff} | trang có lỗi JS: ${withErrors}`);
console.log(diff === 0 && withErrors === 0 ? "KẾT QUẢ: GIỐNG MỐC" : "KẾT QUẢ: CẦN XEM LẠI (mạng chập chờn cũng gây khác — chạy lại để chắc)");
process.exit(diff === 0 && withErrors === 0 ? 0 : 1);
