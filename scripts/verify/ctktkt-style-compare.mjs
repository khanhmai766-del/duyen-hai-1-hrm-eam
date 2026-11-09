// So hai lần chụp của ctktkt-style-dump.mjs: in phần tử + thuộc tính CSS khác nhau (tối đa N dòng mỗi trang).
//
//   node scripts/verify/ctktkt-style-compare.mjs <a.json> <b.json> [N=8] [--unstable <a2.json>]
// --unstable: lần chụp thứ hai của CÙNG code với a.json — phần tử tự dao động giữa hai lần chụp (nút nổi hiện/ẩn theo thời
// điểm, lề tính theo lúc tải xong, <script>) được bỏ qua và liệt kê riêng, không tính là khác.
import { readFileSync } from "node:fs";

const args = process.argv.slice(2), flag = args.indexOf("--unstable");
// Có thể đưa nhiều lần chụp code cũ, cách nhau bởi dấu phẩy: gộp mọi phần tử từng dao động.
const unstablePaths = flag >= 0 ? args.splice(flag, 2)[1].split(",") : [];
const [aPath, bPath, limitArg] = args;
const limit = Number(limitArg || 8);
const load = p => ({ ...JSON.parse(readFileSync(p, "utf8")), styles: JSON.parse(readFileSync(p.replace(/\.json$/, "") + ".styles.json", "utf8")) });
const a = load(aPath), b = load(bPath);
const unstable = new Set();
for (const unstablePath of unstablePaths) {
  const a2 = JSON.parse(readFileSync(unstablePath, "utf8")).hashed;
  for (const [page, rows] of Object.entries(a.hashed)) {
    const other = new Map((a2[page] || []).map(r => [r[0], r[2]]));
    for (const [path, , h] of rows) if (other.get(path) !== h) unstable.add(`${page}|${path}`);
  }
}
if (unstablePaths.length) console.log(`Bỏ qua ${unstable.size} phần tử tự dao động giữa các lần chụp code cũ.`);
const skip = (page, path) => /(^|>)script:/.test(path) || [...unstable].some(key => { const [p, q] = key.split("|"); return p === page && (path === q || path.startsWith(q + ">")); });
// Ba phần: phần tử | ::before | ::after — đặt tiền tố để không trộn khoá.
const props = s => Object.fromEntries(s.split("|").flatMap((part, i) => part.split(";").map(x => { const j = x.indexOf(":"); return [["", "::before ", "::after "][i] + x.slice(0, j), x.slice(j + 1)]; })));
let pagesDiff = 0;
for (const page of new Set([...Object.keys(a.hashed), ...Object.keys(b.hashed)])) {
  const ra = a.hashed[page] || [], rb = b.hashed[page] || [];
  const mb = new Map(rb.map(r => [r[0], r]));
  const diffs = [];
  const count = rows => rows.filter(r => !skip(page, r[0])).length;
  if (count(ra) !== count(rb)) diffs.push(`số phần tử ${count(ra)} ≠ ${count(rb)}`);
  for (const [path, cls, h] of ra) {
    if (skip(page, path)) continue;
    const other = mb.get(path);
    if (!other) { diffs.push(`thiếu ${path} (${cls})`); continue; }
    if (other[2] === h) continue;
    const pa = props(a.styles[h]), pb = props(b.styles[other[2]]);
    const changed = Object.keys({ ...pa, ...pb }).filter(k => pa[k] !== pb[k]).slice(0, 6).map(k => `${k}: ${pa[k]} → ${pb[k]}`);
    diffs.push(`${path} [${cls.slice(0, 60)}] ${changed.join("; ")}`);
  }
  if (diffs.length) { pagesDiff++; console.log(`✗ ${page}: ${diffs.length} phần tử khác`); for (const d of diffs.slice(0, limit)) console.log("   " + d.slice(0, 300)); }
}
console.log(pagesDiff ? `KẾT QUẢ: ${pagesDiff} trang khác` : "KẾT QUẢ: mọi trang GIỐNG HỆT");
