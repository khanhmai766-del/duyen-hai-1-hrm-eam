import assert from "node:assert/strict";
import test from "node:test";
import { parseDocumentDriveCandidates } from "../../lib/document-drive-candidates";
import { parseDocumentDriveSyncRecord } from "../../lib/document-drive-sync";

test("bản ghi SYNCED bắt buộc có fileId và tự dựng link xem an toàn", () => {
  const record = parseDocumentDriveSyncRecord({
    documentId: "doc-1",
    driveFolderId: "1AbCdEfGhIjKlMnOpQrStUvWxYz",
    driveFileId: "1ZyXwVuTsRqPoNmLkJiHgFeDcBa",
    driveFileName: "Quy trình.pdf",
    driveMimeType: "application/pdf",
    driveModifiedTime: "2026-09-18T01:02:03.000Z",
    candidateFiles: [
      {
        id: "1ZyXwVuTsRqPoNmLkJiHgFeDcBa",
        name: "Quy trình.pdf",
        mimeType: "application/pdf",
        modifiedTime: "2026-09-18T01:02:03.000Z",
        md5Checksum: "abc123",
        size: "2048",
      },
    ],
    syncStatus: "SYNCED",
  });
  assert.equal(record.driveWebViewLink, "https://drive.google.com/file/d/1ZyXwVuTsRqPoNmLkJiHgFeDcBa/view");
  assert.equal(record.driveModifiedAt?.toISOString(), "2026-09-18T01:02:03.000Z");
  assert.deepEqual(record.driveCandidateFiles, [
    {
      id: "1ZyXwVuTsRqPoNmLkJiHgFeDcBa",
      name: "Quy trình.pdf",
      mimeType: "application/pdf",
      modifiedTime: "2026-09-18T01:02:03.000Z",
      md5Checksum: "abc123",
      webViewLink: "https://drive.google.com/file/d/1ZyXwVuTsRqPoNmLkJiHgFeDcBa/view",
      size: 2048,
    },
  ]);
});

test("danh sách ứng viên chỉ giữ PDF hợp lệ và loại ID trùng", () => {
  const candidates = parseDocumentDriveCandidates([
    { id: "1AbCdEfGhIjKlMnOpQrStUvWxYz", name: " Bản chính.pdf ", mimeType: "application/pdf", size: 1024 },
    { id: "1AbCdEfGhIjKlMnOpQrStUvWxYz", name: "Bản trùng.pdf", mimeType: "application/pdf" },
    { id: "1ZyXwVuTsRqPoNmLkJiHgFeDcBa", name: "Ghi chú.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    { id: "bad", name: "Sai.pdf", mimeType: "application/pdf" },
  ]);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.name, "Bản chính.pdf");
  assert.equal(candidates[0]?.size, 1024);
});
test("không nhận trạng thái lạ, ngày sai hoặc SYNCED thiếu file", () => {
  assert.throws(() => parseDocumentDriveSyncRecord({ documentId: "doc-1", syncStatus: "DONE" }), /Trạng thái/);
  assert.throws(() => parseDocumentDriveSyncRecord({ documentId: "doc-1", syncStatus: "SYNCED" }), /driveFileId/);
  assert.throws(() => parseDocumentDriveSyncRecord({ documentId: "doc-1", syncStatus: "ERROR", driveModifiedTime: "sai" }), /driveModifiedTime/);
});
