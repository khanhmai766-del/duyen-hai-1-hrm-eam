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
  "tiep-dia-ca-khong-nhiem-vu": {
    description: "Nhóm 2 khu vực: sáng/chiều mỗi ca một khu vực, đêm không có nhiệm vụ, cả ngày 1/2",
    async prepare() { return {}; },
    routes: () => ["/grounding-lightning"],
    async mock(context) {
      await context.route("**/api/overhaul-milestones**", (route) => route.fulfill({ json: { data: [], meta: null, error: null } }));
      await context.route("**/api/grounding-lightning**", (route) => {
        if (route.request().method() !== "GET") throw new Error("Không ghi dữ liệu thật khi kiểm tra ca không có nhiệm vụ");
        return route.fulfill({ json: { data: [], meta: {
          positions: [], scope: { all: true, positionCode: null },
          currentSlot: { date: "2026-10-06", shiftType: "NIGHT" }, selectedSlot: { date: "2026-10-06", shiftType: "NIGHT" },
          serverTime: "2026-10-06T23:00:00+07:00",
          shifts: [{ shiftType: "MORNING", total: 1, confirmed: 1, pending: 0 }, { shiftType: "AFTERNOON", total: 1, confirmed: 0, pending: 1 }, { shiftType: "NIGHT", total: 0, confirmed: 0, pending: 0 }],
        }, error: null } });
      });
    },
    async interact(page) {
      await page.getByText("Cả ngày: đã xác nhận 1/2 khu vực", { exact: true }).waitFor();
      const night = page.getByRole("button", { name: "Ca đêm", exact: true });
      await night.getByText(page.viewportSize().width < 640 ? "Không có nhiệm vụ" : "Không có khu vực cần kiểm tra trong ca này", { exact: true }).waitFor();
    },
  },
  "tiep-dia-ba-ca-du-lieu-local": {
    description: "Đọc API thật trên DB local: phủ hết danh mục qua 3 ca, lọc không đổi tuyến, không ghi kết quả",
    async prepare() { return {}; },
    routes: () => ["/grounding-lightning"],
    async mock(context) {
      await context.route("**/api/overhaul-milestones**", (route) => route.fulfill({ json: { data: [], meta: null, error: null } }));
    },
    async interact(page) {
      const get = async (query = "") => {
        const response = await page.request.get(new URL(`/api/grounding-lightning${query}`, page.url()).href);
        if (!response.ok()) throw new Error(`API trả ${response.status()}`);
        const result = await response.json();
        if (result.error) throw new Error(result.error);
        return result;
      };
      const current = await get();
      const date = current.meta.currentSlot.date;
      const catalog = await get("?catalog=1");
      if (!catalog.data.length) throw new Error("DB local cần có danh mục để kiểm tra phân ca");
      const coverage = new Set();
      for (const shift of ["MORNING", "AFTERNOON", "NIGHT"]) {
        const query = `?inspectionDate=${date}&shiftType=${shift}`;
        const slot = await get(query);
        if (slot.meta.selectedSlot.shiftType !== shift) throw new Error("API trả nhầm ca");
        const summary = slot.meta.shifts.find((row) => row.shiftType === shift);
        if (slot.data.length !== summary.total || summary.confirmed + summary.pending !== summary.total) throw new Error("Tiến độ ca không khớp danh sách");
        for (const row of slot.data) {
          if (!row.assignedShifts.includes(shift)) throw new Error("Khu vực nằm ngoài tuyến ca");
          if (coverage.has(row.id)) throw new Error("Một khu vực bị giao lặp giữa các ca");
          coverage.add(row.id);
        }
        if (slot.data.length) {
          const first = slot.data[0], filtered = await get(`${query}&q=${encodeURIComponent(first.areaEquipment)}`);
          if (!filtered.data.some((row) => row.id === first.id)) throw new Error("Tìm kiếm đã làm thay đổi tuyến được giao");
        }
      }
      if (catalog.data.some((row) => !coverage.has(row.id))) throw new Error("Có khu vực không được giao cho ca nào");
      const overview = await get("?shiftType=ALL");
      if (overview.meta.viewMode !== "ALL" || overview.data.length !== catalog.data.length) throw new Error("Chế độ tổng không phủ hết thiết bị");
      if (overview.data.some((row) => row.canInspect)) throw new Error("Chế độ tổng phải chỉ xem");
      for (const row of overview.data) {
        const original = catalog.data.find((entry) => entry.id === row.id);
        if (JSON.stringify(row.points) !== JSON.stringify(original.points)) throw new Error("Chế độ tổng phải dùng kết quả hiện tại");
      }
      const defects = await get("?shiftType=ALL&status=DEFECT");
      const expected = catalog.data.filter((row) => row.points.some((point) => point.status === "DEFECT"));
      if (defects.data.length !== expected.length || expected.some((row) => !defects.data.some((entry) => entry.id === row.id))) throw new Error("Tổng khiếm khuyết không khớp toàn danh mục");

      await page.getByRole("button", { name: "Ca sáng", exact: true }).click();
      await page.getByRole("button", { name: "Ca hiện tại", exact: true }).click();
      await page.getByRole("button", { name: "Tất cả thiết bị", exact: true }).click();
      await page.getByText("Đang xem toàn bộ thiết bị", { exact: false }).waitFor();
      await page.getByRole("button", { name: /Có khiếm khuyết/ }).click();
    },
  },
  "tiep-dia-chon-nhieu": {
    description: "Kiểm tra theo 3 ca; chọn nhiều vị trí, thử lại sau lỗi và khóa xác nhận ca khác",
    async prepare() { return {}; },
    routes: () => ["/grounding-lightning"],
    async mock(context) {
      const currentSlot = { date: "2026-10-06", shiftType: "AFTERNOON" };
      const now = "2026-10-06T15:00:00+07:00";
      const shifts = ["MORNING", "AFTERNOON", "NIGHT"];
      const signed = [], completed = new Set();
      let failSecond = true;
      context.groundingSigned = signed;
      context.resetGrounding = () => completed.clear();
      const makeItems = (shiftType, date) => ["NORMAL", "NORMAL", "UNCHECKED", "DEFECT"].map((status, i) => {
        const id = shiftType === "AFTERNOON" ? `ui-grounding-${i}` : `ui-${shiftType}-${i}`;
        const confirmed = date === currentSlot.date && (completed.has(id) || (shiftType === "MORNING" && i === 0));
        return {
          id, areaEquipment: ["Tiếp địa khu vực bơm nước làm mát tuần hoàn tổ máy 1", "Hệ thống chống sét nhà điều khiển trung tâm", "Tủ điện phân phối", "Khu vực bồn dầu"][i],
          position: "Trực chính điện", positionCode: "ELECTRICAL_MAIN_OPERATOR", machine: "S1", note: null,
          updatedAt: "2026-10-05T08:00:00+07:00", needsSignature: !confirmed,
          assignedShifts: [shiftType], inspectionDate: date, inspectionShift: shiftType,
          canInspect: date === currentSlot.date && shiftType === currentSlot.shiftType,
          latestInspection: confirmed ? { id: `ui-sign-${id}`, inspectedById: "ui-inspector", inspectorName: "Người kiểm tra (giả lập)", inspectorPosition: "Trực chính điện", signedAt: shiftType === "MORNING" ? "2026-10-06T08:00:00+07:00" : now, inspectorAvatarUrl: null, results: [] } : null,
          points: ["GROUNDING", "LIGHTNING"].map((type) => ({
            id: `ui-point-${id}-${type}`, type, status, updatedAt: "2026-10-05T08:00:00+07:00",
            defectDescription: status === "DEFECT" ? "Mối nối tiếp địa bị lỏng (giả lập)" : null, attachments: [],
          })),
        };
      });
      await context.route("**/api/overhaul-milestones**", (route) => route.fulfill({ json: { data: [], meta: null, error: null } }));
      await context.route("**/api/grounding-lightning**", async (route) => {
        const request = route.request(), url = new URL(request.url());
        if (request.method() === "POST" && url.pathname.endsWith("/sign")) {
          const body = request.postDataJSON();
          if (body?.normalOnly !== true || body.inspectionDate !== currentSlot.date || body.shiftType !== currentSlot.shiftType) throw new Error("Phải gửi đúng ngày + ca và yêu cầu kiểm tra lại kết quả bình thường");
          const id = url.pathname.split("/")[3];
          if (id === "ui-grounding-1" && failSecond) {
            failSecond = false;
            return route.fulfill({ json: { data: null, meta: null, error: "Lỗi xác nhận giả lập" } });
          }
          signed.push(id); completed.add(id);
          return route.fulfill({ json: { data: { id: `ui-sign-${id}`, results: [] }, meta: null, error: null } });
        }
        if (request.method() !== "GET") throw new Error("Không ghi dữ liệu thật khi kiểm tra giao diện");
        const selectedSlot = { date: url.searchParams.get("inspectionDate") || currentSlot.date, shiftType: url.searchParams.get("shiftType") || currentSlot.shiftType };
        const summaries = shifts.map((shiftType) => {
          const rows = makeItems(shiftType, selectedSlot.date), confirmed = rows.filter((row) => !row.needsSignature).length;
          return { shiftType, total: rows.length, confirmed, pending: rows.length - confirmed };
        });
        await route.fulfill({ json: {
          data: makeItems(selectedSlot.shiftType, selectedSlot.date),
          meta: { positions: [{ code: "ELECTRICAL_MAIN_OPERATOR", label: "Trực chính điện" }], scope: { all: true, positionCode: null }, currentSlot, selectedSlot, shifts: summaries, serverTime: now }, error: null,
        } });
      });
    },
    async interact(page) {
      let step = 0;
      const click = async (name) => {
        step += 1;
        try { await page.getByRole("button", { name, exact: true }).click({ timeout: 10000 }); }
        catch (error) { throw new Error(`Bước ${step}, bấm ${name}: ${error.message.replaceAll("\n", " ")}`); }
      };
      await click('Ca sáng');
      await page.getByText("Đang xem ca khác. Chỉ được cập nhật và xác nhận trong ca đang diễn ra.").waitFor();
      if (await page.getByRole("button", { name: "Chỉnh sửa", exact: true }).count()) throw new Error("Không được xác nhận ca đã kết thúc");
      await click('Ca hiện tại');
      await click('Chỉnh sửa');
      await page.getByRole("menuitem").filter({ hasText: "Sửa bảng" }).click();
      const checkboxes = page.getByRole("checkbox").filter({ visible: true });
      if (await checkboxes.count() !== 4) throw new Error("Phải có 4 vị trí trong ca");
      if (await checkboxes.nth(2).isEnabled() || await checkboxes.nth(3).isEnabled()) throw new Error("Không được chọn vị trí chưa kiểm tra hoặc có khiếm khuyết");
      await click('Chọn vị trí bình thường trên trang');
      await click('Xác nhận 2 vị trí bình thường');
      await page.getByText("Đã xác nhận 1/2 vị trí. Lỗi xác nhận giả lập", { exact: true }).first().waitFor();
      if (await checkboxes.nth(0).isChecked() || !await checkboxes.nth(1).isChecked()) throw new Error("Phải bỏ chọn vị trí đã thành công và giữ vị trí bị lỗi");
      await click('Lưu 1 dòng');
      await page.getByRole("button", { name: "Chỉnh sửa", exact: true }).waitFor();
      if (page.context().groundingSigned.join(",") !== "ui-grounding-0,ui-grounding-1") throw new Error("Xác nhận lặp hoặc bỏ sót vị trí");
      await page.getByRole("button", { name: "Ca chiều", exact: true }).locator("b").filter({ hasText: "2/4" }).waitFor();
      await click('Chỉnh sửa');
      await page.getByRole("menuitem").filter({ hasText: "Sửa bảng" }).click();
      if (await checkboxes.nth(0).isEnabled() || await checkboxes.nth(1).isEnabled()) throw new Error("Vị trí đã xác nhận không được chọn xác nhận lặp");
      await click('Huỷ');
      await click('Ca đêm');
      await page.getByText("Đang xem ca khác. Chỉ được cập nhật và xác nhận trong ca đang diễn ra.").waitFor();
      if (await page.getByRole("button", { name: "Chỉnh sửa", exact: true }).count()) throw new Error("Không được xác nhận ca chưa bắt đầu");
      // Dựng lại trạng thái chưa xác nhận để ảnh thể hiện rõ ô chọn; chỉ tác động dữ liệu giả lập.
      page.context().resetGrounding();
      await page.reload({ waitUntil: "networkidle" });
      await click('Chỉnh sửa');
      await page.getByRole("menuitem").filter({ hasText: "Sửa bảng" }).click();
      await click('Chọn vị trí bình thường trên trang');
    },
  },
  "pct-cho-nkvh": {
    description: "Phiếu \"Chờ NKVH lưu\" (mới lấy số / quá 2 giờ kèm lỗi đồng bộ) trên sổ và hộp chi tiết — chỉ giả lập",
    async prepare() { return {}; },
    routes: () => ["/work-permits?kind=MECHANICAL", "/work-permits?kind=MECHANICAL&uiDetail=1"],
    async mock(context) {
      const now = Date.now(), patched = new Map();
      const pending = (row, i) => Object.assign(row, {
        status: "DRAFT", format: "ELECTRONIC", teamType: "INTERNAL", contractorScope: null, plannedEndAt: null, nkvhPctId: `6f92153f-cae7-4cbd-b8ba-3c7bd8c178d${i}`, nkvhNumber: null, createdByName: i ? "Lương Huệ Châu" : "Nguyễn Quang Đàm",
        createdAt: new Date(now - (i ? 20 : 190) * 60_000).toISOString(),
        content: i ? "Thay lọc dầu bôi trơn bơm cấp nước 1A (giả lập)" : "Vệ sinh vòi đốt dầu tổ máy S2 (giả lập)",
        statusReason: i ? "" : "Chưa đồng bộ được lúc 08:27 06/10: Chức danh NKVH “Trực ban” chưa khớp danh mục. Vui lòng xác nhận cương vị.",
      });
      await context.route("**/api/work-permits**", async route => {
        const req = route.request(), path = new URL(req.url()).pathname;
        if (req.method() !== "GET") throw new Error("Không ghi dữ liệu khi chụp phiếu chờ NKVH");
        if (path === "/api/work-permits") {
          const response = await route.fetch(); const json = await response.json();
          (json.data ?? []).slice(0, 2).forEach((row, i) => patched.set(row.id, pending(row, i)));
          return route.fulfill({ response, json });
        }
        const id = path.split("/")[3];
        if (path.split("/").length === 4 && patched.has(id)) {
          // Chi tiết dựng từ dòng sổ (DB dev có thể thiếu bảng phụ khiến API chi tiết lỗi).
          const row = patched.get(id);
          const data = { managingUnit: "", plantName: "", registrationNumber: "", workScope: "", plannedStartAt: null, disciplines: [], safetyItems: [], members: [],
            leaderName: "", issuerPosition: "", electricalSafetySupervisorName: "", issuedAt: null, authorizedAt: null, closedAt: null, result: "", note: "",
            defectId: null, overhaulItems: null, overhaulPercents: {}, overhaulNotes: {}, version: 1, createdById: "", updatedAt: row.createdAt,
            ...row, history: [{ id: "ui-h1", actorName: row.createdByName, action: "Lấy số từ NKVH — chờ NKVH lưu phiếu", createdAt: row.createdAt }],
            sessions: [], _count: { sessions: 0, history: 1 } };
          return route.fulfill({ json: { data, meta: { canIssue: true, canIssueNew: true, canExecute: false, canActOnPermit: true, canEditPermit: true, canDelete: false }, error: null } });
        }
        return route.continue();
      });
      await context.route("**/api/overhaul-milestones**", route => route.fulfill({ json: { data: [], meta: null, error: null } }));
    },
    async interact(page, route) {
      if (!route.endsWith("uiDetail=1")) return;
      await page.getByText("Vệ sinh vòi đốt dầu tổ máy S2 (giả lập)").locator("visible=true").first().click();
      await page.getByRole("dialog").waitFor();
      await page.waitForTimeout(300);
    },
  },
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

  "scl-s2-so-do": { ...milestonePreset("2026-11-21"), routes: () => ["/", "/?milestoneUi=diagram"] },
  "scl-s2": milestonePreset("2026-11-21"),
  "scl-s2-ngay-dau": milestonePreset("2026-10-06"),
  "scl-s2-ngay-cuoi": milestonePreset("2026-12-03"),
  "scl-s2-het-lich": milestonePreset("2026-12-04"),
  "tien-do-dai-tu": {
    description: "Bảng tiến độ đại tu như Sheet — hạng mục thật (SELECT) + kết quả ngày giả lập, đồng hồ 09/10, không ghi DB",
    async prepare({ prisma }) {
      const first = await prisma.workPermitOverhaulItem.findFirst({ where: { isActive: true }, orderBy: [{ source: "asc" }, { sheet: "asc" }], select: { source: true, sheet: true } });
      if (!first) throw new Error("DB dev chưa có hạng mục đại tu — bấm Đồng bộ hạng mục trước.");
      const items = await prisma.workPermitOverhaulItem.findMany({ where: { isActive: true, ...first }, distinct: ["code"], orderBy: [{ sheetRow: "asc" }, { code: "asc" }],
        select: { code: true, device: true, content: true, contractor: true, positionTitle: true } });
      // Kết quả giả lập đã gộp sẵn (quy tắc gộp có test riêng ở tests/overhaul-progress-grid.test.ts): 6 hạng mục đầu có
      // 2 PCT (Cơ 4150 + Điện 4210) cùng ghi ngày 07/10, có ngày không mở, hạng mục đầu kết thúc phiếu 09/10.
      const co = (pct, text) => `PCT 4150/2026\n16:00 · Nguyễn Văn A: ${text} (${pct}%)`;
      const grid = items.map((item, i) => {
        if (i >= 6) return { ...item, percent: null, status: "Chưa thực hiện", hasPermit: false, days: {} };
        const days = {
          "2026-10-06": { status: "Đang thực hiện", journal: co(10 + i * 5, "tháo bao che, kiểm tra hiện trạng") },
          "2026-10-07": { status: "Đang thực hiện", journal: `${i % 2 ? "" : `${co(30 + i * 5, "tháo cánh, vệ sinh")}\n\n`}PCT 4210/2026\n10:30 · Lê Văn B: tách cáp động lực, đo cách điện (${20 + i * 5}%)` },
          "2026-10-08": { status: "Không mở ngày thực hiện", journal: "" },
          ...(i === 0 ? { "2026-10-09": { status: "Kết thúc công tác", journal: "PCT 4150/2026\n09:00 · Kết thúc phiếu" } } : {}),
        };
        return { ...item, percent: i % 2 ? 20 + i * 5 : 30 + i * 5, status: i === 0 ? "Kết thúc công tác" : "Không mở ngày thực hiện", hasPermit: true, days };
      });
      return { grid };
    },
    routes: () => ["/tien-ich/tien-do-dai-tu", "/tien-ich/tien-do-dai-tu?ui=cell"],
    async mock(context, { grid }) {
      await context.clock?.install({ time: new Date("2026-10-09T08:00:00+07:00") }).catch(() => {});
      await context.route(/\/api\/overhaul-progress\?/, (route) => route.fulfill({ json: { data: grid, meta: { syncedAt: "2026-10-05T23:00:00.000Z" }, error: null } }));
    },
    async interact(page, route) {
      if (!route.endsWith("ui=cell")) return;
      await page.locator("tbody button").first().click();
      await page.waitForTimeout(300);
    },
  },
  "don-vi-nha-thau": {
    description: "Danh bạ đơn vị nhà thầu có phân loại SCTX / Đại tu / cả hai / chưa phân loại + hộp sửa đơn vị — danh sách giả lập, không ghi DB",
    async prepare() { return {}; },
    routes: () => ["/work-permits", "/work-permits?ui=edit"],
    async mock(context) {
      const rows = [
        { company: "Công ty CP Vật tư & Thiết bị công nghiệp", code: "VATCO", sctx: true, overhaul: true, total: 42, commanders: 6, active: 40 },
        { company: "Công ty TNHH Kỹ thuật Đại tu Miền Nam", code: "IDC", sctx: false, overhaul: true, total: 18, commanders: 3, active: 18 },
        { company: "Công ty CP Dịch vụ Sửa chữa thường xuyên", code: "SCTXDV", sctx: true, overhaul: false, total: 9, commanders: 2, active: 9 },
        { company: "Cty Miền Bắc", code: "", sctx: false, overhaul: false, total: 3, commanders: 0, active: 3 },
      ];
      await context.route(/\/api\/work-permits\/companies\?summary=1/, (route) => route.fulfill({ json: { data: rows, meta: { canWrite: true }, error: null } }));
    },
    async interact(page, route) {
      const tab = page.getByRole("button", { name: "Nhân sự nhà thầu" }).first();
      if (await tab.isVisible().catch(() => false)) await tab.click();
      else { await page.getByRole("button", { name: /PCT Cơ|Đang làm việc/ }).first().click(); await page.getByText("Nhân sự nhà thầu").last().click(); }
      await page.getByText("Công ty TNHH Kỹ thuật Đại tu Miền Nam").locator("visible=true").first().waitFor({ timeout: 20_000 });
      if (route.endsWith("ui=edit")) { await page.getByRole("button", { name: "Sửa đơn vị Công ty TNHH Kỹ thuật Đại tu Miền Nam" }).locator("visible=true").first().click(); await page.waitForTimeout(300); }
    },
  },
  "tien-do-dai-tu-lon": {
    description: "Bảng tiến độ đại tu tab lớn nhất (Máy phát · Trực phụ điện) bằng API THẬT trên DB dev, đồng hồ 01/12 — kiểm tra tải/cuộn",
    async prepare() { return {}; },
    routes: () => ["/tien-ich/tien-do-dai-tu", "/tien-ich/tien-do-dai-tu?ui=scroll"],
    async mock(context) {
      await context.clock?.install({ time: new Date("2026-12-01T08:00:00+07:00") }).catch(() => {});
      await context.addInitScript(() => { try { localStorage.setItem("overhaul-progress:tab", JSON.stringify({ source: "GENERATOR", sheet: "Trực phụ điện" })); } catch { /* bỏ qua */ } });
    },
    async interact(page, route) {
      await page.locator("tbody[data-index]").first().waitFor({ timeout: 30_000 });
      if (!route.endsWith("ui=scroll")) return;
      // Cuộn dọc giữa bảng: hàng ở giữa phải được vẽ, số tbody vẽ ra phải nhỏ (ảo hoá).
      await page.evaluate(() => { const box = document.querySelector("tbody[data-index]")?.closest("div.overflow-auto"); if (box) box.scrollTop = box.scrollHeight / 2; });
      await page.waitForTimeout(400);
      const drawn = await page.locator("tbody[data-index]").count();
      if (drawn > 60) throw new Error(`Ảo hoá không chạy: vẽ ${drawn} hạng mục`);
    },
  },
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
