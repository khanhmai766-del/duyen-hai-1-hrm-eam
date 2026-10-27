import assert from "node:assert/strict";

function fixtureSlot() {
  const wallTime = new Date(Date.now() + 7 * 3600_000);
  const hour = wallTime.getUTCHours();
  if (hour < 6) wallTime.setUTCDate(wallTime.getUTCDate() - 1);
  return { date: wallTime.toISOString().slice(0, 10), shiftType: hour < 6 || hour >= 22 ? "NIGHT" : hour < 14 ? "MORNING" : "AFTERNOON" };
}

export const groundingReminderPreset = {
  description: "Nhắc tiếp địa trên mọi trang: một popup/ca, chuông giữ tiến độ, người ngoài ca/đã hoàn thành không nhận — mọi API ghi đều giả lập",
  async prepare() { return {}; },
  routes: () => ["/grounding-lightning?reminderUi=popup", "/grounding-lightning?reminderUi=bell", "/grounding-lightning?reminderUi=off-duty", "/grounding-lightning?reminderUi=complete"],
  async mock(context) {
    const slot = fixtureSlot();
    const end = new Date(Date.now() + 3600_000).toISOString();
    const group = { positionCode: "COAL_MILL", position: "Máy nghiền", machine: "S1", pending: 8, total: 12,
      href: "/grounding-lightning?positionCode=COAL_MILL&machine=S1&shiftType=CURRENT", workingPosition: null };
    const reminder = { ...slot, key: `${slot.date}:${slot.shiftType}`, endsAt: end, pending: 8, groups: [group], shown: false };
    context.groundingReminderClaims = 0;
    context.groundingReminderWrites = 0;
    let shown = false;
    let completed = false;
    const respond = (route, data, meta = null) => route.fulfill({ json: { data, meta, error: null } });
    await context.route("**/api/broadcast", (route) => respond(route, []));
    await context.route("**/api/overhaul-milestones", (route) => respond(route, { todayEvents: [] }));
    await context.route("**/api/grounding-lightning/reminder", async (route) => {
      const referrer = route.request().headers().referer ?? "";
      if (route.request().method() === "POST") {
        context.groundingReminderClaims++;
        assert.equal(route.request().postDataJSON().key, reminder.key);
        if (shown) return respond(route, null);
        shown = true;
        return respond(route, { ...reminder, shown });
      }
      if (/reminderUi=(off-duty|complete)/.test(referrer) || completed) return respond(route, null);
      return respond(route, { ...reminder, shown });
    });
    context.completeGroundingReminder = (value = true) => { completed = value; };
    await context.route(/\/api\/grounding-lightning(?:\?|$)/, async (route) => {
      if (route.request().method() !== "GET") { context.groundingReminderWrites++; return respond(route, null); }
      const query = new URL(route.request().url()).searchParams;
      const row = { id: "ui-reminder-item", ...group, areaEquipment: "Động cơ chính máy nghiền 1A", note: null,
        assignedShift: slot.shiftType, assignedShifts: [slot.shiftType], inspectionDate: slot.date, inspectionShift: slot.shiftType,
        canInspect: true, updatedAt: "2026-10-26T00:00:00Z", needsSignature: true, latestInspection: null,
        points: [{ id: "ui-point", type: "GROUNDING", status: "NORMAL", defectDescription: null, updatedAt: "2026-10-26T00:00:00Z", attachments: [] }] };
      if (query.has("positionCode")) assert.equal(query.get("positionCode"), "COAL_MILL");
      if (query.has("machine")) assert.equal(query.get("machine"), "S1");
      return respond(route, [row], { scope: { all: true, positionCode: null }, canAssignShift: false,
        positions: [{ code: "COAL_MILL", label: "Máy nghiền" }], currentSlot: slot, selectedSlot: slot,
        viewMode: "SHIFT", shifts: [{ shiftType: slot.shiftType, total: 12, confirmed: 4, pending: 8 }], serverTime: new Date().toISOString() });
    });
  },
  async interact(page, route) {
    const context = page.context();
    const title = page.getByRole("heading", { name: "Nhắc kiểm tra tiếp địa & chống sét", exact: true });
    if (route.endsWith("reminderUi=popup")) {
      await title.waitFor();
      assert.equal(context.groundingReminderClaims, 1);
      await page.getByRole("button", { name: "Đã hiểu", exact: true }).click();
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(2000);
      assert.equal(await title.count(), 0, "Tải lại không bật popup lần nữa");
      assert.equal(context.groundingReminderClaims, 1, "Không ghi lại dấu nhắc");
      // Một tài khoản khác/ca mới chưa nhận lời nhắc — chỉ thay response giả để chụp popup.
      await page.route("**/api/grounding-lightning/reminder", async (request) => {
        const slot = fixtureSlot();
        const data = { ...slot, key: "ui-other-slot", endsAt: new Date(Date.now() + 3600_000).toISOString(), pending: 8, shown: request.request().method() === "POST",
          groups: [{ positionCode: "COAL_MILL", position: "Máy nghiền", machine: "S1", pending: 8, total: 12,
            href: "/grounding-lightning?positionCode=COAL_MILL&machine=S1&shiftType=CURRENT", workingPosition: null }] };
        await request.fulfill({ json: { data, meta: null, error: null } });
      });
      await page.reload({ waitUntil: "networkidle" });
      await title.waitFor();
      assert.equal(context.groundingReminderWrites, 0, "Đã hiểu không ghi kết quả kiểm tra");
    } else if (route.endsWith("reminderUi=bell")) {
      assert.equal(await title.count(), 0);
      await page.getByRole("button", { name: "Thông báo", exact: true }).click();
      const link = page.getByRole("link", { name: /Tiếp địa & chống sét: còn 8 vị trí/ });
      await link.waitFor();
      assert.match(await link.getAttribute("href"), /positionCode=COAL_MILL&machine=S1/);
      await link.click();
      await page.waitForURL("**/grounding-lightning?positionCode=COAL_MILL&machine=S1&shiftType=CURRENT");
      const url = new URL(page.url());
      assert.equal(url.searchParams.get("positionCode"), "COAL_MILL");
      assert.equal(url.searchParams.get("machine"), "S1");
      context.completeGroundingReminder();
      await page.reload({ waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Thông báo", exact: true }).click();
      assert.equal(await page.getByRole("link", { name: /Tiếp địa & chống sét: còn/ }).count(), 0, "Hoàn thành thì mục nhắc trong chuông biến mất");
      context.completeGroundingReminder(false);
      await page.goto(new URL(route, page.url()).href, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Thông báo", exact: true }).click();
      await page.getByRole("link", { name: /Tiếp địa & chống sét: còn 8 vị trí/ }).waitFor();
    } else {
      await page.waitForTimeout(2000);
      assert.equal(await title.count(), 0, "Ngoài ca/hoàn thành không nhận popup");
      await page.getByRole("button", { name: "Thông báo", exact: true }).click();
      assert.equal(await page.getByRole("link", { name: /Tiếp địa & chống sét: còn/ }).count(), 0);
      await page.getByRole("button", { name: "Thông báo", exact: true }).click();
    }
  },
};
