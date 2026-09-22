/** Kiểm tra tệp PCT cục bộ, không kết nối CSDL hoặc S3. */
import assert from "node:assert/strict";
import { permitAttachmentFile } from "../../lib/server/work-permit-attachments";

function data(file: File) { const form = new FormData(); form.set("file", file); return form; }
async function rejected(file: File) {
  await assert.rejects(() => permitAttachmentFile(data(file)), error => error instanceof Response && error.status === 400);
}
async function main() {
  const pdf = new File([Buffer.from("%PDF-1.4\n%%EOF")], "mau.pdf", { type: "application/pdf" });
  assert.equal((await permitAttachmentFile(data(pdf))).mime, "application/pdf");
  await rejected(new File([Buffer.from("<html></html>")], "gia.pdf", { type: "application/pdf" }));
  await rejected(new File([Buffer.from("%PDF-1.4")], "gia.html", { type: "application/pdf" }));
  await rejected(new File([Buffer.alloc(15 * 1024 * 1024 + 1)], "qua-lon.pdf", { type: "application/pdf" }));
  console.log("Đạt kiểm tra định dạng tệp PCT.");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
