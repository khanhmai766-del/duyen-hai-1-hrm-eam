/** Kiểm tra cả hai mẫu PCT Word/HTML từ dữ liệu đại diện, không dùng CSDL. */
import assert from "node:assert/strict";
import PizZip from "pizzip";
import type { WorkPermit } from "@prisma/client";
import { createWorkPermitDocument, createWorkPermitHtml } from "../../lib/server/work-permit-document";

const base = {
  number: "897", year: 2026, registrationNumber: "6404/2026/ĐK-SCCN",
  location: "Thải xỉ S2", content: "Sửa chữa van", workScope: "Van tay trước máy S2",
  disciplines: ["MECHANICAL"], plannedStartAt: new Date("2026-09-22T03:00:00Z"), plannedEndAt: new Date("2026-09-22T08:00:00Z"),
  issuerName: "Người cấp", issuedAt: new Date("2026-09-22T02:00:00Z"),
  authorizerName: "Người cho phép", authorizedAt: null, commanderName: "Chỉ huy", teamName: "Sửa chữa Cơ nhiệt",
  workerCount: 3, leaderName: "", electricalSafetySupervisorName: "",
  safetyItems: [{ hazard: "Bỏng", measure: "Đeo găng", forAuthorization: true, forExecution: true }],
};
async function main() {
  for (const kind of ["MECHANICAL", "ELECTRICAL"] as const) {
    const row = { ...base, kind } as unknown as WorkPermit;
    const html = await createWorkPermitHtml(row);
    assert.match(html, /<!doctype html>/i);
    assert.match(html, /Sửa chữa van/);
    assert.doesNotMatch(html, /\{\{[^{}]+\}\}/);
    const document = new PizZip(await createWorkPermitDocument(row));
    const xml = document.file("word/document.xml")?.asText() ?? "";
    assert.match(xml, /Sửa chữa van/);
    assert.doesNotMatch(xml, /\{\{[^{}]+\}\}/);
    const text = xml.replace(/<[^>]+>/g, "");
    assert.doesNotMatch(text, /Người CHTT:\s*Chỉ huy/);
    assert.doesNotMatch(text, /Người chỉ huy trực tiếp:\s*Chỉ huy/);
    assert.doesNotMatch(text, /Số lượng người:\s*3/);
    assert.doesNotMatch(text, /Nhân viên đơn vị công tác:\s*3 người/);
    assert.doesNotMatch(html, /Người CHTT:\s*Chỉ huy/);
    assert.doesNotMatch(html, /Người chỉ huy trực tiếp:\s*Chỉ huy/);
    assert.doesNotMatch(html, /Số lượng người:\s*3/);
    assert.doesNotMatch(html, /Nhân viên đơn vị công tác:\s*3 người/);
    if (kind === "MECHANICAL") {
      assert.match(text, /Người CHTT: \.{18}\s*Chữ ký: \.{8}\s*Ngày/);
      assert.doesNotMatch(xml, /<w:w\b[^>]*w:val="85"/);
      const signatureTable = (xml.match(/<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g) ?? []).find(table => table.includes("Người CHTT:")) ?? "";
      assert.match(signatureTable, /w:ascii="Times New Roman"/);
      assert.match(signatureTable, /<w:sz w:val="24"\/>/);
      assert.equal((html.match(/grid-template-columns:17\.7% 26% 9\.4% 8% 23% 15\.9%;align-items:baseline;font-size:12pt/g) ?? []).length, 2);
    }
  }
  console.log("Đạt kiểm tra Word và HTML cho PCT Cơ, Điện.");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
