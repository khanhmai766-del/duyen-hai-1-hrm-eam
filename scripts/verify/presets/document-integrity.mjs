import assert from "node:assert/strict";
import * as XLSX from "xlsx";

const envelope = data => ({ data, meta: null, error: null });
const contexts = new WeakMap();
const user = { id: "ui-admin", name: "Kiểm tra giả lập", role: "ADMIN", accessMode: "NORMAL", position: "Trực chính lò" };
const base = { decisionNumber: "QD-001", issueDate: "2026-11-01T00:00:00Z", documentUrl: "https://drive.google.com/drive/folders/testfolder12345",
  managingPosition: '["Trực chính lò"]', managementBlock: "Chung", procedureType: "QTNV", reason: "Nguyên nhân giả lập", progress: "Tiến trình giả lập",
  timelineJson: null, note: null, attachmentUrls: [], createdBy: user, updatedBy: user, createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z",
  driveFolderId: "testfolder12345", driveFileId: "testfile1234567", driveFileName: "Quy trình.pdf", driveMimeType: "application/pdf",
  driveSyncStatus: "SYNCED", aiIndexedAt: "2026-11-01T00:00:00Z", aiIndexError: null, driveCandidateFiles: [] };

export const documentIntegrityPreset = {
  description: "Danh mục quy trình/P&ID và form lưu trữ; nhập Excel theo batch và lưu form đều giả lập.",
  async prepare() { return {}; },
  routes: () => [
    ...["list", "edit", "save", "import"].map(mode => `/documents/procedures?verify=${mode}`),
    "/documents/pid?verify=edit", "/documents/pid?verify=save",
    "/documents/archive?tab=GRID_SEPARATION&verify=edit", "/documents/archive?tab=BOILER_CALIBRATION&verify=edit",
  ],
  async mock(context) {
    const docs = {
      PROCEDURE: { ...base, id: "procedure", category: "PROCEDURE", title: "Quy trình kiểm tra giả lập" },
      PID: { ...base, id: "pid", category: "PID", title: "Sơ đồ P&ID kiểm tra giả lập", managingPosition: "Trực chính lò" },
      GRID_SEPARATION: { ...base, id: "grid", category: "GRID_SEPARATION", title: "Tách lưới sự cố", decisionNumber: "S1", managingPosition: "2026", managementBlock: "2026-11-01T10:00" },
      BOILER_CALIBRATION: { ...base, id: "boiler", category: "BOILER_CALIBRATION", title: "Hiệu chỉnh Lò", documentUrl: "Nội dung hiệu chỉnh giả lập", managingPosition: "2026", decisionNumber: "S1", managementBlock: "2026-11-01" },
    };
    const state = { puts: 0, imports: 0, gets: 0 }; contexts.set(context, state);
    await context.route("**/api/**", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname === "/api/documents" && request.method() === "PUT") {
        const body = request.postDataJSON(); assert.ok(body.id && body.category && body.title); state.puts++;
        docs[body.category] = { ...docs[body.category], ...body };
        return route.fulfill({ json: envelope(docs[body.category]) });
      }
      if (url.pathname === "/api/documents/import" && request.method() === "POST") {
        const body = request.postDataJSON(); assert.equal(body.documents.length, 2); assert.equal(body.documents[0].category, "PROCEDURE");
        state.imports++; return route.fulfill({ json: envelope({ imported: 1, skipped: 1 }) });
      }
      if (request.method() !== "GET") return route.abort();
      if (url.pathname === "/api/auth/session") return route.fulfill({ json: { user, expires: "2099-01-01" } });
      if (url.pathname === "/api/rbac/me") return route.fulfill({ json: envelope({ permissions: Object.fromEntries([
        "document-procedure", "document-pid", "archive-read", "archive-edit", "archive-create-delete", "archive-grid-separation", "archive-startup-data", "archive-boiler-calibration",
      ].map(id => [id, "full"])) }) });
      if (url.pathname === "/api/documents") { state.gets++; return route.fulfill({ json: envelope(docs[url.searchParams.get("category")] ? [docs[url.searchParams.get("category")]] : []) }); }
      if (url.pathname === "/api/users") return route.fulfill({ json: envelope([user]) });
      return route.continue();
    });
  },
  async interact(page, route) {
    const mode = new URL(route, "http://localhost").searchParams.get("verify"), state = contexts.get(page.context());
    await page.addStyleTag({ content: "[data-ui-overlay]{display:none!important} html[data-mascot-toasts] [data-sonner-toaster]{visibility:visible!important}" });
    await page.getByRole("button", { name: "Sửa tài liệu", exact: true }).first().waitFor();
    if (mode === "list") return;
    if (mode === "import") {
      const sheet = XLSX.utils.aoa_to_sheet([["STT", "Tên quy trình", "Loại QT", "Cương vị", "Số quyết định", "Ngày ban hành", "Link tài liệu"],
        [1, "Nhập giả lập", "QTNV", "Chung", "QD-2", "2026-11-01", "https://example.com/test.pdf"],
        [2, "Nhập giả lập", "QTNV", "Chung", "QD-2", "2026-11-01", "https://example.com/test.pdf"]]);
      const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, "Quy trinh");
      const before = state.imports;
      await page.locator('input[type="file"][accept=".xlsx,.xls"]').setInputFiles({ name: "gia-lap.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) });
      await page.getByText("Đã nhập 1 quy trình, bỏ qua 1 dòng trùng", { exact: true }).filter({ visible: true }).first().waitFor();
      assert.equal(state.imports, before + 1); return;
    }
    await page.getByRole("button", { name: "Sửa tài liệu", exact: true }).first().click();
    const dialog = page.getByRole("dialog"); await dialog.getByRole("button", { name: "Lưu thay đổi", exact: true }).waitFor();
    if (mode !== "save") return;
    const before = state.puts, gets = state.gets;
    await dialog.getByPlaceholder(/^Nhập tên/).fill("Tài liệu giả lập đã cập nhật");
    await dialog.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    assert.equal(state.puts, before + 1); assert.ok(state.gets > gets);
  },
};
