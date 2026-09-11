/** API + PostgreSQL local; chỉ dùng fixture riêng, dọn trong finally. Không áp SQL/build. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import PizZip from "pizzip";
import fs from "node:fs/promises";
import { safetyPrintData } from "@/lib/work-permit-safety";

loadEnvConfig(process.cwd());
const dbUrl = new URL(process.env.DATABASE_URL ?? "");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(dbUrl.hostname) && dbUrl.port === "5433", "Chỉ chạy trên DB local:5433");
const origin = "http://localhost:3030";
const db = new PrismaClient();
const prefix = `PCTQA_${Date.now()}`;
const userIds: string[] = [];
let checks = 0;
const writerCookies = new Map<string, string>(), viewerCookies = new Map<string, string>();
function cookiesHeader(cookies: Map<string, string>) { return [...cookies].map(([k, v]) => `${k}=${v}`).join("; "); }
async function request(path: string, method = "GET", body?: unknown, cookies = writerCookies) {
  const response = await fetch(origin + path, { method, redirect: "manual", headers: { Cookie: cookiesHeader(cookies), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text(); let json: any;
  try { json = JSON.parse(text); } catch { json = { error: text.slice(0, 250) }; }
  return { status: response.status, data: json.data, meta: json.meta, error: json.error, response };
}
function expect(result: Awaited<ReturnType<typeof request>>, status: number, label: string) {
  assert.equal(result.status, status, `${label}: ${result.error ?? result.status}`); checks++;
}
function saveCookies(response: Response, jar: Map<string, string>) {
  for (const line of response.headers.getSetCookie()) { const cookie = line.split(";")[0]; const i = cookie.indexOf("="); jar.set(cookie.slice(0, i), cookie.slice(i + 1)); }
}
async function login(role: "MANAGER" | "VIEWER", jar: Map<string, string>) {
  const suffix = userIds.length;
  const password = `Qa!${randomUUID()}`;
  const user = await db.user.create({ data: { name: `${prefix} ${role}`, employeeId: `${prefix}_${role}_${suffix}`, email: `${prefix}_${role}_${suffix}@example.invalid`.toLowerCase(), role, passwordHash: await bcrypt.hash(password, 10), position: "Trưởng ca", passwordChangedAt: new Date(), mustChangePassword: false } });
  userIds.push(user.id);
  const csrf = await fetch(origin + "/api/auth/csrf"); saveCookies(csrf, jar);
  const csrfBody = await csrf.json();
  const response = await fetch(origin + "/api/auth/callback/credentials", { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookiesHeader(jar) }, body: new URLSearchParams({ csrfToken: csrfBody.csrfToken, email: user.email, password, callbackUrl: origin + "/work-permits" }) });
  saveCookies(response, jar);
  const session = await fetch(origin + "/api/auth/session", { headers: { Cookie: cookiesHeader(jar) } }).then(r => r.json());
  assert.equal(session?.user?.id, user.id, `Đăng nhập fixture ${role} thất bại`); checks++;
}

async function main() {
  const itemIds: string[] = [], permitIds: string[] = [];
  try {
    await login("MANAGER", writerCookies); await login("VIEWER", viewerCookies);
    const seed = await request("/api/work-permits/safety?kind=MECHANICAL"); expect(seed, 200, "Đọc danh mục Cơ"); assert.equal(seed.data.length, 10); checks++;
    const blank = { kind: "MECHANICAL", hazard: `${prefix} Hố sâu & <nguy hiểm>`, measure: "Rào chắn & cảnh báo <khu vực>", source: prefix, isActive: true };
    expect(await request("/api/work-permits/safety", "POST", blank, viewerCookies), 403, "Chặn người xem sửa danh mục");
    expect(await request("/api/work-permits/safety", "POST", { ...blank, hazard: "" }), 400, "Bắt buộc cặp đủ nội dung");
    expect(await request("/api/work-permits/safety", "POST", { ...blank, kind: "OTHER" }), 400, "Kiểm tra loại danh mục");
    const first = await request("/api/work-permits/safety", "POST", blank); expect(first, 200, "Tạo cặp Cơ"); itemIds.push(first.data.id);
    const elec = await request("/api/work-permits/safety", "POST", { ...blank, kind: "ELECTRICAL" }); expect(elec, 200, "Tạo cặp Điện riêng"); itemIds.push(elec.data.id);
    for (let i = 0; i < 11; i++) {
      const row = await db.workPermitSafetyMeasure.create({ data: { ...blank, hazard: `${prefix} ${i}`, searchText: prefix.toLowerCase() } }); itemIds.push(row.id);
    }
    const list1 = await request(`/api/work-permits/safety?kind=MECHANICAL&q=${prefix}`), list2 = await request(`/api/work-permits/safety?kind=MECHANICAL&q=${prefix}&page=2`);
    expect(list1, 200, "Trang 1 danh mục"); expect(list2, 200, "Trang 2 danh mục"); assert.equal(list1.meta.total, 12); assert.equal(list1.data.length, 10); assert.equal(list2.data.length, 2); assert.equal(new Set([...list1.data, ...list2.data].map(r => r.id)).size, 12); checks += 4;
    assert.ok(list1.data.every((r: any) => r.kind === "MECHANICAL")); assert.ok(!("searchText" in list1.data[0])); checks += 2;
    const search = await request(`/api/work-permits/safety?kind=MECHANICAL&q=${encodeURIComponent("ho sau")}`); expect(search, 200, "Tìm không dấu"); assert.ok(search.data.some((r: any) => r.id === first.data.id)); checks++;
    const now = new Date(); const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric" }).format(now));
    const paperFields = { registrationNumber: "2609/2026/ĐK-SCCN", workScope: "Phạm vi độc lập & <kiểm tra>", plannedStartAt: "2026-09-10T13:20:00+07:00", plannedEndAt: "2026-09-12T17:45:00+07:00", disciplines: [] };
    const base = { ...paperFields, kind: "MECHANICAL", year, number: prefix, unit: "S1", content: `${prefix} Công việc & kiểm tra <XML>`, location: "Vị trí thử", workDate: `${year}-09-10`, teamType: "INTERNAL", format: "PAPER", issuerName: "Người cấp thử", commanderName: "CHTT thử", teamName: "Nội bộ thử", workerCount: 1, members: [], status: "ISSUED", issuedAt: now.toISOString() };
    const pair = { sourceId: first.data.id, hazard: first.data.hazard, measure: first.data.measure, forAuthorization: true, forExecution: false };
    expect(await request("/api/work-permits", "POST", { ...base, safetyItems: [{ ...pair, forAuthorization: false }] }), 400, "Phải phân công trước khi cấp");
    expect(await request("/api/work-permits", "POST", { ...base, safetyItems: [{ ...pair, forAuthorization: "true" }] }), 400, "Phân công phải boolean");
    expect(await request("/api/work-permits", "POST", { ...base, safetyItems: [pair, pair] }), 400, "Không lặp cặp nguồn");
    expect(await request("/api/work-permits", "POST", { ...base, kind: "ELECTRICAL", safetyItems: [pair] }), 400, "Không chọn cặp Cơ cho Điện");
    expect(await request("/api/work-permits", "POST", { ...base, format: "ELECTRONIC", safetyItems: [pair] }), 400, "Điện tử không lưu biện pháp");
    expect(await request("/api/work-permits", "POST", { ...base, safetyItems: Array(101).fill(pair) }), 400, "Giới hạn 100 cặp");
    expect(await request("/api/work-permits", "POST", { ...base, plannedEndAt: "2026-09-09T17:00:00+07:00" }), 400, "Chặn kế hoạch kết thúc trước bắt đầu");
    expect(await request("/api/work-permits", "POST", { ...base, plannedStartAt: "2026-02-30T13:20:00+07:00" }), 400, "Chặn ngày kế hoạch không tồn tại");
    expect(await request("/api/work-permits", "POST", { ...base, disciplines: ["OTHER"] }), 400, "Chuyên môn hợp lệ");
    expect(await request("/api/work-permits", "POST", { ...base, disciplines: ["THERMAL", "THERMAL"] }), 400, "Không lặp chuyên môn");
    expect(await request("/api/work-permits", "POST", { ...base, kind: "ELECTRICAL", disciplines: ["THERMAL"] }), 400, "Không áp chuyên môn Cơ cho Điện");
    const selection = [pair, { hazard: "Mối nguy khác", measure: "Biện pháp chỉ công tác", forAuthorization: false, forExecution: true }, { hazard: "Mối nguy chung", measure: "Biện pháp cả hai", forAuthorization: true, forExecution: true }, { hazard: "Mối nguy cùng biện pháp", measure: pair.measure, forAuthorization: true, forExecution: false }];
    const created = await request("/api/work-permits", "POST", { ...base, disciplines: ["THERMAL", "CHEMICAL"], safetyItems: selection }); expect(created, 200, "Cấp PCT giấy có phân công"); permitIds.push(created.data.id);
    assert.deepEqual(created.data.safetyItems, selection); checks++;
    const split = safetyPrintData(selection); assert.equal(split.hazards.length, 4); assert.equal(split.authorization.length, 2); assert.equal(split.execution.length, 2); checks += 3;
    const off = await request(`/api/work-permits/safety/${first.data.id}`, "PUT", { ...first.data, measure: "Đã thay đổi trong danh mục", isActive: false }); expect(off, 200, "Sửa/ngừng sử dụng cặp nguồn");
    expect(await request(`/api/work-permits/safety/${first.data.id}`, "PUT", { ...first.data, measure: "Ghi đè cũ" }), 409, "Chặn cập nhật phiên cũ");
    const unchanged = await request(`/api/work-permits/${created.data.id}`); expect(unchanged, 200, "Đọc phiếu đã cấp"); assert.deepEqual(unchanged.data.safetyItems, selection); checks++;
    expect(await request("/api/work-permits", "POST", { ...base, number: prefix + "-old", safetyItems: [pair] }), 409, "Không chọn mới mục ngừng sử dụng");
    const omitted = { ...unchanged.data }; delete omitted.safetyItems; for (const key of Object.keys(paperFields)) delete omitted[key];
    const updated = await request(`/api/work-permits/${created.data.id}`, "PUT", { ...omitted, note: "Cập nhật ghi chú" }); expect(updated, 200, "Giữ snapshot khi client cũ không gửi trường mới"); assert.deepEqual(updated.data.safetyItems, selection); checks++;
    assert.equal(updated.data.registrationNumber, paperFields.registrationNumber); assert.equal(updated.data.workScope, paperFields.workScope);
    assert.equal(updated.data.plannedStartAt, new Date(paperFields.plannedStartAt).toISOString()); assert.equal(updated.data.plannedEndAt, new Date(paperFields.plannedEndAt).toISOString()); assert.deepEqual(updated.data.disciplines, ["THERMAL", "CHEMICAL"]); checks += 5;
    const latest = await request(`/api/work-permits/${created.data.id}`); expect(latest, 200, "Đọc lịch sử");
    const h = await request(`/api/work-permits/${created.data.id}/history/${latest.data.history[0].id}`); expect(h, 200, "Chi tiết lịch sử có phân công"); assert.deepEqual(h.data.after.safetyItems, selection); checks++;
    expect(await request(`/api/work-permits/${created.data.id}`, "PUT", { ...updated.data, format: "ELECTRONIC" }), 400, "Chặn chuyển điện tử còn biện pháp");
    const mainList = await request(`/api/work-permits?kind=MECHANICAL&q=${prefix}`); expect(mainList, 200, "Danh sách phiếu nhẹ"); assert.ok(mainList.data.every((r: any) => !("safetyItems" in r))); checks++;
    const download = async (id: string) => {
      const r = await fetch(`${origin}/api/work-permits/${id}/document`, { headers: { Cookie: cookiesHeader(writerCookies) } });
      assert.equal(r.status, 200, "Tải mẫu Word"); checks++;
      const buffer = Buffer.from(await r.arrayBuffer());
      assert.match(r.headers.get("content-type") ?? "", /wordprocessingml/); checks++;
      return { zip: new PizZip(buffer), buffer };
    };
    const doc = await download(created.data.id), xml = doc.zip.file("word/document.xml")!.asText();
    const tables = xml.match(/<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g)!;
    const a = tables.find(t => t.includes("Nhận diện mối nguy"))!, b = tables.find(t => t.includes("đơn vị cho phép"))!, c = tables.find(t => t.includes("đơn vị công tác"))!;
    assert.ok(a.includes("Biện pháp chỉ công tác") && a.includes("Biện pháp cả hai"));
    assert.ok(b.includes("Biện pháp cả hai") && !b.includes("Biện pháp chỉ công tác"));
    assert.ok(c.includes("Biện pháp cả hai") && c.includes("Biện pháp chỉ công tác") && !c.includes("Rào chắn"));
    assert.ok(xml.includes("&amp;") && xml.includes("&lt;XML&gt;")); assert.ok(!xml.includes("Đã thay đổi trong danh mục")); checks += 5;
    const bodyText = xml.replace(/<[^>]+>/g, "");
    assert.ok(bodyText.includes("Số ĐK: 2609/2026/ĐK-SCCN")); assert.ok(bodyText.includes("Phạm vi: Phạm vi độc lập &amp; &lt;kiểm tra&gt;"));
    assert.ok(bodyText.includes("13 giờ 20 ngày 10/09/2026") && bodyText.includes("17 giờ 45 ngày 12/09/2026"));
    assert.ok(bodyText.includes("[  ] Thủy") && bodyText.includes("[  ] Cơ") && bodyText.includes("[X] Nhiệt") && bodyText.includes("[X] Hóa")); checks += 4;
    const searchRegistration = await request(`/api/work-permits?kind=MECHANICAL&q=${encodeURIComponent(paperFields.registrationNumber)}`); expect(searchRegistration, 200, "Tìm phiếu bằng ĐKCT"); assert.ok(searchRegistration.data.some((r: any) => r.id === created.data.id)); checks++;
    await fs.mkdir("/tmp/dh1-safety-qa", { recursive: true }); await fs.writeFile("/tmp/dh1-safety-qa/mechanical.docx", doc.buffer);
    const many = Array.from({ length: 20 }, (_, i) => ({ hazard: `Mối nguy ${i + 1}`, measure: `Biện pháp ${i + 1}`, forAuthorization: true, forExecution: true }));
    const manyPermit = await request("/api/work-permits", "POST", { ...base, number: prefix + "-long", safetyItems: many }); expect(manyPermit, 200, "Phiếu 20 cặp"); permitIds.push(manyPermit.data.id);
    const long = await download(manyPermit.data.id); const longXml = long.zip.file("word/document.xml")!.asText();
    const longTable = longXml.match(/<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g)!.find(t => t.includes("Nhận diện mối nguy"))!;
    assert.equal((longTable.match(/<w:tr\b/g) ?? []).length, 21); checks++;
    await fs.writeFile("/tmp/dh1-safety-qa/mechanical-long.docx", long.buffer);
    const noRegistration = await request(`/api/work-permits/${manyPermit.data.id}`, "PUT", { ...manyPermit.data, registrationNumber: "   ", plannedStartAt: null, plannedEndAt: null, workScope: "" }); expect(noRegistration, 200, "Xóa ĐKCT và trường tùy chọn");
    const noRegistrationDoc = await download(manyPermit.data.id); const noRegistrationText = noRegistrationDoc.zip.file("word/document.xml")!.asText().replace(/<[^>]+>/g, "");
    assert.ok(!noRegistrationText.includes("Số ĐK:")); assert.ok(!noRegistrationText.includes(paperFields.registrationNumber)); assert.ok(!noRegistrationText.includes("13 giờ 20 ngày")); checks += 3;
    await fs.writeFile("/tmp/dh1-safety-qa/mechanical-no-registration.docx", noRegistrationDoc.buffer);
    const freeRegistration = await request(`/api/work-permits/${manyPermit.data.id}`, "PUT", { ...noRegistration.data, registrationNumber: "điện trực tiếp" }); expect(freeRegistration, 200, "ĐKCT cho phép chữ");
    const freeDoc = await download(manyPermit.data.id); assert.ok(freeDoc.zip.file("word/document.xml")!.asText().includes("Số ĐK: điện trực tiếp")); checks++;
    const electrical = await request("/api/work-permits", "POST", { ...base, number: prefix + "-electric", kind: "ELECTRICAL", safetyItems: [{ ...pair, sourceId: elec.data.id, forExecution: true }] }); expect(electrical, 200, "Cấp PCT Điện giấy"); permitIds.push(electrical.data.id);
    const electricDoc = await download(electrical.data.id), electricXml = electricDoc.zip.file("word/document.xml")!.asText();
    assert.ok(electricXml.includes("PHỤ LỤC PHÂN CÔNG") && electricXml.replace(/<[^>]+>/g, "").includes("Cảnh báo mối nguy hiểm")); checks++;
    await fs.writeFile("/tmp/dh1-safety-qa/electrical.docx", electricDoc.buffer);
    const electronic = await request("/api/work-permits", "POST", { ...base, number: prefix + "-online", format: "ELECTRONIC", safetyItems: [] }); expect(electronic, 200, "PCT điện tử vẫn cấp bình thường"); permitIds.push(electronic.data.id);
    expect(await request(`/api/work-permits/${electronic.data.id}/document`), 400, "Chặn tải mẫu điện tử");
    const draft = await request("/api/work-permits", "POST", { ...base, number: prefix + "-draft", status: "DRAFT", issuedAt: null, safetyItems: [{ ...pair, sourceId: undefined, forAuthorization: false }] }); expect(draft, 200, "Nháp cho phép chưa phân công"); permitIds.push(draft.data.id);
    expect(await request(`/api/work-permits/${draft.data.id}/document`), 400, "Nháp không tải phiếu đã cấp");
    const draftBody = { ...draft.data, status: "ISSUED", issuedAt: now.toISOString() }; delete draftBody.safetyItems;
    expect(await request(`/api/work-permits/${draft.data.id}`, "PUT", draftBody), 400, "Nháp chuyển cấp vẫn kiểm tra phân công khi bỏ trường");
    const cleared = await request(`/api/work-permits/${created.data.id}`, "PUT", { ...updated.data, format: "ELECTRONIC", safetyItems: [] }); expect(cleared, 200, "Đổi điện tử khi đã bỏ biện pháp");
    console.log(`Đạt ${checks} kiểm tra: cặp mối nguy, phân công, giấy/điện tử, phân quyền, phân trang, snapshot và điền mẫu Word.`);
  } finally {
    await db.$transaction(async tx => {
      await tx.workPermitHistory.deleteMany({ where: { permitId: { in: permitIds } } });
      await tx.workPermit.deleteMany({ where: { id: { in: permitIds } } });
      await tx.workPermitSafetyMeasure.deleteMany({ where: { id: { in: itemIds } } });
      await tx.auditLog.deleteMany({ where: { userId: { in: userIds } } });
      await tx.systemAuditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
    });
    await db.$disconnect(); console.log("Đã dọn fixture riêng; giữ nguyên dữ liệu người dùng.");
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
