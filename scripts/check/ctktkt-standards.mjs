// Kiểm module Chỉ tiêu KTKT không quay lại kiểu cũ (SQL thô, lớp SQL/cổng đã gỡ, CSS ghi đè mới). CHỈ ĐỌC tệp.
//
//   npm run check:ctktkt          (hoặc: node scripts/check/ctktkt-standards.mjs — không cần npm install)
//
// Chạy ở: GitHub Actions (.github/workflows/ctktkt-standards.yml) mỗi lần push, và đầu scripts/deploy-server.sh
// (vi phạm → dừng deploy TRƯỚC khi build, bản đang chạy không bị đụng). Lý do từng luật: docs/ktkt-chuyen-doi.md.
//
// Khi THỰC SỰ cần vượt giới hạn (vd. thêm một chỗ SQL thô mà Prisma không có API): sửa danh sách/hạn mức bên dưới
// trong CÙNG commit, kèm chú thích lý do — để thay đổi hiện rõ khi xem lại commit.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const SCOPE = ["modules/ctktkt", "app/api/ctktkt", "app/(dashboard)/tien-ich/chi-tieu-ktkt", "hooks/useKtktReport.ts"];

// Luật 1 — SQL thô: chỉ các chỗ Prisma không có API (khoá advisory/FOR UPDATE, LOCK TABLE + setval khi khôi phục,
// upsert có điều kiện của bộ đếm lượt đọc ảnh, information_schema). Số = số lần gọi tối đa hiện có.
const RAW_SQL_ALLOWED = {
  "modules/ctktkt/lib/data-backup-store.ts": 5,
  "modules/ctktkt/lib/report-corrections.ts": 4,
  "modules/ctktkt/lib/auth/position-permission-store.ts": 2,
  "modules/ctktkt/lib/coal-photo-store.ts": 2,
};
// Luật 2 — lớp truy cập dữ liệu cũ đã gỡ (giai đoạn 4): không import lại.
const REMOVED_IMPORTS = [
  [/from\s+["']pg["']|require\(\s*["']pg["']\s*\)/, "thư viện `pg` (kết nối Postgres trực tiếp) — dùng `prisma` từ `@/lib/prisma`"],
  [/modules\/ctktkt\/db\/(sql|index)\b|["']\.\.?\/(\.\.\/)*db\/(sql|index)["']/, "lớp SQL cũ `modules/ctktkt/db/sql|index` (đã xoá) — dùng Prisma"],
  [/hooks\/useCtktkt\b|useCtktktRequest/, "hook cũ `useCtktkt`/`useCtktktRequest` (đã xoá) — dùng hook TanStack Query trong `hooks/useKtktReport.ts`"],
  [/daily-input-audit/, "`daily-input-audit` (đã xoá) — nhật ký sửa ô ghi qua Prisma trong store của trang"],
];
// Luật 3 — cổng API gộp cũ: mỗi chức năng một route riêng dùng handle()/ok()/fail() (lib/api.ts).
const REMOVED_PATHS = ["app/api/ctktkt/[[...path]]", "modules/ctktkt/db/sql.ts", "modules/ctktkt/db/index.ts"];
// Luật 4 — CSS: chỉ các tệp giữ có chủ đích, không dài thêm. Giao diện mới viết bằng lớp Tailwind (bẫy: AGENTS.md).
const CSS_ALLOWED = {
  "modules/ctktkt/styles.css": 267, // lớp giao diện chung của module
  "modules/ctktkt/components/daily-production-table.css": 27, // bảng .monthly-grid
  "modules/ctktkt/components/water-report-table.css": 58, // 4 cột dính bảng lượng nước
  "modules/ctktkt/components/coal-meter-photo-import.module.css": 239, // hệ giao diện hộp thoại ảnh công tơ than
  "modules/ctktkt/components/spreadsheet-copy-tools.module.css": 12, // tô ô đang chọn để sao chép
};
// Luật 5 — trang Chỉ tiêu KTKT đã tách: khung chỉ giữ tiêu đề/dải tab/hộp thoại; nội dung nhóm ở ctktkt-report/tab-*.tsx.
const LINE_LIMITS = { "modules/ctktkt/components/ctktkt-report.tsx": 450 };

const rel = p => relative(ROOT, p).split(sep).join("/");
function walk(p, out = []) {
  if (!existsSync(p)) return out;
  if (statSync(p).isFile()) { out.push(p); return out; }
  for (const name of readdirSync(p)) { if (name !== "node_modules" && !name.startsWith(".")) walk(join(p, name), out); }
  return out;
}
const files = SCOPE.flatMap(s => walk(join(ROOT, s))).map(rel);
const problems = [];
const lines = text => text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
// Bỏ chú thích trước khi dò (chú thích được nhắc tên lớp cũ để giải thích). `//` chỉ tính khi đứng đầu dòng/sau khoảng
// trắng — không cắt "http://" trong chuỗi.
const code = text => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

for (const file of files) {
  const text = readFileSync(join(ROOT, file), "utf8");
  if (/\.(ts|tsx|mjs|js)$/.test(file)) {
    const src = code(text);
    const raw = (src.match(/\$(queryRaw|executeRaw)(Unsafe)?\b/g) || []).length;
    const allowed = RAW_SQL_ALLOWED[file] ?? 0;
    if (raw > allowed) problems.push(`${file}: ${raw} chỗ SQL thô ($queryRaw/$executeRaw), cho phép ${allowed}. Viết bằng API Prisma (findMany/upsert/$transaction…); chỉ dùng SQL thô khi Prisma không làm được — khi đó thêm tệp vào RAW_SQL_ALLOWED kèm lý do.`);
    for (const [pattern, what] of REMOVED_IMPORTS) if (pattern.test(src)) problems.push(`${file}: dùng ${what}.`);
  }
  if (file.endsWith(".css")) {
    const limit = CSS_ALLOWED[file];
    if (limit === undefined) problems.push(`${file}: tệp CSS mới trong module KTKT. Viết giao diện bằng lớp Tailwind trên phần tử (xem mục "Chỉ tiêu KTKT" trong AGENTS.md: các bẫy của styles.css).`);
    else if (lines(text) > limit) problems.push(`${file}: ${lines(text)} dòng, giới hạn ${limit}. Không thêm quy tắc CSS mới — viết lớp Tailwind trên phần tử; nếu thật sự phải giữ dạng CSS, nâng giới hạn trong CSS_ALLOWED kèm lý do.`);
  }
  if (LINE_LIMITS[file] && lines(text) > LINE_LIMITS[file]) problems.push(`${file}: ${lines(text)} dòng, giới hạn ${LINE_LIMITS[file]}. Nội dung từng nhóm chỉ tiêu đặt trong modules/ctktkt/components/ctktkt-report/tab-*.tsx, state ở use-ctktkt-report.tsx.`);
}
for (const p of REMOVED_PATHS) if (existsSync(join(ROOT, p))) problems.push(`${p}: đã gỡ ở giai đoạn 4 — mỗi chức năng một route riêng dùng handle()/ok()/fail() của lib/api.ts.`);

if (problems.length) {
  console.error(`✗ Module KTKT có ${problems.length} chỗ quay lại kiểu cũ:\n` + problems.map(p => `  • ${p}`).join("\n"));
  console.error("\nQuy ước: docs/ktkt-chuyen-doi.md · AGENTS.md (mục Chỉ tiêu KTKT).");
  process.exit(1);
}
console.log(`✓ Module KTKT đúng chuẩn (${files.length} tệp: không SQL thô ngoài danh sách, không lớp cũ, CSS không tăng).`);
