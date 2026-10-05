// Kiểm tra tiện ích bằng HTML/API giả lập. Không truy cập NKVH thật, không ghi DB.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";
const cell = (label, html) => `<div class="ui-panelgrid-cell">${label}</div><div class="ui-panelgrid-cell">${html}</div>`;
const html = (number, content, notice = "") => `<html><body><form id="formContent">
${notice}<input id="formContent:txtSoPhieu" value="${number}">
${cell("Trạng thái B1:", "Cấp phiếu")}
${cell("Đơn vị QLVH:", '<select><option value="VH" selected>Phân xưởng Vận hành 1</option></select>')}
${cell("Đơn vị công tác:", '<select><option value="PCN" selected>Sửa chữa Cơ nhiệt</option></select>')}
${cell("Nội dung:", `<textarea>${content}</textarea>`)}
${cell("Địa điểm:", "<textarea>Bồn dầu S1</textarea>")}
${cell("Chức danh người cho phép làm việc:", '<select><option selected>Máy phó</option></select>')}
<button id="formContent:save" type="button">Lưu</button></form></body></html>`;
const official = html("4456/2026/NĐDH-VH1", "Nội dung đã lưu trên NKVH");
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.route("**/*", route => route.fulfill({ contentType: "text/html", body: official }));
  await page.goto("http://nkvh.test/nkvh/pages/pct/pctc_ct?id_pct=11111111-2222-3333-4444-555555555555");
  await page.setContent(html("4457/2026/VH1-NĐDH", "Nội dung đang sửa, chưa lưu"));
  await page.evaluate(() => {
    window.requests = []; window.failFirst = true; window.pfComplete = null;
    window.jQuery = () => ({ on(_name, callback) { window.pfComplete = callback; } });
    window.chrome = {
      storage: { local: { get: async () => ({}), set: async () => {} } },
      runtime: { sendMessage(message, callback) {
        if (message.method === "GET") return callback({ ok: true, data: { protocolVersion: 2, permit: null, positions: ["Máy phó"], units: { S1: "Tổ máy S1" } } });
        window.requests.push(message.body);
        if (window.failFirst) { window.failFirst = false; return callback({ ok: false, message: "Mất mạng giả lập" }); }
        callback({ ok: true, data: { id: "permit", status: "ISSUED", number: "4456", year: 2026, formatted: "4456/2026/NĐDH-VH1", pendingReservations: [] } });
      } },
    };
  });
  for (const name of ["page-reader.js", "content.js", "saved-events.js"]) await page.addScriptTag({ content: await readFile(`chrome-extension/nkvh-pct/${name}`, "utf8") });
  assert.equal(await page.evaluate(() => window.requests.length), 0, "mở trang hoặc gõ số không tự ghi cấp phiếu");
  // Lưu bị NKVH từ chối: tuyệt đối không đồng bộ.
  await page.locator('[id="formContent:save"]').click();
  await page.evaluate(() => window.pfComplete({}, { status: 200, responseXML: new DOMParser().parseFromString('<partial-response><changes><extension>{"validationFailed":true}</extension></changes></partial-response>', "text/xml") }, { data: "javax.faces.source=formContent%3Asave" }));
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.requests.length), 0);
  // Lưu thành công: đọc lại từ NKVH, không lấy nội dung đang sửa trên màn hình.
  await page.locator('[id="formContent:save"]').click();
  await page.evaluate(() => window.pfComplete({}, { status: 200, responseXML: new DOMParser().parseFromString('<partial-response><changes><update id="messages"><![CDATA[<div class="ui-messages-info">Lưu phiếu thành công</div>]]></update></changes></partial-response>', "text/xml") }, { data: "javax.faces.source=formContent%3Asave" }));
  await page.waitForFunction(() => window.requests.length === 1);
  const payload = await page.evaluate(() => window.requests[0]);
  assert.equal(payload.formattedNumber, "4456/2026/NĐDH-VH1");
  assert.equal(payload.page.content, "Nội dung đã lưu trên NKVH");
  assert.equal(payload.page.authorizerPosition, "Máy phó");
  assert.equal(payload.saved, true);
  assert.ok(await page.evaluate(() => localStorage.getItem("pxvh1-nkvh-sync:11111111-2222-3333-4444-555555555555")), "mất mạng phải giữ yêu cầu");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForFunction(() => window.requests.length === 2);
  await page.waitForFunction(() => !localStorage.getItem("pxvh1-nkvh-sync:11111111-2222-3333-4444-555555555555"));
  // Đọc phiếu đã hủy và đọc cương vị theo nguồn NKVH.
  const cancelled = await page.evaluate(source => window.PXVH1_NKVH_READER.read(new DOMParser().parseFromString(source, "text/html"), "MECHANICAL"), html("4451/2026/VH1-NĐDH", "Phiếu cũ", '<span style="color:red">Phiếu đã hủy. Lý do: Sai phạm vi.</span>'));
  assert.equal(cancelled.sourceStatus, "CANCELLED"); assert.equal(cancelled.sourceReason, "Sai phạm vi");
  console.log("✓ Không đồng bộ trước lưu hoặc khi lưu lỗi; nhận đúng dữ liệu đã lưu; giữ yêu cầu mất mạng và gửi lại; đọc phiếu hủy");
} finally { await browser.close(); }
