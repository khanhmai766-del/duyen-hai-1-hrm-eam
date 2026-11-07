// Không import calculations.ts: tệp đó import không kèm đuôi, Node chạy script không nạp được.
function summarize(shifts) {
  const sum = key => shifts.reduce((total, s) => total + s[key], 0);
  const elec1 = sum("elecGenS1"), elec2 = sum("elecGenS2"), water1 = sum("waterUsedS1"), water2 = sum("waterUsedS2");
  const ratio = (w, e) => (e ? w / e : 0);
  return {
    totalElecGenS1: elec1, totalElecGenS2: elec2, totalElecGenPlant: elec1 + elec2,
    totalWaterUsedS1: water1, totalWaterUsedS2: water2, totalWaterUsedPlant: water1 + water2,
    avgWaterRatioS1: ratio(water1, elec1), avgWaterRatioS2: ratio(water2, elec2), avgWaterRatioPlant: ratio(water1 + water2, elec1 + elec2),
    totalCondenserUsedS1: sum("condenserUsedS1"), totalCondenserUsedS2: sum("condenserUsedS2"),
    totalResinWaterS1: sum("resinWaterS1_24h"), totalResinWaterS2: sum("resinWaterS2_24h"), shiftCount: shifts.length,
  };
}

/**
 * Trang Theo dõi lượng nước với một tháng ca trực giả lập trong trình duyệt (DB dev không có bảng
 * ctktkt_water_*). Không ghi DB. `?verify=scroll` cuộn ngang bảng để soi cột cố định.
 */
const TIMES = ["06h00", "14h00", "22h00"];
const TEAMS = ["A", "B", "C", "D", "E", "F"];
const LEADERS = ["Việt", "Lễ", "Trọng", "Ni", "Châu", "Đàm"];

function buildShifts() {
  const shifts = [];
  let elecS1 = 6_920_576.6, waterS1 = 11_111.47, condS1 = 7_676.02;
  for (let day = 1; day <= 8; day++) {
    TIMES.forEach((shiftTime, slot) => {
      const i = (day - 1) * 3 + slot;
      const gen = i % 7 === 0 ? 0 : 4_480 + (i * 37) % 60;
      const used = 180 + (i * 53) % 260;
      const cond = 110 + (i * 29) % 90;
      elecS1 += gen; waterS1 += used; condS1 += cond;
      shifts.push({
        id: i + 1, logDate: `2026-11-${String(day).padStart(2, "0")}`, shiftTime,
        shiftTeam: TEAMS[i % 6], shiftLeader: LEADERS[(i * 5) % 6],
        elecRecS1: elecS1, elecRecS2: 6_554_821.3, elecGenS1: gen, elecGenS2: 0,
        waterRecS1: waterS1, waterRecS2: 5_861.29, waterUsedS1: used, waterUsedS2: 0,
        waterRatioS1: gen ? used / gen : 0, waterRatioS2: 0,
        condenserRecS1: condS1, condenserRecS2: 321.5, condenserUsedS1: cond, condenserUsedS2: 0,
        resinWaterS1_24h: slot === 2 ? 200 + (i * 11) % 230 : 0, resinWaterS2_24h: 0,
      });
    });
  }
  return shifts;
}

export const ctktktWaterPreset = {
  description: "Theo dõi lượng nước: 24 ca giả lập (8 ngày), có ca hệ số > 0,08; chỉ đọc.",
  async prepare() { return {}; },
  routes: () => ["/tien-ich/chi-tieu-ktkt/water-report", "/tien-ich/chi-tieu-ktkt/water-report?verify=scroll", "/tien-ich/chi-tieu-ktkt/water-report?verify=cards", "/tien-ich/chi-tieu-ktkt/water-report?verify=copy"],
  async mock(context) {
    const shifts = buildShifts();
    const baseline = { ...shifts[0], id: 0, logDate: "2026-10-31", shiftTime: "22h00", shiftTeam: "A", shiftLeader: "Châu", elecRecS1: 6_920_576.6, waterRecS1: 11_111.47, condenserRecS1: 7_676.02, resinWaterS1_24h: 267 };
    await context.route("**/api/ctktkt/water-report?**", route => route.fulfill({ json: { data: { ok: true, shifts, baseline, leaders: LEADERS, summary: summarize(shifts) }, meta: null, error: null } }));
    // Khung Google Sheets: đã kết nối, vừa đồng bộ 30 phút trước (trạng thái bình thường).
    const syncedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await context.route("**/api/ctktkt/google-mirror/status**", route => route.fulfill({ json: { data: { configured: true, entries: [{ fileKey: "water", period: "2026-11", syncedAt }] }, meta: null, error: null } }));
  },
  async interact(page, route) {
    const tableToggle = page.getByRole("button", { name: "Dạng bảng", exact: true });
    if (route.includes("verify=copy")) {
      // Nút sao chép nằm ở hàng tiêu đề, ngoài vùng bảng: bấm phải bật chế độ chọn trên .ctktkt-content.
      if (await tableToggle.isVisible()) await tableToggle.click();
      await page.getByRole("button", { name: "Chọn ô để sao chép Excel" }).click();
      await page.locator('.ctktkt-content[data-copy-mode="true"]').waitFor({ timeout: 5000 });
      await page.locator(".water-table-scroll tbody tr:nth-child(2) td:nth-child(5)").click();
      await page.getByText(/Đã chọn 1 hàng × 1 cột/).waitFor({ timeout: 5000 });
      return;
    }
    if (route.includes("verify=cards")) {
      const card = page.locator("details").first();
      if (!(await card.isVisible())) return; // máy tính không có dạng thẻ
      await card.scrollIntoViewIfNeeded();
      await card.locator("summary").click();
      await page.waitForTimeout(300);
      return;
    }
    // Điện thoại mặc định hiện dạng thẻ: chuyển sang bảng để soi cột cố định.
    if (await tableToggle.isVisible()) await tableToggle.click();
    const scroller = page.locator(".water-table-scroll");
    await scroller.waitFor();
    await scroller.scrollIntoViewIfNeeded();
    if (route.includes("verify=scroll")) await scroller.evaluate(el => { el.scrollLeft = 600; el.scrollTop = 120; });
    await page.waitForTimeout(300);  },
};
