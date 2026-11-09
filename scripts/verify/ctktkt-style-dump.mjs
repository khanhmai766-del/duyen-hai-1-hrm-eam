// Chụp kiểu hiển thị thực tế (getComputedStyle) của mọi phần tử trên các trang KTKT — để so trước/sau khi dọn/dời CSS.
//
//   node scripts/verify/ctktkt-style-dump.mjs <tệp-ra.json>        (cần dev :3030 + `npm run verify:ui-session`)
//
// Mỗi trang × khổ (1280, 390): danh sách [đường dẫn DOM, lớp, băm toàn bộ thuộc tính tính toán + ::before/::after].
// Hai lần chạy cùng dữ liệu phải ra tệp giống hệt — khác là CSS đã đổi cách hiển thị.
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { chromium } from "playwright-core";

const out = process.argv[2];
if (!out) throw new Error("thiếu tệp ra");
const base = process.env.CTKTKT_VERIFY_BASE || "http://localhost:3030";
const PAGES = [
  "", "/ctktkt-report", "/chemical-usage", "/water-report", "/pmis-report", "/ppa-heat-rate", "/bcsx-report",
  "/admin/data-backup", "/admin/data-history?date=2026-09-17", "/phan-quyen", "/google-sheets", "/tien-ich-dong-bo",
].map(p => `/tien-ich/chi-tieu-ktkt${p}`);

const browser = await chromium.launch({ channel: "msedge", headless: true });
const result = {};
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ storageState: "reports/verify/mcp-state.json", viewport: { width, height: 900 }, reducedMotion: "reduce" });
    // Cố định giờ để các mốc "hôm nay" giống nhau giữa hai lần chạy.
    await context.addInitScript(() => { const fixed = new Date("2026-11-09T05:00:00Z").getTime(); Date.now = () => fixed; });
    const page = await context.newPage();
    for (const path of PAGES) {
      await page.goto(base + path, { waitUntil: "networkidle" });
      await page.waitForTimeout(2500); // chờ hiệu ứng vẽ biểu đồ (recharts ~1,5 s) xong
      result[`${width} ${path}`] = await page.evaluate(() => {
        const rows = [];
        const pathOf = el => { const parts = []; for (let e = el; e && e !== document.body; e = e.parentElement) { const i = e.parentElement ? [...e.parentElement.children].indexOf(e) : 0; parts.unshift(`${e.tagName.toLowerCase()}:${i}`); } return parts.join(">"); };
        // Thứ tự liệt kê thuộc tính có thể đổi giữa các lần tải → sắp xếp trước khi so.
        const dump = style => { const o = []; for (let i = 0; i < style.length; i++) { const p = style[i]; o.push(p + ":" + style.getPropertyValue(p)); } return o.sort().join(";"); };
        for (const el of document.body.querySelectorAll("*")) {
          if (el.closest("[data-nextjs-toast], nextjs-portal")) continue;
          const s = dump(getComputedStyle(el)) + "|" + dump(getComputedStyle(el, "::before")) + "|" + dump(getComputedStyle(el, "::after"));
          rows.push([pathOf(el), String(el.getAttribute("class") || ""), s]);
        }
        return rows;
      });
    }
    await context.close();
  }
} finally { await browser.close(); }
// Kiểu trùng nhau rất nhiều: lưu một lần trong từ điển `styles` (khoá = băm), các dòng chỉ giữ băm.
const styles = {};
const hashed = Object.fromEntries(Object.entries(result).map(([k, rows]) => [k, rows.map(([p, c, s]) => {
  const h = createHash("sha1").update(s).digest("hex").slice(0, 16);
  styles[h] = s;
  return [p, c, h];
})]));
writeFileSync(out, JSON.stringify({ hashed }));
writeFileSync(out.replace(/\.json$/, "") + ".styles.json", JSON.stringify(styles));
console.log(`Đã ghi ${out}:`, Object.entries(hashed).map(([k, v]) => `${k.replace("/tien-ich/chi-tieu-ktkt", "") || "/"}=${v.length}`).join(" "));
