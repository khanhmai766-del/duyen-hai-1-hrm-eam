import assert from "node:assert/strict";

const savedContexts = new WeakSet();

/** PCT như ca 4635/2026: đã cấp, quá hạn, chưa có lần làm việc. Mọi ghi đều giả lập. */
export const closeUnstartedPermitPreset = {
  description: "Kết thúc PCT đã cấp chưa làm việc, kiểm tra nút và lưu giả lập",
  async prepare() { return {}; },
  routes: () => [
    "/work-permits?kind=MECHANICAL&permitId=ui-unstarted",
    "/work-permits?kind=MECHANICAL&permitId=ui-unstarted&verifyClose=1",
  ],
  async mock(context, { permitStatus = "ISSUED" } = {}) {
    await context.route("**/api/overhaul-milestones**", route => route.fulfill({ json: { data: [], meta: null, error: null } }));
    const initial = () => ({
      id: "ui-unstarted", number: "4635", year: 2026, kind: "MECHANICAL", unit: "S2", position: "FGD",
      format: "PAPER", status: permitStatus, teamType: "CONTRACTOR", contractorScope: "SCTX",
      teamName: "Công ty CP Đầu tư Phát triển Công nghiệp Sài Gòn IDC (giả lập)",
      content: "Sửa chữa bơm hấp thụ số 2, van đầu thoát bơm hấp thụ số 2 và bơm nước chèn trục hấp thụ số 2.",
      workDate: "2026-10-09", issuedAt: "2026-10-09T16:19:00+07:00", issuerName: "Người cấp phiếu",
      issuerPosition: "Trưởng ca", issuerUserId: null, commanderName: "", commanderPersonId: null,
      leaderName: "", electricalSafetySupervisorName: "", members: [], workerCount: null,
      managingUnit: "Phân xưởng Vận hành 1", plantName: "Duyên Hải 1", location: "Hệ thống FGD S2",
      registrationNumber: "", printWorkerCount: null, workScope: "", workType: null, sourceClassification: null,
      plannedStartAt: "2026-10-09T07:30:00+07:00", plannedEndAt: new Date(Date.now() - 86400_000).toISOString(),
      authorizedAt: null, authorizerName: "", closedAt: null, result: "", progress: null,
      safetyItems: [], disciplines: [], overhaulItems: [], overhaulNotes: {}, overhaulPercents: {},
      repairRequestNumber: "", defectId: null, nkvhPctId: null, nkvhNumber: null, note: "", statusReason: "",
      version: 1, createdAt: "2026-10-09T16:31:00+07:00", updatedAt: "2026-10-09T16:31:00+07:00",
      createdById: "ui", createdByName: "Người cấp phiếu", sessions: [], history: [],
      _count: { sessions: 0, history: 0 }, similarPermits: [],
    });
    let current = initial();
    const capabilities = { canIssue: true, canIssueNew: true, canExecute: true, canActOnPermit: true,
      canEditPermit: true, canCancelPermit: true, canEditOverhaulItems: true };
    await context.route("**/api/work-permits**", async route => {
      const url = new URL(route.request().url());
      const pathname = url.pathname;
      const reply = (data, meta = null) => route.fulfill({ json: { data, meta, error: null } });
      if (pathname === "/api/work-permits/ui-unstarted/execution") {
        assert.equal(route.request().method(), "POST");
        const body = route.request().postDataJSON();
        assert.equal(body.status, "CLOSED");
        assert.equal(body.version, 1);
        assert.deepEqual(Object.keys(body).sort(), ["closedAt", "status", "version"]);
        assert.ok(Date.parse(body.closedAt) >= Date.parse(current.issuedAt));
        current = { ...current, status: "CLOSED", closedAt: body.closedAt, version: 2 };
        savedContexts.add(context);
        return reply(current);
      }
      assert.equal(route.request().method(), "GET", "Không ghi dữ liệu PCT thật khi kiểm tra giao diện");
      if (pathname === "/api/work-permits/ui-unstarted") return reply(current, capabilities);
      if (pathname === "/api/work-permits") {
        return reply([current], { ...capabilities, total: 1, page: 1, pageSize: 25,
          counts: { [current.status]: 1 }, overhaulCount: 0 });
      }
      if (pathname === "/api/work-permits/number-review") return reply({ total: 0, confirmedTotal: 0, entries: [] });
      return reply([], { total: 0, canExecute: true });
    });
  },
  async interact(page, route) {
    const dialog = page.getByRole("dialog");
    const button = dialog.getByRole("button", { name: "Kết thúc phiếu", exact: true });
    await button.waitFor();
    assert.ok((await button.boundingBox()).height >= (page.viewportSize().width < 640 ? 40 : 32));
    if (!route.includes("verifyClose=1")) return;
    page.once("dialog", async confirm => {
      assert.match(confirm.message(), /Phiếu chưa ghi nhận lần làm việc nào/);
      await confirm.accept();
    });
    await button.click();
    await button.waitFor({ state: "detached" });
    await dialog.getByText("Kết thúc phiếu", { exact: true }).waitFor();
    assert.ok(savedContexts.has(page.context()));
    assert.equal(await button.count(), 0);
    await dialog.getByRole("button", { name: "Sao chép tạo PCT mới", exact: true }).waitFor();
  },
};

/** Sao chép PCT quá hạn đang chờ làm tiếp, không lấy số hoặc lưu phiếu thật. */
export const copyOverduePermitPreset = {
  ...closeUnstartedPermitPreset,
  description: "Sao chép PCT giấy quá hạn đang chờ làm tiếp sang biểu mẫu mới",
  routes: () => ["detail", "editor"].map(step => `/work-permits?permitId=ui-unstarted&verifyCopy=${step}`),
  mock: context => closeUnstartedPermitPreset.mock(context, { permitStatus: "WAITING" }),
  async interact(page, route) {
    const dialog = page.getByRole("dialog");
    const copy = dialog.getByRole("button", { name: "Sao chép tạo PCT mới", exact: true });
    await copy.waitFor();
    assert.ok((await copy.boundingBox()).height >= (page.viewportSize().width < 640 ? 40 : 32));
    if (!route.includes("verifyCopy=editor")) return;
    await copy.click();
    await dialog.getByRole("heading", { name: /Sao chép PCT .* thành phiếu mới/ }).waitFor();
    assert.match(await dialog.getByLabel("Nội dung công việc", { exact: false }).inputValue(), /Sửa chữa bơm hấp thụ số 2/);
    assert.equal(await dialog.locator("input").evaluateAll(inputs => inputs.some(input => input.value === "4635")), false);
    await dialog.getByRole("button", { name: "Lấy số PCT", exact: true }).first().waitFor();
  },
};
