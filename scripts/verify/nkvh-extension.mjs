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
const official = html("4456/2026/VH1-NĐDH (ĐT)", "Nội dung đã lưu trên NKVH");
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
        callback({ ok: true, data: { id: "permit", status: "ISSUED", number: "4456", year: 2026, formatted: "4456/2026/VH1-NĐDH (ĐT)", pendingReservations: [] } });
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
  assert.equal(payload.formattedNumber, "4456/2026/VH1-NĐDH (ĐT)");
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
  // Số phiếu chỉ xét phần đầu: ghi chú sau số ("(ĐT)", "gấp") vẫn đọc được, số dính thêm chữ/số thì không.
  const readNumber = number => page.evaluate(source => { try { return window.PXVH1_NKVH_READER.read(new DOMParser().parseFromString(source, "text/html"), "MECHANICAL").formattedNumber; } catch { return null; } }, html(number, "Nội dung"));
  assert.equal(await readNumber("4458/2026/VH1-NĐDH gấp"), "4458/2026/VH1-NĐDH gấp");
  assert.equal(await readNumber("4458 / 2026 / VH1-NĐDH(ĐT)"), "4458 / 2026 / VH1-NĐDH(ĐT)");
  assert.equal(await readNumber("4458/2026/VH1-NĐDH2"), null);
  console.log("✓ Đọc được số kèm ghi chú (ĐT, gấp)");
  console.log("✓ Không đồng bộ trước lưu hoặc khi lưu lỗi; nhận đúng dữ liệu đã lưu; giữ yêu cầu mất mạng và gửi lại; đọc phiếu hủy");

  // Tồn đọng: mở trang danh sách là tự đọc phiếu của cả hai sổ; phiếu đọc không được không gửi gì về sổ.
  const id = index => `11111111-2222-3333-4444-${String(index).padStart(12, "0")}`;
  const items = Array.from({ length: 12 }, (_, index) => ({ kind: index % 2 ? "ELECTRICAL" : "MECHANICAL", nkvhPctId: id(index), formatted: `${5000 + index}/2026/VH1-NĐDH` }));
  const list = await browser.newPage();
  const nkvhRequests = [];
  await list.route("**/*", route => {
    const url = new URL(route.request().url());
    nkvhRequests.push({ method: route.request().method(), path: url.pathname, pct: url.searchParams.get("id_pct") });
    const index = items.findIndex(item => item.nkvhPctId === url.searchParams.get("id_pct"));
    if (index === 2) return route.fulfill({ contentType: "text/html", body: "<html><body>Không tìm thấy phiếu</body></html>" });
    route.fulfill({ contentType: "text/html", body: index < 0 ? "<html><body><table><tbody></tbody></table></body></html>" : html(items[index].formatted, `Nội dung phiếu ${index}`) });
  });
  await list.goto("http://nkvh.test/nkvh/pages/pct/pctc");
  await list.evaluate(backlog => {
    window.requests = []; window.backlogCalls = 0;
    window.chrome = { runtime: { sendMessage(message, callback) {
      if (message.method === "GET") { window.backlogCalls++; return callback({ ok: true, data: { total: backlog.length, items: backlog } }); }
      window.requests.push(message.body);
      callback({ ok: true, data: { changed: true, recorded: [], ahead: [] } });
    } } };
  }, items);
  for (const name of ["page-reader.js", "list.js"]) await list.addScriptTag({ content: await readFile(`chrome-extension/nkvh-pct/${name}`, "utf8") });
  await list.waitForFunction(() => /tồn đọng/.test(document.getElementById("pxvh1-nkvh-list-sync")?.textContent || ""));
  const sent = await list.evaluate(() => window.requests.filter(body => body.mode === "sync"));
  assert.equal(sent.length, 9, "10 phiếu mỗi lượt, 1 phiếu đọc không được");
  assert.ok(!sent.some(body => body.nkvhPctId === id(2)), "phiếu đọc không được không gửi về sổ");
  assert.ok(sent.every(body => body.saved === true && body.auto === true));
  assert.equal(sent[0].page.content, "Nội dung phiếu 0");
  assert.equal(await list.evaluate(() => window.requests.filter(body => ["cancel", "stop", "close"].includes(body.mode)).length), 0, "không tự hủy/dừng/đóng số");
  assert.ok(nkvhRequests.every(request => request.method === "GET"), "chỉ đọc từ NKVH, không ghi");
  const detailPaths = nkvhRequests.filter(request => request.pct);
  assert.equal(detailPaths.length, 10);
  assert.equal(detailPaths.find(request => request.pct === id(0)).path, "/nkvh/pages/pct/pctc_ct");
  assert.equal(detailPaths.find(request => request.pct === id(1)).path, "/nkvh/pages/pct/pctd_ct");
  const message = await list.locator("#pxvh1-nkvh-list-sync").textContent();
  assert.match(message, /đã tự đồng bộ 9 phiếu tồn đọng, còn 2 phiếu/);
  assert.match(message, /1 phiếu chưa đồng bộ được/);
  // Thông báo làm đổi DOM và kích quét lại: không được hỏi sổ hay đọc NKVH thêm trước lượt sau.
  await list.waitForTimeout(1500);
  assert.equal(await list.evaluate(() => window.backlogCalls), 1);
  assert.equal(nkvhRequests.filter(request => request.pct).length, 10);
  // Mở lại trang: phiếu đã thử trong giờ này không đọc lại, chỉ xử lý 2 phiếu còn lại.
  nkvhRequests.length = 0;
  await list.goto("http://nkvh.test/nkvh/pages/pct/pctd");
  await list.evaluate(backlog => {
    window.requests = [];
    window.chrome = { runtime: { sendMessage(message, callback) {
      if (message.method === "GET") return callback({ ok: true, data: { total: backlog.length, items: backlog } });
      window.requests.push(message.body);
      callback({ ok: true, data: { changed: true, recorded: [], ahead: [] } });
    } } };
  }, items);
  for (const name of ["page-reader.js", "list.js"]) await list.addScriptTag({ content: await readFile(`chrome-extension/nkvh-pct/${name}`, "utf8") });
  await list.waitForFunction(() => /tồn đọng/.test(document.getElementById("pxvh1-nkvh-list-sync")?.textContent || ""));
  assert.deepEqual(nkvhRequests.filter(request => request.pct).map(request => request.pct), [id(10), id(11)]);
  console.log("✓ Tồn đọng: đọc đúng sổ Cơ/Điện, 10 phiếu mỗi lượt, không ghi NKVH, không tự hủy, không đọc lại phiếu vừa thử");
} finally { await browser.close(); }
