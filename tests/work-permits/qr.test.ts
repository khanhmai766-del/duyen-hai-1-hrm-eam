import test from "node:test";
import assert from "node:assert/strict";
import PizZip from "pizzip";
import sharp from "sharp";
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

test("PCT nhà thầu Đại tu có QR 2,5 cm ở chân trang đầu file Word", async () => {
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
  assert.match(xml, /<w:footerReference w:type="first" r:id="rIdOverhaulQrFooter"\/>/);
  assert.match(xml, /<w:titlePg\/>/);
  const footer = zip.file("word/footer-overhaul-qr.xml")!.asText();
  assert.match(footer, /Mã QR PCT Đại tu/);
  assert.match(footer, /<w:jc w:val="right"\/>/);
  assert.match(xml, /125\/2026\/VH1-NĐDH/);
  assert.match(footer, /wp:extent cx="900000" cy="900000"/);
  assert.doesNotMatch(xml, /<w:drawing>/);
  assert.doesNotMatch(xml, /<w:br w:type="page"\/>/);
  assert.match(relationships, /Id="rIdOverhaulQrFooter"/);
  assert.match(zip.file("word/_rels/footer-overhaul-qr.xml.rels")!.asText(), /Id="rIdWorkPermitQr"/);
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

test("PCT đại tu không tự in thêm biện pháp thi công hoặc trang cuối dù có hạng mục", async () => {
  const { createWorkPermitHtml } = await import("../../lib/server/work-permit-document");
  const items = [{ code: "1.1", device: "Bơm cấp A", content: "Kiểm tra ổ trục", method: "Cô lập nguồn & treo biển.\nTháo nắp kiểm tra.", source: "TURBINE", sheet: "Máy Cơ" }];
  for (const kind of ["MECHANICAL", "ELECTRICAL"] as const) {
    const row = { ...methodFixture(items), kind };
    const before = { ...row, overhaulItems: [] };
    const xml = new PizZip(await createWorkPermitDocument(row)).file("word/document.xml")!.asText();
    const baseline = new PizZip(await createWorkPermitDocument(before)).file("word/document.xml")!.asText();
    const html = await createWorkPermitHtml(row);
    assert.equal(xml, baseline);
    assert.equal(html, await createWorkPermitHtml(before));
    for (const output of [xml, html]) {
      assert.doesNotMatch(output, /BIỆN PHÁP THI CÔNG THEO HẠNG MỤC|Cô lập nguồn|Tháo nắp kiểm tra/);
    }
    assert.doesNotMatch(xml, /<w:br w:type="page"\/>/);
    assert.equal((html.match(/<section\b/g) ?? []).length, 1);
  }
});

test("QR có bản vector trong Word và ảnh dự phòng nét, từng ô chỉ có đen/trắng", async () => {
  const zip = new PizZip(await createWorkPermitDocument(methodFixture()));
  const svg = zip.file("word/media/work-permit-qr.svg")!.asText();
  assert.match(svg, /width="25mm" height="25mm"/);
  assert.match(svg, /shape-rendering="crispEdges"/);
  assert.doesNotMatch(svg, /<image/);
  assert.match(zip.file("word/footer-overhaul-qr.xml")!.asText(), /asvg:svgBlip.*r:embed="rIdWorkPermitQrSvg"/);
  assert.match(zip.file("word/_rels/footer-overhaul-qr.xml.rels")!.asText(), /Target="media\/work-permit-qr.svg"/);
  const png = zip.file("word/media/work-permit-qr.png")!.asNodeBuffer();
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  assert.ok(info.width >= 1000);
  assert.equal(info.width, info.height);
  assert.equal(info.width % 32, 0);
  assert.deepEqual([...new Set(data)].sort((a, b) => a - b), [0, 255]);
});

test("PCT sửa chữa thường không thêm trang QR hoặc biện pháp của hạng mục đại tu", async () => {
  const { createWorkPermitHtml } = await import("../../lib/server/work-permit-document");
  const row = methodFixture([{ code: "1.1", method: "Không được in ở phiếu thường" }]); row.contractorScope = "SCTX";
  const zip = new PizZip(await createWorkPermitDocument(row));
  assert.equal(zip.file("word/media/work-permit-qr.png"), null);
  for (const output of [zip.file("word/document.xml")!.asText(), await createWorkPermitHtml(row)]) { assert.ok(!output.includes("MÃ QR PCT ĐẠI TU")); assert.ok(!output.includes("Không được in ở phiếu thường")); }
});

test("QR HTML chỉ in ở góc phải trang đầu, phiếu Điện cũng có footer trang đầu", async () => {
  const { createWorkPermitHtml } = await import("../../lib/server/work-permit-document");
  for (const kind of ["MECHANICAL", "ELECTRICAL"] as const) {
    const row = { ...methodFixture(), kind };
    const html = await createWorkPermitHtml(row);
    assert.match(html, /@page sheet0:first \{ @bottom-right/);
    assert.match(html, /content:url\("data:image\/svg\+xml;base64,/);
    assert.equal((html.match(/alt="Mã QR PCT Đại tu"/g) ?? []).length, 1);
    assert.ok(!html.includes('aria-hidden="true"'));
    const xml = new PizZip(await createWorkPermitDocument(row)).file("word/document.xml")!.asText();
    assert.match(xml, /w:type="first" r:id="rIdOverhaulQrFooter"/);
    assert.match(xml, /w:bottom="1984"/);
    assert.match(xml, /w:footer="283"/);
  }
});
