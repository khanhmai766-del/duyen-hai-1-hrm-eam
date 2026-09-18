import assert from "node:assert/strict";
import test from "node:test";
import { parseDocumentDriveSyncRecord } from "../../lib/document-drive-sync";

test("bản ghi SYNCED bắt buộc có fileId và tự dựng link xem an toàn", () => {
  const record = parseDocumentDriveSyncRecord({
    documentId: "doc-1",
    driveFolderId: "1AbCdEfGhIjKlMnOpQrStUvWxYz",
    driveFileId: "1ZyXwVuTsRqPoNmLkJiHgFeDcBa",
    driveFileName: "Quy trình.pdf",
    driveMimeType: "application/pdf",
    driveModifiedTime: "2026-09-18T01:02:03.000Z",
    syncStatus: "SYNCED",
  });
  assert.equal(record.driveWebViewLink, "https://drive.google.com/file/d/1ZyXwVuTsRqPoNmLkJiHgFeDcBa/view");
  assert.equal(record.driveModifiedAt?.toISOString(), "2026-09-18T01:02:03.000Z");
});
test("không nhận trạng thái lạ, ngày sai hoặc SYNCED thiếu file", () => {
  assert.throws(() => parseDocumentDriveSyncRecord({ documentId: "doc-1", syncStatus: "DONE" }), /Trạng thái/);
  assert.throws(() => parseDocumentDriveSyncRecord({ documentId: "doc-1", syncStatus: "SYNCED" }), /driveFileId/);
  assert.throws(() => parseDocumentDriveSyncRecord({ documentId: "doc-1", syncStatus: "ERROR", driveModifiedTime: "sai" }), /driveModifiedTime/);
});
