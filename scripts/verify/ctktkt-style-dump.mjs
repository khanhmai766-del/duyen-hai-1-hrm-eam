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
].map(p => `/tien-ich/chi-tieu-ktkt${p}`)
  // CTKTKT_STYLE_PAGES=pmis-report,ppa-heat-rate → chỉ chụp các trang này (nhanh khi sửa từng trang). Không cần "/" đầu
  // (Git Bash đổi "/x" thành đường dẫn Windows); "/" hoặc "nhap-lieu" = trang nhập liệu.
  .filter(p => !process.env.CTKTKT_STYLE_PAGES || process.env.CTKTKT_STYLE_PAGES.split(",").some(x => {
    const name = x.trim().replace(/^[A-Za-z]:\/.*?\/Git\//, "").replace(/^\/+/, "");
    return p === `/tien-ich/chi-tieu-ktkt${name === "" || name === "nhap-lieu" ? "" : "/" + name}`;
  }));

// Trạng thái cần chụp thêm cho từng trang: tên → thao tác (chạy sau khi tải lại trang). CTKTKT_STYLE_SCENARIOS=0 → bỏ qua.
const button = (page, name) => page.locator("button", { hasText: name }).first();
// dispatchEvent("click"): nút bị thanh nổi che (Playwright từ chối bấm) — React vẫn nhận sự kiện qua gốc.
// Tệp mẫu cho trang sao lưu: CTKTKT_STYLE_BACKUP_DIR chứa backup-sample.json (tải từ API sao lưu) + backup-bad.json.
// "Kiểm tra tệp" chỉ đọc (không ghi DB); không chụp bước "Xác nhận nạp".
const backupFile = name => `${process.env.CTKTKT_STYLE_BACKUP_DIR}/${name}`;
const chooseBackup = (page, name) => page.locator('input[aria-label="Tệp sao lưu"]').setInputFiles(backupFile(name));
// Hộp thoại "Đọc công tơ từ ảnh" (trang Chỉ tiêu KTKT): chặn API đọc ảnh/kho ảnh ngay trên trình duyệt → không gọi Gemini,
// không ghi DB. Ảnh 1 đọc rõ (S1-A), ảnh 2 "chưa chắc chắn" (S1-B, hiện cảnh báo); `loi` → máy chủ báo lỗi.
async function openCoalDialog(page, ocr = "ok", photos = 0) {
  await page.route("**/api/ctktkt/coal-meter-photos?**", route => route.fulfill({ json: { data: { photos: [] }, meta: null, error: null } }));
  let n = 0;
  await page.route("**/api/ctktkt/coal-meter-ocr", route => {
    if (ocr === "loi") return route.fulfill({ status: 500, json: { data: null, meta: null, error: "Gemini tạm thời không phản hồi." } });
    const high = n++ === 0;
    return route.fulfill({ json: { data: { photo: { id: `p${n}` }, reading: high
      ? { screen_type: "led_total", confidence: "high", total_display: "123456.7", meter_label: "S1-A", photo_timestamp: null, note: "" }
      : { screen_type: "led_total", confidence: "medium", total_display: "98765.4", meter_label: "S1-B", photo_timestamp: null, note: "Ảnh hơi mờ" } }, meta: null, error: null } });
  });
  await button(page, "Công tơ điện/than/dầu").dispatchEvent("click");
  await button(page, "Đọc công tơ từ ảnh").dispatchEvent("click");
  await page.getByRole("dialog").waitFor();
  if (photos) {
    await page.locator('[role="dialog"] input[type="file"]').setInputFiles(["public/brand/duyen-hai-plant.jpg", "public/brand/ba-dong.jpg"].slice(0, photos));
    await page.waitForTimeout(2500); // đọc lần lượt từng ảnh (PARALLEL_READS = 1)
  }
}
const SCENARIOS = {
  "/admin/data-backup": process.env.CTKTKT_STYLE_BACKUP_DIR ? {
    "da-chon-tep": page => chooseBackup(page, "backup-sample.json"),
    "xem-truoc": async page => { await chooseBackup(page, "backup-sample.json"); await page.waitForTimeout(300); await button(page, "Kiểm tra tệp").dispatchEvent("click"); await page.getByText("Xem trước dữ liệu sẽ nạp").waitFor(); },
    "tep-loi": page => chooseBackup(page, "backup-bad.json"),
  } : {},
  "/": {
    "nhieu-ngay": page => button(page, "Nhiều ngày").dispatchEvent("click"),
    "ket-qua-tinh": page => button(page, "Kết quả tính").dispatchEvent("click"),
    "hop-thoai-bieu-do": page => button(page, "Xem chi tiết").dispatchEvent("click"),
  },
  "/ctktkt-report": {
    "tab-cong-to": page => button(page, "Công tơ điện/than/dầu").dispatchEvent("click"),
    "tab-cong-to-s2": async page => { await button(page, "Công tơ điện/than/dầu").dispatchEvent("click"); await button(page, "Tổ máy S2").dispatchEvent("click"); },
    "tab-hoi-nh3": page => button(page, "Tiêu hao hơi và NH3").dispatchEvent("click"),
    "tab-td21-than": page => button(page, "TD21 và tính toán than").dispatchEvent("click"),
    "tab-khoi-dong": page => button(page, "Khởi động/ngừng tổ máy").dispatchEvent("click"),
    "tab-pmis": page => button(page, "Báo cáo từ PMIS").dispatchEvent("click"),
    "tab-tra-cuu": page => button(page, "Tra cứu ô").dispatchEvent("click"),
    "anh-than-trong": page => openCoalDialog(page),
    "anh-than-khoa-tam": async page => { await openCoalDialog(page); await page.locator("summary", { hasText: "Khóa tạm cho lượt nhập này" }).click(); await button(page, "Chọn dùng khóa tạm").dispatchEvent("click"); },
    "anh-than-2-anh": page => openCoalDialog(page, "ok", 2),
    "anh-than-anh-2": async page => { await openCoalDialog(page, "ok", 2); await page.locator('[role="dialog"] button:has(img)').nth(1).dispatchEvent("click"); },
    "anh-than-phong-to": async page => { await openCoalDialog(page, "ok", 1); await button(page, "Phóng to ảnh").dispatchEvent("click"); },
    "anh-than-loi": page => openCoalDialog(page, "loi", 1),
  },
  "/ppa-heat-rate": {
    "mo-google-sheet": page => page.locator("summary", { hasText: "Google Sheet" }).click(),
    "tab-nhap-ngay": page => button(page, "Nhập & đồng bộ dữ liệu ngày").click(),
    "re-chuot-tab": page => button(page, "Nhập nhiều ngày từ Excel").hover(),
    "re-chuot-chon-nhanh": page => button(page, "15 ngày").hover(),
    "re-chuot-xuat-excel": page => button(page, "Xuất Excel").hover(),
  },
};
const browser = await chromium.launch({ channel: "msedge", headless: true });
const result = {};
try {
  // "print": khổ 1280 ở chế độ in (@media print) — các tệp CSS có quy tắc riêng cho bản in.
  // CTKTKT_STYLE_WIDTHS=1280,1024,390,print → thêm khổ trung gian (quy tắc ≥768/≥1200, container query).
  const widths = (process.env.CTKTKT_STYLE_WIDTHS || "1280,390,print").split(",").map(w => w === "print" ? w : Number(w));
  for (const width of widths) {
    const context = await browser.newContext({ storageState: "reports/verify/mcp-state.json", viewport: { width: width === "print" ? 1280 : width, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    // Cố định giờ (cả Date.now lẫn new Date()) để mốc "hôm nay" giống nhau giữa các lần chạy.
    // CTKTKT_STYLE_NOW=2026-09-20 → "hôm nay" rơi vào khoảng có dữ liệu mẫu (bảng PPA… mới có dòng để so).
    await page.clock.setFixedTime(new Date(`${process.env.CTKTKT_STYLE_NOW || "2026-11-09"}T05:00:00Z`));
    if (width === "print") await page.emulateMedia({ media: "print" });
    for (const path of PAGES) {
      await page.goto(base + path, { waitUntil: "networkidle" });
      await page.waitForTimeout(2500); // chờ hiệu ứng vẽ biểu đồ (recharts ~1,5 s) xong
      await snapshot(`${width} ${path}`);
      // Trạng thái sau thao tác (mở menu, đổi tab, rê chuột) — CSS cũ có quy tắc riêng cho các trạng thái này.
      for (const [name, run] of Object.entries(SCENARIOS[path.replace("/tien-ich/chi-tieu-ktkt", "") || "/"] || {})) {
        if (process.env.CTKTKT_STYLE_SCENARIOS === "0" || width === "print") break; // bản in ẩn mọi nút
        // CTKTKT_STYLE_SCENARIOS=anh-than → chỉ chạy kịch bản có tên khớp (biểu thức chính quy).
        if (process.env.CTKTKT_STYLE_SCENARIOS && !new RegExp(process.env.CTKTKT_STYLE_SCENARIOS).test(name)) continue;
        await page.goto(base + path, { waitUntil: "networkidle" });
        await page.waitForTimeout(1500);
        await run(page);
        await page.waitForTimeout(400);
        await snapshot(`${width} ${path} @${name}`);
      }
    }
    async function snapshot(key) {
      result[key] = await page.evaluate(() => {
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
