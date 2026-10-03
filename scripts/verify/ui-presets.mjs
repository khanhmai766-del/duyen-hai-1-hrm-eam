// Kịch bản dựng sẵn cho ui-shots.mjs: tuyến cần chụp + dữ liệu GIẢ LẬP qua page.route.
//
// Giả lập ngay trong trình duyệt để chụp được trạng thái hiếm có trên DB dev (lần làm việc đang mở, danh sách
// đông người…) mà KHÔNG ghi gì vào DB. Thêm preset mới: một khoá trong PRESETS với `prepare` (đọc DB, chỉ SELECT),
// `routes` và tuỳ chọn `mock`.


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

export const PRESETS = {
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
