import assert from "node:assert/strict";
import test from "node:test";
import {
  googleDriveFileViewUrl,
  googleDriveFolderViewUrl,
  parseGoogleDriveTarget,
} from "../../lib/google-drive-document";

const folderId = "1AbCdEfGhIjKlMnOpQrStUvWxYz";
const fileId = "1ZyXwVuTsRqPoNmLkJiHgFeDcBa";

test("nhận diện và chuẩn hoá link thư mục Google Drive", () => {
  assert.deepEqual(parseGoogleDriveTarget(`https://drive.google.com/drive/u/1/folders/${folderId}?usp=sharing`), {
    kind: "FOLDER",
    id: folderId,
    canonicalUrl: googleDriveFolderViewUrl(folderId),
  });
});
test("nhận diện link file Drive dạng /file/d và open?id", () => {
  assert.equal(parseGoogleDriveTarget(`https://drive.google.com/file/d/${fileId}/view`).id, fileId);
  assert.deepEqual(parseGoogleDriveTarget(`https://drive.google.com/open?id=${fileId}`), {
    kind: "FILE",
    id: fileId,
    canonicalUrl: googleDriveFileViewUrl(fileId),
  });
});

test("phân biệt Google Docs với file PDF và không đoán URL lạ", () => {
  assert.equal(parseGoogleDriveTarget(`https://docs.google.com/document/d/${fileId}/edit`).kind, "GOOGLE_DOCUMENT");
  assert.deepEqual(parseGoogleDriveTarget("https://example.com/tai-lieu.pdf"), {
    kind: "UNKNOWN",
    id: null,
    canonicalUrl: null,
  });
  assert.deepEqual(parseGoogleDriveTarget("khong-phai-url"), {
    kind: "UNKNOWN",
    id: null,
    canonicalUrl: null,
  });
});
