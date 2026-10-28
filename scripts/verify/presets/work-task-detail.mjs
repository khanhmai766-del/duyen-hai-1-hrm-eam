// Quản lý công việc: bấm vào dòng/thẻ mở popup chi tiết (28/10/2026). Danh sách GIẢ LẬP qua page.route
// để có đủ trạng thái (đã báo cáo + link, quá hạn, chưa đặt hạn) — không ghi gì vào DB.
const dayOffset = (days) => {
  const vn = new Date(Date.now() + 7 * 3_600_000 + days * 86_400_000);
  return `${vn.toISOString().slice(0, 10)}T00:00:00.000Z`;
};

function tasks(userId) {
  const base = {
    reportUpdatedById: null, createdById: userId, createdAt: dayOffset(-5), updatedAt: dayOffset(-1),
    createdBy: { id: userId, name: "Lê Văn Quản (giả lập)" }, note: null, links: [], report: null, reportUpdatedAt: null,
  };
  return [
    {
      ...base, id: "ui-wt-1", taskDate: dayOffset(-4), dueDate: dayOffset(3), director: "HUAN",
      content: "Rà soát danh mục bình chữa cháy khu vực lò hơi S1, cập nhật vào sổ PCCC tháng",
      report: "Đã kiểm 42/48 bình tại cos 0 và cos 12.\nCòn 6 bình ở cos 34 chờ giàn giáo, dự kiến xong 30/10.",
      reportUpdatedAt: dayOffset(-1), note: "Ưu tiên khu vực bộ hâm nước.",
      links: [{ url: "https://docs.google.com/spreadsheets/d/ui-demo", kind: "SHEET" }, { url: "https://drive.google.com/drive/folders/ui-demo", kind: "FOLDER" }],
      assignees: [{ id: "ui-a1", name: "Nguyễn Văn Hùng", position: "Trưởng ca" }, { id: "ui-a2", name: "Trần Thị Mai", position: "Trưởng kíp điện" }],
    },
    {
      ...base, id: "ui-wt-2", taskDate: dayOffset(-9), dueDate: dayOffset(-2), director: "CUONG",
      content: "Lập danh sách nhân sự trực Tết, gửi phòng TCNS", assignees: [{ id: "ui-a3", name: "Phạm Minh Đức", position: "Kỹ thuật viên" }],
    },
    {
      ...base, id: "ui-wt-3", taskDate: dayOffset(0), dueDate: null, director: "BGD",
      content: "Chuẩn bị số liệu vận hành quý III cho buổi giao ban", assignees: [{ id: userId, name: "TEST giao diện (tạm)", position: "Trưởng ca" }],
    },
  ];
}

export const workTaskDetailPreset = {
  description: "Quản lý công việc: 3 việc giả lập + bấm dòng đầu mở popup chi tiết — chỉ xem, không lưu",
  async prepare() { return {}; },
  routes: () => ["/work-tasks"],
  async mock(context) {
    await context.route(/\/api\/work-tasks(\?.*)?$/, async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      const me = await route.fetch().then((r) => r.json()).catch(() => null);
      const userId = me?.data?.[0]?.createdById ?? "ui-me";
      await route.fulfill({ json: { data: tasks(userId), meta: { viewAll: true }, error: null } });
    });
  },
  async interact(page) {
    await page.getByRole("button", { name: /^Xem chi tiết: Rà soát/ }).locator("visible=true").first().click({ position: { x: 20, y: 20 } });
    await page.getByRole("dialog").waitFor({ timeout: 30_000 });
  },
};
