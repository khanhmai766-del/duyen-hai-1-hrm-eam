import assert from "node:assert/strict";
import test from "node:test";
import { buildOverhaulGrid, overhaulJournalText, overhaulKpis, overhaulNotStartedFill, parseSheetPercent, type OverhaulProgressRow } from "../lib/overhaul-progress-grid";

const at = (day: string, hour: number) => new Date(`${day}T${String(hour).padStart(2, "0")}:00:00+07:00`);
const item = (code: string) => ({ code, device: "Bơm", content: `Hạng mục ${code}`, contractor: "IDC", positionTitle: "" });
const row = (patch: Partial<OverhaulProgressRow> & Pick<OverhaulProgressRow, "permitId" | "day" | "status">, hour: number): OverhaulProgressRow =>
  ({ code: "1.1", kind: "SESSION_END", percent: null, note: "", createdAt: at(patch.day, hour), ...patch });
const numbers = new Map([["co", "4150/2026"], ["dien", "4210/2026"]]);

test("Hạng mục chưa có PCT → Chưa thực hiện, không có ô ngày", () => {
  const [grid] = buildOverhaulGrid([item("1.1")], [], numbers);
  assert.equal(grid.status, "Chưa thực hiện");
  assert.equal(grid.percent, null);
  assert.equal(grid.hasPermit, false);
  assert.deepEqual(grid.days, {});
});

test("2 PCT cùng ngày: PCT không mở ngày không đè PCT có làm; nhật ký 2 đoạn; % lấy số cao nhất", () => {
  const [grid] = buildOverhaulGrid([item("1.1")], [
    row({ permitId: "co", day: "2026-10-06", status: "Đang thực hiện", percent: 60, note: "10:00 · A: tháo bơm (60%)" }, 10),
    row({ permitId: "dien", day: "2026-10-06", status: "Đang thực hiện", percent: 40, note: "14:00 · B: tách động cơ (40%)", kind: "PROGRESS" }, 14),
    row({ permitId: "dien", day: "2026-10-06", status: "Không mở ngày thực hiện", kind: "NO_SESSION" }, 16),
  ], numbers);
  assert.equal(grid.days["2026-10-06"].status, "Đang thực hiện");
  assert.equal(grid.days["2026-10-06"].journal, "PCT 4150/2026\n10:00 · A: tháo bơm (60%)\n\nPCT 4210/2026\n14:00 · B: tách động cơ (40%)");
  assert.equal(grid.percent, 60);
  assert.equal(grid.status, "Đang thực hiện");
  assert.equal(grid.hasPermit, true);
});

test("Trạng thái hiện tại theo ngày mới nhất; job chạy bù ngày cũ không đè", () => {
  const [grid] = buildOverhaulGrid([item("1.1")], [
    row({ permitId: "co", day: "2026-10-07", status: "Không thực hiện" }, 9),
    row({ permitId: "co", day: "2026-10-06", status: "Đang thực hiện", percent: 30, note: "x" }, 20),
  ], numbers);
  assert.equal(grid.status, "Không thực hiện");
  assert.equal(grid.days["2026-10-06"].status, "Đang thực hiện");
  assert.equal(grid.days["2026-10-07"].journal, "");
});

test("Kết thúc / huỷ phiếu nối sau nội dung làm việc của chính PCT", () => {
  assert.equal(overhaulJournalText([
    { permitId: "co", kind: "SESSION_END", note: "15:00 · A: xong (60%)", createdAt: at("2026-10-06", 15) },
    { permitId: "co", kind: "CLOSE", note: "16:30 · Kết thúc phiếu", createdAt: at("2026-10-06", 16) },
    { permitId: "dien", kind: "CANCEL", note: "17:00 · PCT hủy do sai đơn vị", createdAt: at("2026-10-06", 17) },
  ], numbers), "PCT 4150/2026\n15:00 · A: xong (60%)\n16:30 · Kết thúc phiếu\n\nPCT 4210/2026\n17:00 · PCT hủy do sai đơn vị");
});

test("Cửa sổ ngày: ô chỉ có ngày đang xem, % và trạng thái hiện tại vẫn tính trên toàn đợt", () => {
  const all = [
    row({ permitId: "co", day: "2026-10-06", status: "Đang thực hiện", percent: 20, note: "a" }, 10),
    row({ permitId: "co", day: "2026-10-20", status: "Đang thực hiện", percent: 70, note: "b" }, 10),
  ];
  const [grid] = buildOverhaulGrid([item("1.1")], all.filter(r => r.day <= "2026-10-12"), numbers, { summaryRows: all });
  assert.deepEqual(Object.keys(grid.days), ["2026-10-06"]);
  assert.equal(grid.percent, 70);
  assert.equal(grid.hasPermit, true);
});

test("Nhật ký dài bị rút gọn kèm cờ more; ngắn thì giữ nguyên", () => {
  const long = "x".repeat(300);
  const [grid] = buildOverhaulGrid([item("1.1"), item("1.2")], [
    row({ permitId: "co", day: "2026-10-06", status: "Đang thực hiện", note: long }, 10),
    row({ code: "1.2", permitId: "co", day: "2026-10-06", status: "Đang thực hiện", note: "ngắn" }, 10),
  ], numbers, { previewLength: 120 }).slice(0, 1);
  assert.equal(grid.days["2026-10-06"].more, true);
  assert.ok(grid.days["2026-10-06"].journal.length <= 121);
  const short = buildOverhaulGrid([item("1.2")], [row({ code: "1.2", permitId: "co", day: "2026-10-06", status: "Đang thực hiện", note: "ngắn" }, 10)], numbers, { previewLength: 120 })[0];
  assert.equal(short.days["2026-10-06"].more, undefined);
});

test("Đọc % trên Sheet: 35%, 35,5%, 0.35, 35, trống", () => {
  assert.equal(parseSheetPercent("35%"), 35);
  assert.equal(parseSheetPercent("35,5%"), 35.5);
  assert.equal(parseSheetPercent("0.35"), 35);
  assert.equal(parseSheetPercent("35"), 35);
  assert.equal(parseSheetPercent("1"), 100);
  assert.equal(parseSheetPercent(""), null);
  assert.equal(parseSheetPercent("abc"), null);
});

test("% web chưa ghi → lấy % trên Sheet; web đã ghi → lấy số web", () => {
  const [onlySheet, both] = buildOverhaulGrid([{ ...item("1.1"), sheetPercent: 40 }, { ...item("1.2"), sheetPercent: 40 }],
    [row({ code: "1.2", permitId: "co", day: "2026-10-06", status: "Đang thực hiện", percent: 55 }, 10)], numbers);
  assert.equal(onlySheet.percent, 40);
  assert.equal(onlySheet.hasPermit, false);
  assert.equal(both.percent, 55);
});

test("4 thẻ KPI cùng công thức hàng tổng hợp Sheet", () => {
  assert.deepEqual(overhaulKpis([{ percent: 100 }, { percent: 50 }, { percent: 0 }, { percent: null }]), { total: 4, done: 1, inProgress: 1, progress: 37.5 });
  assert.deepEqual(overhaulKpis([]), { total: 0, done: 0, inProgress: 0, progress: 0 });
});

test("Dòng không có ghi chú không tạo đoạn nhật ký", () => {
  assert.equal(overhaulJournalText([{ permitId: "co", kind: "NO_SESSION", note: "", createdAt: at("2026-10-06", 16) }], numbers), "");
});

test("Ngày đã qua còn trống → điền Chưa thực hiện; không điền hôm nay, không điền sau Kết thúc công tác", () => {
  const days = ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];
  assert.deepEqual(overhaulNotStartedFill(days, ["", "Đang thực hiện", "", "Kết thúc công tác", "", ""], "2026-10-11"), [0, 2]);
  // Có PCT khác ghi tiếp sau khi kết thúc → các ngày trống sau đó lại được điền.
  assert.deepEqual(overhaulNotStartedFill(days, ["Kết thúc công tác", "", "Đang thực hiện", "", "", ""], "2026-10-11"), [3, 4]);
  // Ô gõ tay giữ nguyên.
  assert.deepEqual(overhaulNotStartedFill(days, ["Không thực hiện", "Không thực hiện", "", "", "", ""], "2026-10-09"), [2]);
});

test("Bảng web: ô ngày đã qua không có kết quả hiện Chưa thực hiện (tự điền), Trạng thái hiện tại không đổi", () => {
  const rows = [row({ permitId: "co", day: "2026-10-07", status: "Không thực hiện" }, 17)];
  const window = ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"];
  const [grid] = buildOverhaulGrid([item("1.1")], rows, numbers, { fill: { days: window, today: "2026-10-09" } });
  assert.deepEqual(grid.days["2026-10-06"], { status: "Chưa thực hiện", journal: "", auto: true });
  assert.equal(grid.days["2026-10-07"].status, "Không thực hiện");
  assert.equal(grid.days["2026-10-08"].auto, true);
  assert.equal(grid.days["2026-10-09"], undefined); // hôm nay chưa qua
  assert.equal(grid.status, "Không thực hiện");
});

test("Bảng web: cửa sổ ngày sau Kết thúc công tác không tự điền", () => {
  const summary = [{ code: "1.1", day: "2026-10-07", status: "Kết thúc công tác", percent: 100, createdAt: at("2026-10-07", 17) }];
  const [grid] = buildOverhaulGrid([item("1.1")], [], numbers, { summaryRows: summary, fill: { days: ["2026-10-13", "2026-10-14"], today: "2026-10-20" } });
  assert.deepEqual(grid.days, {});
});
