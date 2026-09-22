import test from "node:test";
import assert from "node:assert/strict";
import PizZip from "pizzip";
import { renderBbntDoDocx, replaceBbntDoLastSupplementDate } from "../lib/bbnt-do-doc";

function documentText(buffer: Buffer) {
  const xml = new PizZip(buffer).file("word/document.xml")!.asText();
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map(match => match[1]).join("");
}

for (const category of ["Dầu bôi trơn", "Lọc dầu"]) {
  test(`BBNT D-Office ${category} điền ngày vào ô Ghi chú của mẫu`, async () => {
    const buffer = await renderBbntDoDocx({
      fileBaseName: "test-date", unit: "S1", materialCategory: category,
      lastSupplementDate: "2026-09-15",
      items: [{ deviceName: "Máy mẫu", materialCode: "VT-1", materialName: "Vật tư mẫu", materialUnit: "Lít" }],
    });
    assert.match(documentText(buffer), /Ngày thay\/ bổ sung gần nhất:15\/09\/2026/);
  });
}

test("phiếu cũ không có ngày vẫn để ô trống để điền tay", async () => {
  const buffer = await renderBbntDoDocx({
    fileBaseName: "test-empty-date", unit: "S1", materialCategory: "Dầu bôi trơn",
    items: [{ deviceName: "Máy mẫu", materialCode: "VT-1", materialName: "Vật tư mẫu", materialUnit: "Lít" }],
  });
  assert.match(documentText(buffer), /Ngày thay\/ bổ sung gần nhất:…\/…\/…/);
});

test("sửa ngày trên BBNT D-Office đã xuất giữ nguyên các phần khác của Word", async () => {
  const buffer = await renderBbntDoDocx({
    fileBaseName: "test-issued", unit: "S1", materialCategory: "Dầu bôi trơn",
    lastSupplementDate: "2026-09-15",
    items: [{ deviceName: "Máy mẫu", materialCode: "VT-1", materialName: "Vật tư mẫu", materialUnit: "Lít" }],
  });
  const before = new PizZip(buffer);
  const updated = replaceBbntDoLastSupplementDate(buffer, new Date("2026-09-20T00:00:00.000Z"));
  assert.ok(updated);
  const after = new PizZip(updated);
  assert.deepEqual(Object.keys(after.files).sort(), Object.keys(before.files).sort());
  assert.match(documentText(updated), /Ngày thay\/ bổ sung gần nhất:20\/09\/2026/);
  assert.doesNotMatch(documentText(updated), /Ngày thay\/ bổ sung gần nhất:15\/09\/2026/);
  for (const name of Object.keys(before.files).filter(name => name !== "word/document.xml" && !before.files[name].dir)) {
    assert.deepEqual(after.file(name)?.asUint8Array(), before.file(name)?.asUint8Array(), name);
  }
});
