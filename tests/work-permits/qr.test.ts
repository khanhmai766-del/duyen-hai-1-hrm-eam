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
