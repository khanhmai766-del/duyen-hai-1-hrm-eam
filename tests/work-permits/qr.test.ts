import test from "node:test";
import assert from "node:assert/strict";
import PizZip from "pizzip";
import type { WorkPermit } from "@prisma/client";
import { parseWorkPermitQrValue, workPermitQrValue } from "../../lib/work-permit-qr";
import { createWorkPermitDocument } from "../../lib/server/work-permit-document";

test("tạo đường dẫn QR PCT ổn định và nhận lại đúng ID", () => {
  const id = "cm1234567890permit";
  const value = workPermitQrValue(id, "https://duyenhai1.vn/");
  assert.equal(value, `https://duyenhai1.vn/work-permits/${id}/lam-viec?open=1`);
  assert.deepEqual(parseWorkPermitQrValue(value), { id });
  assert.deepEqual(parseWorkPermitQrValue(`/work-permits/${id}/lam-viec?open=1`), { id });
});

test("không nhận QR thiết bị hoặc đường dẫn PCT không hợp lệ", () => {
  assert.equal(parseWorkPermitQrValue("/public/equipment/DH1.S1.ABC?machine=S1"), null);
  assert.equal(parseWorkPermitQrValue("/work-permits/x/lam-viec?open=1"), null);
  assert.equal(parseWorkPermitQrValue("/work-permits/cm1234567890permit/edit"), null);
});

test("PCT nhà thầu Đại tu có trang QR 4 cm ở cuối file Word", async () => {
  const row = {
    id: "cm1234567890permit", kind: "MECHANICAL", number: "125", year: 2026, unit: "S1",
    teamType: "CONTRACTOR", contractorScope: "OVERHAUL", format: "PAPER", registrationNumber: "",
    content: "Đại tu bơm cấp", location: "Gian máy S1", workScope: "Bơm cấp A", teamName: "Nhà thầu ABC",
    disciplines: ["MECHANICAL"], safetyItems: [], plannedStartAt: new Date("2026-10-01T01:00:00Z"), plannedEndAt: new Date("2026-10-01T05:00:00Z"),
    issuerName: "Người cấp", issuerPosition: "", issuerUserId: null, issuedAt: new Date("2026-09-30T01:00:00Z"),
    authorizerName: "", authorizedAt: null, commanderName: "CHTT", workerCount: 1,
    leaderName: "", electricalSafetySupervisorName: "",
  } as unknown as WorkPermit;
  const zip = new PizZip(await createWorkPermitDocument(row));
  const xml = zip.file("word/document.xml")?.asText() ?? "";
  const relationships = zip.file("word/_rels/document.xml.rels")?.asText() ?? "";
  assert.ok(zip.file("word/media/work-permit-qr.png"));
  assert.match(xml, /MÃ QR PCT ĐẠI TU/);
  assert.match(xml, /PCT 125\/2026\/VH1-NĐDH/);
  assert.match(xml, /wp:extent cx="1440000" cy="1440000"/);
  assert.match(relationships, /Id="rIdWorkPermitQr"/);
});

function methodFixture(overhaulItems: unknown = []) {
  return {
    id: "cm1234567890permit", kind: "MECHANICAL", number: "125", year: 2026, unit: "S1",
    teamType: "CONTRACTOR", contractorScope: "OVERHAUL", format: "PAPER", registrationNumber: "",
    content: "Đại tu bơm cấp theo hạng mục 1.1, 1.2", location: "Gian máy S1", workScope: "Bơm cấp A", teamName: "Nhà thầu ABC",
    disciplines: ["MECHANICAL"], safetyItems: [], overhaulItems, plannedStartAt: null, plannedEndAt: null,
    issuerName: "Người cấp", issuerPosition: "", issuerUserId: null, issuedAt: null,
    authorizerName: "", authorizedAt: null, commanderName: "CHTT", workerCount: 1, leaderName: "", electricalSafetySupervisorName: "",
  } as unknown as WorkPermit;
}

test("trang QR Word và HTML in biện pháp từng hạng mục đã chọn, giữ dòng và thoát ký tự", async () => {
  const { createWorkPermitHtml } = await import("../../lib/server/work-permit-document");
  const row = methodFixture([
    { code: "1.1", device: "Bơm cấp A", content: "Kiểm tra ổ trục", method: "Cô lập nguồn & treo biển.\r\nTháo <nắp> kiểm tra.\rLắp lại và nghiệm thu.", source: "TURBINE", sheet: "Máy Cơ" },
    { code: "1.2", device: "Bơm cấp A", content: "Vệ sinh lọc", method: "Tháo lọc và làm sạch.", source: "TURBINE", sheet: "Máy Cơ" },
  ]);
  const zip = new PizZip(await createWorkPermitDocument(row));
  const xml = zip.file("word/document.xml")!.asText();
  const qr = xml.slice(xml.indexOf("MÃ QR PCT ĐẠI TU"));
  for (const text of ["BIỆN PHÁP THI CÔNG THEO HẠNG MỤC", "Hạng mục 1.1", "Hạng mục 1.2", "Cô lập nguồn &amp; treo biển.", "Tháo &lt;nắp&gt; kiểm tra.", "Lắp lại và nghiệm thu.", "Tháo lọc và làm sạch."]) assert.ok(qr.includes(text), text);
  assert.match(qr, /<w:keepNext\/>/);
  const html = await createWorkPermitHtml(row);
  const htmlQr = html.slice(html.indexOf("MÃ QR PCT ĐẠI TU"));
  assert.ok(htmlQr.includes("Hạng mục 1.1 · Bơm cấp A · Kiểm tra ổ trục"));
  assert.ok(htmlQr.includes("Hạng mục 1.2 · Bơm cấp A · Vệ sinh lọc"));
  assert.ok(htmlQr.includes("Cô lập nguồn &amp; treo biển."));
  assert.ok(htmlQr.includes("Tháo &lt;nắp&gt; kiểm tra."));
  assert.ok(!htmlQr.includes("<nắp>"));
  assert.match(htmlQr, /<\/p><p[^>]*>Tháo &lt;nắp&gt; kiểm tra\./);
});

test("phiếu đại tu cũ không có hạng mục vẫn in QR, hạng mục thiếu biện pháp ghi rõ", async () => {
  const { createWorkPermitHtml } = await import("../../lib/server/work-permit-document");
  for (const value of [null, []]) {
    const row = methodFixture(value);
    const xml = new PizZip(await createWorkPermitDocument(row)).file("word/document.xml")!.asText();
    const html = await createWorkPermitHtml(row);
    for (const output of [xml, html]) { assert.ok(output.includes("MÃ QR PCT ĐẠI TU")); assert.ok(!output.includes("BIỆN PHÁP THI CÔNG THEO HẠNG MỤC")); }
  }
  const row = methodFixture([{ code: "1.3", device: "Bơm cấp A", content: "Kiểm tra", method: " \n ", source: "TURBINE", sheet: "Máy Cơ" }]);
  for (const output of [new PizZip(await createWorkPermitDocument(row)).file("word/document.xml")!.asText(), await createWorkPermitHtml(row)]) assert.ok(output.includes("Chưa có biện pháp thi công cho hạng mục này."));
});

test("PCT sửa chữa thường không thêm trang QR hoặc biện pháp của hạng mục đại tu", async () => {
  const { createWorkPermitHtml } = await import("../../lib/server/work-permit-document");
  const row = methodFixture([{ code: "1.1", method: "Không được in ở phiếu thường" }]); row.contractorScope = "SCTX";
  const zip = new PizZip(await createWorkPermitDocument(row));
  assert.equal(zip.file("word/media/work-permit-qr.png"), null);
  for (const output of [zip.file("word/document.xml")!.asText(), await createWorkPermitHtml(row)]) { assert.ok(!output.includes("MÃ QR PCT ĐẠI TU")); assert.ok(!output.includes("Không được in ở phiếu thường")); }
});
