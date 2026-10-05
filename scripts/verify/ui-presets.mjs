// Kịch bản dựng sẵn cho ui-shots.mjs: tuyến cần chụp + dữ liệu GIẢ LẬP qua page.route.
//
// Giả lập ngay trong trình duyệt để chụp được trạng thái hiếm có trên DB dev (lần làm việc đang mở, danh sách
// đông người…) mà KHÔNG ghi gì vào DB. Thêm preset mới: một khoá trong PRESETS với `prepare` (đọc DB, chỉ SELECT),
// `routes` và tuỳ chọn `mock`.

import { buildMilestoneSchedule } from "../../lib/overhaul-milestones.ts";

const minutesAgo = (now, minutes) => new Date(now - minutes * 60_000).toISOString();
const WORKER_NAMES = ["Trần Văn Bình", "Lê Thị Cúc", "Phạm Minh Đức", "Võ Thanh Hải", "Ngô Quốc Khánh", "Đặng Văn Lâm", "Bùi Thị Mai", "Huỳnh Tấn Phát",
  "Lý Gia Huy", "Mai Văn Tâm", "Tô Hoài Nam", "Châu Ngọc Ánh"];

function liveSession(permit, now) {
  // 12 người: 7 đang trong, 3 đã ra, 2 chưa quét — đủ để hiện ô tìm kiếm (>8) và cả ba trạng thái.
  const members = WORKER_NAMES.map((name, i) => ({
    personId: `ui-p${i}`, code: `UI-${100 + i}`, name, company: permit.teamName,
    attendance: i < 7 ? [{ in: minutesAgo(now, 120 - i), out: null }] : i < 10 ? [{ in: minutesAgo(now, 110), out: minutesAgo(now, 30) }] : [],
  }));
  return {
    id: "ui-live-session", permitId: permit.id, commanderId: "ui-commander", commanderCode: "UI-001", commanderName: "Nguyễn Văn A (giả lập)",
    company: permit.teamName, members, workerCount: members.length + 1, openedAt: minutesAgo(now, 135), endedAt: null,
    authorizerName: "Người cho phép (giả lập)", endConfirmedByName: "", endNote: "", progress: null, createdByName: "ui-shots", endedByName: null,
  };
}

function liveBoardRows(permit, now) {
  const base = { id: permit.id, number: permit.number, year: permit.year, kind: permit.kind, unit: permit.unit, content: permit.content,
    location: permit.location, position: permit.position, teamName: permit.teamName, progress: 30 };
  const row = (id, patch, extra) => ({ id, permit: { ...base, ...patch }, commanderId: `${id}-c`, authorizerName: "Người cho phép (giả lập)", ...extra });
  return [
    row("ui-s1", {}, { commanderCode: "UI-001", commanderName: "Nguyễn Văn A (giả lập)", company: permit.teamName, openedAt: minutesAgo(now, 135), workers: 12, inside: 7, waiting: 2 }),
    row("ui-s2", { number: "9998", content: "Thay gioăng mặt bích đường ống hơi trích cao áp số 3, kiểm tra rò rỉ sau lắp đặt (nội dung dài để thử xuống dòng)", location: "Tầng 5 gian máy S2" },
      { commanderCode: "UI-012", commanderName: "Lê Hoàng Phúc", company: "Công ty CP Dịch vụ Kỹ thuật (tên đơn vị rất dài để thử cắt chữ)", openedAt: minutesAgo(now, 47), workers: 14, inside: 12, waiting: 0 }),
    row("ui-s3", { number: "9999", kind: "ELECTRICAL", content: "Vệ sinh tủ điện MCC 6kV", location: "Nhà điều khiển trung tâm" },
      { commanderCode: "UI-7", commanderName: "Phạm Quang", company: "Đơn vị giả lập", openedAt: minutesAgo(now, 12), workers: 3, inside: 0, waiting: 3 }),
  ];
}

/**
 * PCT nhà thầu · Đại tu giả lập: gắn 3 hạng mục thật (đọc DB) + hạn "Kết thúc công việc dự kiến". `overdue` = quá hạn và
 * không có lần đang mở (thấy nút mở bị chặn); ngược lại còn ~30 giờ và có lần đang mở (hộp Kết thúc theo hạng mục).
 */
function overhaulPreset(overdue) {
  return {
    description: overdue ? "PCT đại tu quá hạn — chặn mở lần làm việc, nhãn đỏ" : "PCT đại tu sắp hết hạn — hộp Kết thúc đánh giá từng hạng mục",
    async prepare({ prisma }) {
      const permit = await prisma.workPermit.findFirst({
        where: { teamType: "CONTRACTOR", status: { notIn: ["DRAFT", "CANCELLED"] } },
        orderBy: { updatedAt: "desc" }, select: { id: true },
      });
      if (!permit) throw new Error("DB dev chưa có PCT nhà thầu nào đã cấp — cấp một phiếu nhà thầu trên dev rồi chạy lại.");
      const items = await prisma.workPermitOverhaulItem.findMany({ where: { isActive: true, method: { not: "" } }, take: 3, orderBy: { code: "asc" },
        select: { code: true, device: true, content: true, method: true, source: true, sheet: true } });
      if (!items.length) throw new Error("DB dev chưa có hạng mục đại tu — bấm Đồng bộ hạng mục trước.");
      return { permitId: permit.id, items };
    },
    routes: ({ permitId }) => overdue
      ? [`/work-permits/${permitId}/lam-viec`]
      : [`/work-permits/${permitId}/lam-viec`, `/work-permits/${permitId}/lam-viec?end=1`, `/work-permits/${permitId}/lam-viec?tien-do=1`],
    // Hộp Kết thúc / Cập nhật tiến độ: tick hạng mục đầu + mở "Biện pháp thi công" để chụp thanh %, ô ghi chú (không lưu).
    async interact(page, route) {
      if (route.endsWith("?tien-do=1")) await page.getByRole("button", { name: "Cập nhật tiến độ" }).click();
      else if (!route.endsWith("?end=1")) return;
      const dialog = page.getByRole("dialog");
      await dialog.locator('input[type="checkbox"]').first().check();
      await dialog.getByRole("button", { name: "Biện pháp thi công" }).first().click();
      await page.waitForTimeout(300);
    },
    async mock(context, { permitId, items }) {
      const now = Date.now();
      await context.route(`**/api/work-permits/${permitId}`, async (route) => {
        const response = await route.fetch();
        const json = await response.json();
        if (json.data) {
          Object.assign(json.data, {
            contractorScope: "OVERHAUL", format: "PAPER", overhaulItems: items,
            plannedEndAt: new Date(now + (overdue ? -3 : 30) * 3600_000).toISOString(),
            overhaulPercents: { [`${items[0].source}\u0000${items[0].sheet}\u0000${items[0].code}`]: 30 },
          });
          const ended = json.data.sessions.filter((s) => s.endedAt);
          json.data.status = overdue ? "WAITING" : "ACTIVE";
          json.data.sessions = overdue ? ended : [liveSession(json.data, now), ...ended];
          if (!overdue) json.data._count.sessions += 1;
          json.meta = { ...json.meta, canExecute: true };
        }
        await route.fulfill({ response, json });
      });
    },
  };
}

/** Tiến độ trong ngày: 3 PCT đại tu giả lập đang làm việc (hạng mục thật đọc DB); thẻ đầu bung sẵn + tick 1 mục. */
const overhaulTodayPreset = {
  description: "Tiến độ trong ngày — nhiều PCT đại tu đang làm việc",
  async prepare({ prisma }) {
    const items = await prisma.workPermitOverhaulItem.findMany({ where: { isActive: true, method: { not: "" } }, take: 7, orderBy: { code: "asc" },
      select: { code: true, device: true, content: true, method: true, source: true, sheet: true } });
    if (items.length < 7) throw new Error("DB dev chưa đủ hạng mục đại tu — bấm Đồng bộ hạng mục trước.");
    return { items };
  },
  routes: () => ["/work-permits/tien-do-ngay"],
  async mock(context, { items }) {
    const now = Date.now();
    const permit = (i, number, content, list, extra = {}) => ({
      id: `ui-s${i}`, commanderName: ["Nguyễn Văn A", "Lê Hoàng Phúc", "Trần Minh Tâm"][i], commanderCode: `UI-${i}`, openedAt: new Date(now - (90 + i * 40) * 60_000).toISOString(), itemProgress: null,
      permit: { id: `ui-p${i}`, number, year: 2026, kind: i === 2 ? "ELECTRICAL" : "MECHANICAL", unit: "S2", content, location: "", position: ["Lò phó", "Máy phó", "Trực chính điện"][i], teamName: ["IDC", "NPS", "EPS"][i], version: 3, plannedEndAt: new Date(now + (i === 1 ? 30 : 120) * 3600_000).toISOString(), overhaulItems: list },
      percents: extra,
    });
    const key = (it) => `${it.source}\u0000${it.sheet}\u0000${it.code}`;
    const rows = [
      permit(0, "3981", "Đại tu bao hơi theo hạng mục " + items.slice(0, 3).map(x => x.code).join(", "), items.slice(0, 3), { [key(items[0])]: 30 }),
      permit(1, "3982", "Đại tu bơm chân không theo hạng mục " + items.slice(3, 5).map(x => x.code).join(", "), items.slice(3, 5)),
      permit(2, "1204", "Thí nghiệm hệ thống kích từ theo hạng mục " + items.slice(5, 7).map(x => x.code).join(", "), items.slice(5, 7)),
    ];
    await context.route("**/api/work-permits/overhaul-today", (route) => route.fulfill({ json: { data: rows, meta: { canExecute: true }, error: null } }));
  },
  async interact(page) {
    await page.getByRole("button", { name: /PCT 3981/ }).click();
    await page.locator('input[type="checkbox"]').first().check();
    await page.waitForTimeout(300);
  },
};

function milestonePreset(day) {
  return {
    description: `Mốc SCL S2 ngày ${day} — chỉ giả lập thời gian, không ghi DB`,
    async prepare({ prisma }) {
      const rows = await prisma.overhaulMilestone.findMany({ where: { campaign: "S2-2026", deletedAt: null }, orderBy: [{ startDate: "asc" }, { sortOrder: "asc" }] });
      if (!rows.length) throw new Error("Chưa có lịch SCL S2 trên DB local");
      const items = rows.map((row) => ({ ...row, startDate: row.startDate.toISOString().slice(0, 10), endDate: row.endDate?.toISOString().slice(0, 10) ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }));
      const schedule = buildMilestoneSchedule(items, new Date(`${day}T08:00:00+07:00`));
      return { schedule, focusedId: schedule.todayEvents[0]?.milestoneId ?? items[0].id };
    },
    routes: ({ focusedId }) => ["/", `/?overhaulMilestone=${encodeURIComponent(focusedId)}`, "/?milestoneUi=edit", "/?milestoneUi=bell", "/?milestoneUi=preview", "/?milestoneUi=diagram"],
    async mock(context, { schedule }) {
      await context.route("**/api/overhaul-milestones", (route) => route.fulfill({ json: { data: schedule, meta: null, error: null } }));
    },
    async interact(page, route) {
      if (route.endsWith("milestoneUi=edit")) {
        await page.getByRole("button", { name: "Xem toàn bộ lịch" }).click();
        await page.getByRole("button", { name: "Sửa mốc", exact: false }).first().click();
      } else if (route.endsWith("milestoneUi=bell")) {
        await page.getByRole("button", { name: "Thông báo", exact: true }).click();
      } else if (route.endsWith("milestoneUi=preview")) {
        await page.getByRole("button", { name: "Xem sơ đồ", exact: true }).click();
        await page.waitForTimeout(350);
      } else if (route.endsWith("milestoneUi=diagram")) {
        await page.getByRole("button", { name: "Xem sơ đồ", exact: true }).click();
        await page.waitForTimeout(350); // Đợi hiệu ứng mở và căn trục ngày xong trước khi đo.
      }
    },
  };
}

export const PRESETS = {
  "pct-doi-chieu-so": {
    description: "Số NKVH nhảy cóc và hộp xác nhận nâng dãy/bỏ số — chỉ giả lập",
    async prepare() { return {}; },
    routes: () => ["MECHANICAL", "ELECTRICAL"].flatMap(kind => ["list", "confirm", "ignore"].map(step => `/work-permits?kind=${kind}&reviewStep=${step}`)),
    async mock(context) {
      await context.route("**/api/overhaul-milestones**", route => route.fulfill({ json: { data: [], meta: null, error: null } }));
      await context.route("**/api/work-permits**", async route => {
        const req = route.request(), path = new URL(req.url()).pathname;
        if (req.method() !== "GET") throw new Error("Không ghi dữ liệu khi chụp đối chiếu số");
        let data = [], meta = null;
        if (path === "/api/work-permits") meta = { total: 0, page: 1, pageSize: 25, counts: {}, overhaulCount: 0, canIssue: true, canIssueNew: true, canExecute: true, positionScope: { all: true, codes: [] } };
        else if (path.endsWith("live-sessions")) meta = { canExecute: true };
        else if (path.endsWith("number-review")) {
          const real = await route.fetch();
          if (real.status() !== 200) throw new Error(`API đối chiếu số dev lỗi ${real.status()}`);
          data = { highest: "4516", suggested: "4517", total: 2, entries: [
          { id: "mock-4836", number: "4836", status: "OBSERVED", permitId: null, nkvhPctId: null, updatedAt: "2026-10-05T09:00:50.154Z", ownerName: "Người cấp" },
          { id: "mock-4800", number: "4800", status: "OBSERVED", permitId: "mock-saved", nkvhPctId: "11111111-2222-3333-4444-555555555555", updatedAt: "2026-10-05T09:00:50.154Z", ownerName: "Người cấp" },
        ] }; }
        await route.fulfill({ json: { data, meta, error: null } });
      });
    },
    async interact(page, route) {
      await page.getByRole("button", { name: "Xem 2 số", exact: true }).click();
      if (route.endsWith("reviewStep=list")) return;
      await page.getByRole("button", { name: route.endsWith("reviewStep=confirm") ? "Xác nhận nâng dãy" : "Bỏ ghi nhận sai", exact: true }).first().click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("textbox").fill("Đã đối chiếu số phiếu và nội dung trên NKVH");
      await dialog.getByRole("checkbox").check();
    },
  },
  "pct-sctx-cap-nhanh": {
    description: "Cấp nhanh PCT nhà thầu SCTX Cơ/Điện, nhà thầu và CHTT tùy chọn — chỉ giả lập",
    async prepare() { return {}; },
    routes: () => ["MECHANICAL", "ELECTRICAL"].flatMap(kind => ["info", "people"].map(step => `/work-permits?kind=${kind}&uiStep=${step}`)),
    async mock(context) {
      const reservations = [];
      await context.route("**/api/overhaul-milestones**", route => route.fulfill({ json: { data: [], meta: null, error: null } }));
      await context.route("**/api/work-permits**", async route => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        let data = [], meta = null;
        if (path === "/api/work-permits") {
          if (request.method() === "POST") throw new Error("Kịch bản chụp không cấp phiếu");
          meta = { total: 0, page: 1, pageSize: 25, counts: {}, overhaulCount: 0, canIssue: true, canIssueNew: true, canExecute: true, positionScope: { all: true, codes: [] } };
        } else if (path.endsWith("number-suggestion")) data = { configured: true, baseline: "4450", highest: "4454", suggested: "4455" };
        else if (path.endsWith("number-reservations")) {
          if (request.method() === "POST") {
            const body = request.postDataJSON();
            data = { id: `ui-sctx-${reservations.length}`, ...body, number: "4455", status: "RESERVED", ownerName: "Người cấp (giả lập)", createdAt: new Date().toISOString() };
            reservations.push(data);
          } else data = reservations;
        } else if (path.endsWith("name-suggestions")) data = { commanders: [], leaders: [] };
        else if (path.endsWith("live-sessions")) meta = { canExecute: true };
        await route.fulfill({ json: { data, meta, error: null } });
      });
    },
    async interact(page, route) {
      if (page.viewportSize().width < 768) {
        await page.getByRole("button", { name: "Cấp phiếu", exact: true }).click();
        await page.getByRole("menuitem").filter({ hasText: "Cấp phiếu nhà thầu" }).click();
      } else await page.getByRole("button", { name: "Nhà thầu", exact: true }).click();
      await page.getByRole("dialog").getByRole("button").filter({ hasText: "Sửa chữa thường xuyên" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.locator("#permit-step-info").getByRole("button", { name: "Lấy số PCT", exact: true }).click();
      await dialog.getByText(/Đã giữ số 4455/).first().waitFor();
      await dialog.getByLabel("Nội dung công việc", { exact: false }).fill("Kiểm tra xử lý các vòi phun nước chữa cháy làm mát bồn lưu trữ NH3 bị nghẹt");
      if (route.includes("uiStep=info")) return;
      await dialog.getByRole("button", { name: "Tiếp tục", exact: true }).click();
      await dialog.getByRole("heading", { name: "Mẫu giấy và an toàn" }).waitFor();
      await dialog.getByRole("button", { name: "Tiếp tục", exact: true }).click();
      await dialog.getByRole("heading", { name: "Nhân sự và đơn vị công tác" }).waitFor();
      const commander = dialog.getByLabel("Chỉ huy trực tiếp", { exact: true });
      if (await commander.getAttribute("required") !== null) throw new Error("CHTT SCTX còn bắt buộc");
      await dialog.getByRole("button", { name: "Tiếp tục", exact: true }).click();
      await dialog.getByRole("heading", { name: "Xác nhận cấp phiếu" }).waitFor();
      await dialog.getByRole("button", { name: "Quay lại", exact: true }).click();
      await commander.fill("Nguyễn Văn Bình");
    },
  },
  "pct-cap-so": {
    description: "Biểu mẫu cấp giấy: số tiếp theo và nhập số cũ chưa dùng — chỉ giả lập",
    async prepare() { return {}; },
    routes: () => ["/work-permits"],
    async mock(context) {
      await context.route("**/api/overhaul-milestones**", route => route.fulfill({ json: { data: [], meta: null, error: null } }));
      await context.route("**/api/work-permits**", async route => {
        const path = new URL(route.request().url()).pathname;
        let data = [], meta = null;
        if (path === "/api/work-permits") meta = { total: 0, page: 1, pageSize: 30, counts: {}, overhaulCount: 0, canIssue: true, canIssueNew: true, canExecute: true, positionScope: { all: true, codes: [] } };
        else if (path.endsWith("number-suggestion")) data = { configured: true, baseline: "4450", highest: "4454", suggested: "4455" };
        else if (path.endsWith("name-suggestions")) data = { commanders: [], leaders: [] };
        else if (path.endsWith("live-sessions")) meta = { canExecute: true };
        await route.fulfill({ json: { data, meta, error: null } });
      });
    },
    async interact(page) {
      if (page.viewportSize().width < 768) {
        await page.getByRole("button", { name: "Cấp phiếu", exact: true }).click();
        await page.getByRole("menuitem").filter({ hasText: "Cấp phiếu nội bộ" }).click();
      } else await page.getByRole("button", { name: "Nội bộ", exact: true }).click();
      await page.getByRole("dialog").getByRole("button").filter({ hasText: "PCT giấy" }).click();
      await page.getByLabel("Số thứ tự PCT").fill("4451");
    },
  },

  "scl-s2-so-do": { ...milestonePreset("2026-11-22"), routes: () => ["/", "/?milestoneUi=diagram"] },
  "scl-s2": milestonePreset("2026-11-22"),
  "scl-s2-ngay-dau": milestonePreset("2026-10-07"),
  "scl-s2-ngay-cuoi": milestonePreset("2026-12-04"),
  "scl-s2-het-lich": milestonePreset("2026-12-05"),
  "pct-tien-do-ngay": overhaulTodayPreset,
  "pct-dai-tu": overhaulPreset(false),
  "pct-dai-tu-qua-han": overhaulPreset(true),
  "pct-lam-viec": {
    description: "Màn hình làm việc PCT nhà thầu, bảng Đang làm việc, popup phiếu, hộp kết thúc — lần làm việc giả lập",
    async prepare({ prisma }) {
      const permit = await prisma.workPermit.findFirst({
        where: { teamType: "CONTRACTOR", status: { notIn: ["DRAFT", "CANCELLED"] } },
        orderBy: { updatedAt: "desc" }, select: { id: true },
      });
      if (!permit) throw new Error("DB dev chưa có PCT nhà thầu nào đã cấp — cấp một phiếu nhà thầu trên dev rồi chạy lại.");
      return { permitId: permit.id };
    },
    routes: ({ permitId }) => [
      "/work-permits?tab=live",
      `/work-permits?permitId=${permitId}`,
      `/work-permits/${permitId}/lam-viec`,
      `/work-permits/${permitId}/lam-viec?end=1`,
    ],
    async mock(context, { permitId, base }) {
      const now = Date.now();
      let permit = null;
      await context.route(`**/api/work-permits/${permitId}`, async (route) => {
        const response = await route.fetch();
        const json = await response.json();
        if (json.data) {
          permit = structuredClone(json.data);
          json.data.status = "ACTIVE";
          json.data.sessions = [liveSession(json.data, now), ...json.data.sessions.filter((s) => s.endedAt)];
          json.data._count.sessions += 1;
          json.meta = { ...json.meta, canExecute: true };
        }
        await route.fulfill({ response, json });
      });
      await context.route("**/api/work-permits/live-sessions", async (route) => {
        if (!permit) permit = (await (await context.request.get(`${base}/api/work-permits/${permitId}`)).json()).data;
        await route.fulfill({ json: { data: liveBoardRows(permit, now), meta: { canExecute: true }, error: null } });
      });
    },
  },
};
