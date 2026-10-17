import assert from "node:assert/strict";

/** Ảnh, cache và phạm vi tải của PCT: mọi dữ liệu thay đổi đều giả lập trong trình duyệt. */
export function sessionPhotosPreset(basePreset, liveSession) {
  return {
    description: "Nhân viên PCT có ảnh/thiếu ảnh; chỉ tải lần đang xem, mở lại dùng cache, lọc không gọi lại API",
    prepare: ctx => basePreset.prepare(ctx),
    routes: ({ permitId }) => ["/work-permits?tab=live", `/work-permits/${permitId}/lam-viec`],
    async mock(context, ctx) {
      await basePreset.mock(context, ctx);
      const reads = new WeakMap();
      context.__sessionPhotoReads = reads;
      context.on("response", response => {
        if (!response.ok()) return;
        const request = response.request();
        const url = new URL(request.url());
        if (!url.pathname.endsWith("/people-violations") && url.pathname !== "/api/work-permits/people") return;
        const page = request.frame().page();
        const list = reads.get(page) ?? [];
        list.push(url);
        reads.set(page, list);
      });
      const now = Date.now();
      let currentLive;
      let permitVersion = 100;
      await context.route(`**/api/work-permits/${ctx.permitId}`, async route => {
        const response = await route.fetch();
        const json = await response.json();
        const live = currentLive ??= liveSession(json.data, now);
        live.members[0].name = "Nguyễn Thanh Trường Giang";
        const ended = { ...structuredClone(live), id: "ui-previous-session", endedAt: new Date(now - 3600_000).toISOString() };
        ended.members.forEach(member => member.attendance.forEach(visit => { visit.out ??= ended.endedAt; }));
        Object.assign(json.data, { status: "ACTIVE", version: permitVersion, sessions: [live, ended], _count: { ...json.data._count, sessions: 2 } });
        json.meta = { ...json.meta, canExecute: true };
        await route.fulfill({ response, json });
      });
      await context.route(`**/api/work-permits/${ctx.permitId}/sessions/attendance`, async route => {
        assert.equal(route.request().method(), "POST");
        const body = route.request().postDataJSON();
        assert.equal(body.personId, "ui-p0");
        assert.equal(body.sessionId, "ui-live-session");
        const member = currentLive.members[0];
        const at = new Date().toISOString();
        if (body.direction === "out") member.attendance.at(-1).out = at;
        else member.attendance.push({ in: at, out: null });
        permitVersion++;
        await route.fulfill({ json: { data: { outcome: body.direction === "out" ? "OUT" : "IN", at, inside: body.direction === "out" ? 6 : 7, total: 13 }, meta: null, error: null } });
      });
      const photo = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="72" height="96"><rect width="72" height="96" fill="#dbeafe"/><path d="M5 96V80a31 31 0 0 1 62 0v16" fill="#1e40af"/><ellipse cx="36" cy="36" rx="19" ry="24" fill="#e8b792"/><path d="M17 34V23c0-21 39-21 39 0v11L45 18Z" fill="#273449"/><circle cx="29" cy="36" r="2"/><circle cx="43" cy="36" r="2"/><path d="M30 47q6 5 12 0" fill="none" stroke="#985f49" stroke-width="2"/></svg>');
      await context.route(`**/api/work-permits/${ctx.permitId}/people-violations**`, route => route.fulfill({ json: {
        data: Array.from({ length: 12 }, (_, index) => ({ id: `ui-p${index}`, violations: [], photoUrl: index === 1 ? null : photo })), meta: null, error: null,
      } }));
    },
    async interact(page, route) {
      const reads = page.context().__sessionPhotoReads;
      if (route === "/work-permits?tab=live") {
        assert.equal(reads.get(page)?.length ?? 0, 0, "Bảng PCT chưa mở không được tải ảnh/nhân sự");
        return;
      }
      const firstImage = page.getByRole("img", { name: "Ảnh Nguyễn Thanh Trường Giang", exact: true });
      await firstImage.waitFor();
      assert.ok(await firstImage.evaluate(image => image.complete && image.naturalWidth > 0));
      const initial = reads.get(page) ?? [];
      assert.equal(initial.length, 1, `Chỉ một API chung cho ảnh + cảnh báo của lần đang mở: ${initial.map(url => url.pathname + url.search).join(", ")}`);
      assert.equal(initial[0].searchParams.get("sessionId"), "ui-live-session");
      const filters = page.getByRole("group", { name: "Lọc theo trạng thái vào/ra" }).getByRole("button");
      await filters.nth(1).click();
      await filters.nth(1).click();
      assert.equal(reads.get(page).length, 1, "Lọc nhân viên không gọi lại API");
      const firstRow = firstImage.locator("../..");
      await firstRow.getByRole("button", { name: "Ra", exact: true }).click();
      await firstRow.getByRole("button", { name: "Vào lại", exact: true }).waitFor();
      assert.equal(reads.get(page).length, 1, "Quét RA giữ cache ảnh và cảnh báo");
      await firstRow.getByRole("button", { name: "Vào lại", exact: true }).click();
      await firstRow.getByRole("button", { name: "Ra", exact: true }).waitFor();
      assert.equal(reads.get(page).length, 1, "VÀO lại không tải lại ảnh và cảnh báo");
      const history = page.locator("details").filter({ has: page.locator("summary", { hasText: "Xem lịch sử làm việc" }) }).first();
      await history.locator(":scope > summary").click();
      assert.equal(reads.get(page).length, 1, "Bung khung lịch sử chưa tải nhân sự của lần chưa mở");
      const previous = history.locator("details").first();
      await previous.locator(":scope > summary").click();
      await previous.getByRole("img").first().waitFor();
      assert.equal(reads.get(page).length, 2);
      assert.equal(reads.get(page)[1].searchParams.get("sessionId"), "ui-previous-session");
      await previous.locator(":scope > summary").click();
      await previous.locator(":scope > summary").click();
      await previous.getByRole("img").first().waitFor();
      assert.equal(reads.get(page).length, 2, "Mở lại dùng cache chung của đúng lần làm việc");
      await history.locator(":scope > summary").click();
      await firstImage.scrollIntoViewIfNeeded();
    },
  };
}
