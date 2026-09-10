/** API + PostgreSQL local; chỉ dùng fixture riêng, dọn trong finally. Không áp SQL/build. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";

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
async function detail(id: string) {
  const r = await request(`/api/work-permits/${id}`); expect(r, 200, "Đọc chi tiết");
  assert.ok(r.data.sessions.length <= 2 && r.data.history.length <= 2);
  for (const type of ["sessions", "history"] as const) {
    let offset: number | null = 2;
    while (offset !== null && r.data[type].length < r.data._count[type]) {
      const older = await request(`/api/work-permits/${id}/activity?type=${type}&offset=${offset}&version=${r.data.version}`);
      expect(older, 200, "Tải thêm lịch sử theo trang"); r.data[type].push(...older.data); offset = older.meta.nextOffset;
    }
  }
  return r.data;
}
const epoch = Math.floor((Date.now() - 48 * 3600000) / 60000) * 60000;
const at = (minutes: number) => new Date(epoch + minutes * 60000).toISOString();
const workDate = new Date(epoch + 7 * 3600000).toISOString().slice(0, 10);
const base = { workType: "PLANNED", kind: "MECHANICAL", year: Number(workDate.slice(0, 4)), unit: "S1", content: `${prefix} Bảo dưỡng bơm`, location: "Bơm thử", workDate, issuerName: "Người cấp thử", leaderName: "Người lãnh đạo thử", commanderName: "CHTT dự kiến", teamName: "Nhà thầu thử", commanderPersonId: "", teamType: "CONTRACTOR", members: [], workerCount: 2, authorizerName: "", issuedAt: at(0), authorizedAt: null, closedAt: null, result: "", note: "Fixture kiểm thử local", statusReason: "", repairRequestNumber: "", status: "ISSUED" };
async function createPermit(suffix: string, patch: Record<string, unknown> = {}) { const r = await request("/api/work-permits", "POST", { ...base, number: `${prefix}_${suffix}`, ...patch }); expect(r, 200, `Tạo phiếu ${suffix}`); return r.data; }
async function person(suffix: string, patch: Record<string, unknown> = {}) { const r = await request("/api/work-permits/people", "POST", { code: `${prefix}_${suffix}`, name: `${prefix} ${suffix}`, company: "Nhà thầu thử", canCommand: true, isActive: true, ...patch }); expect(r, 200, `Thêm nhân sự ${suffix}`); return r.data; }
async function open(permit: any, commander: any, minute: number, patch: Record<string, unknown> = {}) { return request(`/api/work-permits/${permit.id}/sessions`, "POST", { action: "open", version: permit.version, commanderId: commander.id, openedAt: at(minute), authorizerName: "Người cho phép thử", workerCount: 2, members: [], ...patch }); }
async function end(permitId: string, sessionId: string, minute: number) { const p = await detail(permitId); return request(`/api/work-permits/${permitId}/sessions`, "POST", { action: "end", version: p.version, sessionId, endedAt: at(minute), endConfirmedByName: "Người kết thúc thử", endNote: "Kết thúc dữ liệu thử" }); }
async function update(id: string, patch: Record<string, unknown>, expected: number) { const p = await detail(id); const r = await request(`/api/work-permits/${id}`, "PUT", { ...p, ...patch }); expect(r, expected, "Cập nhật phiếu"); return r; }

async function main() {
  try {
    await login("MANAGER", writerCookies); await login("VIEWER", viewerCookies);
    expect(await request("/api/work-permits", "GET", undefined, new Map()), 307, "Chưa đăng nhập");
    expect(await request("/api/work-permits", "GET", undefined, new Map([["authjs.session-token", "invalid"]])), 401, "Cookie không hợp lệ");
    expect(await request("/api/work-permits", "GET", undefined, viewerCookies), 200, "Viewer tra cứu");
    expect(await request("/api/work-permits", "POST", base, viewerCookies), 403, "Viewer không tạo phiếu");
    expect(await request("/api/work-permits/people", "POST", {}, viewerCookies), 403, "Viewer không sửa danh bạ");
    const a = await person("A"), b = await person("B"), member = await person("NV", { canCommand: false }), inactive = await person("OFF", { isActive: false });
    base.commanderPersonId = a.id;
    expect(await request("/api/work-permits", "POST", { ...base, number: `${prefix}_NO_CHTT`, commanderPersonId: "" }), 400, "Cấp nhà thầu phải chọn CHTT");
    for (const commanderPersonId of [member.id, inactive.id, "missing-person"]) {
      expect(await request("/api/work-permits", "POST", { ...base, number: `${prefix}_BAD_CHTT`, commanderPersonId }), 400, "Từ chối CHTT không hợp lệ");
    }
    expect(await request("/api/work-permits/people", "POST", { ...a, code: a.code.toLowerCase() }), 409, "Mã người trùng");
    const co = await createPermit("SAME"), dien = await createPermit("SAME", { kind: "ELECTRICAL", workType: "UNPLANNED" }), internal = await createPermit("INTERNAL", { teamType: "INTERNAL" });
    assert.equal(co.issuerName, `${prefix} MANAGER`); assert.equal(co.issuerUserId, userIds[0]);
    assert.equal(co.commanderName, a.name); assert.equal(co.commanderPersonId, a.id); checks += 4;
    const draft = await createPermit("DRAFT", { status: "DRAFT", issuedAt: null, commanderPersonId: "", commanderName: "Tên không được chọn" });
    assert.equal(draft.commanderName, ""); checks++;
    await update(draft.id, { status: "ISSUED", issuedAt: at(0), commanderPersonId: b.id, issuerUserId: "FAKE", issuerName: "Tên cấp giả", commanderName: "CHTT giả" }, 200);
    const issuedDraft = await detail(draft.id);
    assert.equal(issuedDraft.issuerUserId, userIds[0]); assert.equal(issuedDraft.commanderName, b.name); checks += 2;
    const writerTwo = new Map<string, string>(); await login("MANAGER", writerTwo);
    const editIdentity = await request(`/api/work-permits/${issuedDraft.id}`, "PUT", { ...issuedDraft, issuerUserId: userIds[2], issuerName: "Đổi người cấp", commanderName: "Đổi tên giả" }, writerTwo);
    expect(editIdentity, 200, "Người khác cập nhật phiếu đã cấp");
    assert.equal(editIdentity.data.issuerUserId, userIds[0]); assert.equal(editIdentity.data.issuerName, issuedDraft.issuerName); assert.equal(editIdentity.data.commanderName, b.name); checks += 3;
    assert.equal(co.format, "PAPER"); assert.equal(internal.format, "ELECTRONIC"); checks += 2;
    const internalPaper = await createPermit("INTERNAL_PAPER", { teamType: "INTERNAL", format: "PAPER" });
    assert.equal((await detail(internalPaper.id)).format, "PAPER"); checks++;
    await update(internalPaper.id, { note: "Giữ hình thức giấy" }, 200);
    assert.equal((await detail(internalPaper.id)).format, "PAPER"); checks++;
    const contractorElectronic = await createPermit("CONTRACTOR_ELECTRONIC", { format: "ELECTRONIC" });
    assert.equal(contractorElectronic.format, "ELECTRONIC"); checks++;
    expect(await request("/api/work-permits", "POST", { ...base, number: `${prefix}_BAD_FORMAT`, format: "INVALID" }), 400, "Từ chối hình thức sai");
    const planned = await request(`/api/work-permits?kind=MECHANICAL&q=${prefix}&workType=PLANNED`); expect(planned, 200, "Lọc phiếu kế hoạch"); assert.ok(planned.data.every((p: any) => p.workType === "PLANNED")); checks++;
    const unplanned = await request(`/api/work-permits?kind=ELECTRICAL&q=${prefix}&workType=UNPLANNED`); expect(unplanned, 200, "Lọc phiếu đột xuất"); assert.equal(unplanned.data[0].id, dien.id); checks++;
    expect(await request("/api/work-permits", "POST", { ...base, number: `${prefix}_MISSING`, workType: null }), 200, "Phiếu đã cấp cho phép để trống KH/ĐX");
    expect(await request("/api/work-permits", "POST", { ...base, number: co.number }), 409, "Trùng số cùng sổ");
    expect(await open(internal, a, 60), 400, "Không áp dụng lần làm việc cho nội bộ");
    expect(await request(`/api/work-permits/${co.id}/sessions`, "POST", { action: "open" }, viewerCookies), 403, "Viewer không mở lần làm việc");
    expect(await open(co, member, 60), 400, "Người không phải CHTT");
    expect(await open(co, inactive, 60), 400, "CHTT ngừng hoạt động");
    expect(await open(co, a, -1), 400, "Mở trước khi cấp");
    expect(await open(co, a, 60, { openedAt: new Date(Date.now() + 60000).toISOString() }), 400, "Mở trong tương lai");
    const race = await Promise.all([open(co, a, 60), open(dien, a, 60)]);
    assert.deepEqual(race.map(r => r.status).sort(), [200, 409]); checks++;
    const winner = race[0].status === 200 ? co : dien, loser = winner.id === co.id ? dien : co;
    const current = race.find(r => r.status === 200)!.data;
    assert.match(race.find(r => r.status === 409)!.error, /CHTT.*PCT/); checks++;
    assert.equal(await db.workPermitSession.count({ where: { commanderId: a.id, endedAt: null } }), 1); checks++;
    console.log("Đạt: hai PCT Cơ/Điện mở đồng thời cùng CHTT chỉ một thành công.");
    expect(await request(`/api/work-permits/people/${a.id}`, "PUT", { ...a, isActive: false }), 409, "Không sửa CHTT đang làm");
    const livePerson = await request(`/api/work-permits/people?q=${a.code}`); expect(livePerson, 200, "Danh bạ hiện CHTT đang làm"); assert.equal(livePerson.data[0].activeWork.permit.number, winner.number); checks++;
    await update(winner.id, { teamType: "INTERNAL" }, 409);
    await update(winner.id, { note: "Không được sửa khi đang mở" }, 409);
    await update(winner.id, { status: "CLOSED", closedAt: at(70), result: "Đã xong" }, 409);
    expect(await end(winner.id, current.id, 59), 400, "Kết thúc trước khi mở");
    expect(await end(winner.id, current.id, 120), 200, "Kết thúc lần làm việc");
    assert.equal((await detail(winner.id)).status, "WAITING"); checks++;
    expect(await end(winner.id, current.id, 121), 409, "Kết thúc hai lần bị chặn");
    expect(await open(await detail(loser.id), a, 119), 409, "Trùng khoảng thời gian lịch sử");
    const second = await open(await detail(loser.id), a, 120, { workerCount: 99, members: [{ personId: member.id, name: "Tên gửi giả", code: "GIẢ", company: "GIẢ" }] });
    expect(second, 200, "Cho phép thời gian tiếp giáp");
    assert.equal(second.data.members[0].name, member.name); assert.equal(second.data.workerCount, 2); checks += 2;
    const memberWork = await request(`/api/work-permits/people?q=${member.code}`);
    expect(memberWork, 200, "Nhân viên hiện công tác đang mở");
    assert.ok(memberWork.data[0].activeWorks.some((work: any) => work.permit.id === loser.id && work.role === "MEMBER")); checks++;
    const commanderWork = await request(`/api/work-permits/people?q=${a.code}`);
    expect(commanderWork, 200, "CHTT hiện công tác đang mở");
    assert.ok(commanderWork.data[0].activeWorks.some((work: any) => work.permit.id === loser.id && work.role === "CHTT")); checks++;
    const other = await open(await detail(winner.id), b, 120);
    expect(other, 200, "Mở lại cùng PCT bằng CHTT khác");
    const visible = await request(`/api/work-permits?kind=${winner.kind}&q=${b.code}`); expect(visible, 200, "Tìm theo CHTT lần hiện tại"); assert.equal(visible.data.length, 1); assert.equal(visible.data[0].sessions[0].commanderName, b.name); checks += 2;
    expect(await end(winner.id, other.data.id, 1500), 200, "Làm qua ngày rồi kết thúc");
    expect(await end(loser.id, second.data.id, 180), 200, "Giải phóng CHTT A");
    const freedMember = await request(`/api/work-permits/people?q=${member.code}`);
    expect(freedMember, 200, "Nhân viên sau khi kết thúc lần làm việc");
    assert.equal(freedMember.data[0].activeWorks.length, 0); checks++;
    const personChanged = await request(`/api/work-permits/people/${a.id}`, "PUT", { ...a, name: `${prefix} A đổi tên` }); expect(personChanged, 200, "Đổi danh bạ khi không làm");
    assert.equal((await detail(winner.id)).sessions.find((s: any) => s.id === current.id).commanderName, a.name); checks++;
    await update(winner.id, { status: "CLOSED", result: "Hoàn tất", closedAt: at(1499) }, 400);
    await update(winner.id, { status: "CLOSED", result: "Hoàn tất", closedAt: at(1500) }, 200);
    await update(winner.id, { note: "Sửa sau khi đóng" }, 409);
    expect(await open(await detail(winner.id), a, 1600), 409, "Không mở lại PCT đã đóng");
    await update(loser.id, { status: "CANCELLED", statusReason: "Kết thúc thử nghiệm" }, 200);
    expect(await request("/api/work-permits", "POST", { ...base, kind: loser.kind, number: loser.number }), 409, "Phiếu hủy vẫn giữ số");
    await update(internal.id, { status: "ACTIVE", authorizedAt: at(60), authorizerName: "Cho phép nội bộ" }, 200);
    await update(internal.id, { status: "PAUSED", statusReason: "Tạm dừng" }, 200);
    await update(internal.id, { status: "ACTIVE" }, 200);
    await update(internal.id, { status: "CLOSED", result: "Xong", closedAt: at(120) }, 200);
    const c = await person("HANDOFF_C"), d = await person("HANDOFF_D");
    const hp = await createPermit("HANDOFF", { workerCount: null, members: [], commanderPersonId: c.id });
    assert.equal(hp.workerCount, 1); checks++;
    const hs = await open(hp, c, 10, { workerCount: null }); expect(hs, 200, "CHTT làm một mình");
    assert.equal(hs.data.workerCount, 1); checks++;
    const blocker = await createPermit("BLOCKER", { commanderPersonId: d.id });
    const bs = await open(blocker, d, 10); expect(bs, 200, "CHTT mới đang bận phiếu khác");
    const transfer = async (p: any, atMinute: number, target = d.id) => request(`/api/work-permits/${p.id}/sessions`, "POST", { action: "handoff", version: p.version, sessionId: hs.data.id, commanderId: target, openedAt: at(atMinute), authorizerName: "Người bàn giao", members: [] });
    expect(await transfer(await detail(hp.id), 20), 409, "Bàn giao bị chặn khi CHTT bận");
    const untouched = await detail(hp.id); assert.equal(untouched.sessions.length, 1); assert.equal(untouched.sessions[0].endedAt, null); assert.equal(untouched.status, "ACTIVE"); checks += 3;
    expect(await transfer(untouched, 20, c.id), 400, "Không bàn giao cho chính mình");
    expect(await end(blocker.id, bs.data.id, 20), 200, "Giải phóng CHTT nhận bàn giao");
    expect(await transfer(await detail(hp.id), 9), 400, "Không bàn giao trước khi mở");
    const ready = await detail(hp.id);
    const transfers = await Promise.all([transfer(ready, 20), transfer(ready, 20)]);
    assert.deepEqual(transfers.map(r => r.status).sort(), [200, 409]); checks++;
    const handed = await detail(hp.id); const old = handed.sessions.find((s: any) => s.id === hs.data.id); const fresh = handed.sessions.find((s: any) => !s.endedAt);
    assert.equal(handed.status, "ACTIVE"); assert.equal(fresh.commanderId, d.id); assert.equal(old.endedAt, fresh.openedAt); assert.equal(handed.sessions.length, 2); assert.equal(fresh.workerCount, 1); checks += 5;
    const freed = await createPermit("FREED", { commanderPersonId: c.id });
    const alone = await open(freed, c, 20, { members: [{ personId: c.id, code: c.code, name: c.name, company: c.company }] });
    expect(alone, 200, "CHTT cũ được giải phóng đúng giờ bàn giao"); assert.equal(alone.data.workerCount, 1); assert.equal(alone.data.members.length, 0); checks += 2;
    const editable = await createPermit("EDIT");
    const edits = await Promise.all([request(`/api/work-permits/${editable.id}`, "PUT", { ...editable, note: "Một" }), request(`/api/work-permits/${editable.id}`, "PUT", { ...editable, note: "Hai" })]);
    assert.deepEqual(edits.map(r => r.status).sort(), [200, 409]); checks++;
    const light = await request(`/api/work-permits/${hp.id}`);
    expect(light, 200, "Chi tiết tải nhẹ");
    assert.equal(light.data.history.length, 2); assert.ok(!("before" in light.data.history[0])); checks += 2;
    const historyData = await request(`/api/work-permits/${hp.id}/history/${light.data.history[0].id}`);
    expect(historyData, 200, "Tải nội dung một cập nhật"); assert.ok(historyData.data.after); checks++;
    expect(await request(`/api/work-permits/${blocker.id}/history/${light.data.history[0].id}`), 404, "Không lấy lịch sử thuộc phiếu khác");
    expect(await request(`/api/work-permits/${hp.id}/activity?type=history&offset=2&version=1`), 409, "Không ghép trang lịch sử khác phiên bản");
    expect(await request(`/api/work-permits/${hp.id}/activity?type=bad&offset=2&version=${light.data.version}`), 400, "Từ chối bộ lọc lịch sử sai");
    const employees = await request(`/api/work-permits/employees?q=${prefix}&page=1`);
    expect(employees, 200, "Nhân sự website phân trang"); assert.ok(employees.data.length <= 20); assert.ok(employees.data.every((u: any) => !('email' in u) && !('phone' in u))); checks += 2;
    expect(await request(`/api/work-permits/employees?page=-1`), 400, "Trang nhân sự sai");
    const nextYear = await createPermit("YEAR_RESET", { number: `${prefix}_SAME`, year: base.year + 1, workDate: `${base.year + 1}-01-01`, issuedAt: `${base.year + 1}-01-01T00:00:00+07:00` });
    assert.equal(nextYear.number, co.number); checks++;
    const yearFile = await fetch(`${origin}/api/work-permits/export?kind=MECHANICAL&year=${base.year + 1}&q=${prefix}`, { headers: { Cookie: cookiesHeader(writerCookies) } });
    assert.equal(yearFile.status, 200); checks++;
    const yearBook = new ExcelJS.Workbook(); await yearBook.xlsx.load(await yearFile.arrayBuffer());
    assert.equal(yearBook.worksheets.length, 1); assert.equal(yearBook.worksheets[0].rowCount, 4); assert.match(String(yearBook.worksheets[0].getCell("A2").value), new RegExp(String(base.year + 1))); checks += 3;
    expect(await request('/api/work-permits/export?year=abc'), 400, "Từ chối năm xuất sai");
    const employeeSearch = await request('/api/work-permits/employees?q=truong%20ca');
    expect(employeeSearch, 200, "Tìm nhân sự không dấu"); assert.ok(employeeSearch.meta.total >= 3); checks++;
    const longHistory = await createPermit("LONG_HISTORY");
    let versioned = longHistory;
    for (let i = 0; i < 14; i++) {
      const changed = await request(`/api/work-permits/${longHistory.id}`, "PUT", { ...versioned, note: `Cập nhật thử ${i}` }); expect(changed, 200, "Tạo lịch sử phân trang"); versioned = changed.data;
    }
    const firstHistory = await request(`/api/work-permits/${longHistory.id}`);
    expect(firstHistory, 200, "Lịch sử dài chỉ lấy hai mục đầu"); assert.equal(firstHistory.data.history.length, 2); checks++;
    const moreHistory = await request(`/api/work-permits/${longHistory.id}/activity?type=history&offset=2&version=${versioned.version}`);
    expect(moreHistory, 200, "Trang lịch sử 10 mục"); assert.equal(moreHistory.data.length, 10); assert.equal(moreHistory.meta.nextOffset, 12); checks += 2;
    const finalHistory = await request(`/api/work-permits/${longHistory.id}/activity?type=history&offset=12&version=${versioned.version}`);
    expect(finalHistory, 200, "Trang cuối lịch sử"); assert.equal(finalHistory.data.length, 3); assert.equal(finalHistory.meta.nextOffset, null); checks += 2;
    const allHistoryIds = [...firstHistory.data.history, ...moreHistory.data, ...finalHistory.data].map((h: any) => h.id);
    assert.equal(new Set(allHistoryIds).size, 15); checks++;
    const firstPage = await request(`/api/work-permits?kind=MECHANICAL&q=${prefix}&page=1`);
    const secondPage = await request(`/api/work-permits?kind=MECHANICAL&q=${prefix}&page=2`);
    expect(firstPage, 200, "Trang đầu 10 phiếu"); expect(secondPage, 200, "Trang tiếp theo");
    assert.ok(firstPage.data.every((p: any) => !("members" in p) && !("searchText" in p))); checks++;
    assert.equal(firstPage.meta.pageSize, 10); assert.equal(firstPage.data.length, 10);
    assert.equal(secondPage.data.length, Math.min(10, firstPage.meta.total - 10));
    assert.ok(secondPage.data.every((p: any) => !firstPage.data.some((first: any) => first.id === p.id))); checks += 4;
    const history = await detail(winner.id); assert.equal(history.history.length, 6); assert.equal(history.sessions.length, 2); checks += 2;
    const pageResponse = await fetch(origin + "/work-permits", { headers: { Cookie: cookiesHeader(writerCookies) } });
    assert.equal(pageResponse.status, 200); assert.match(await pageResponse.text(), /Sổ cấp phiếu công tác/); checks += 2;
    const exporter = await fetch(`${origin}/api/work-permits/export?kind=${winner.kind}&q=${prefix}`, { headers: { Cookie: cookiesHeader(writerCookies) } }); assert.equal(exporter.status, 200); checks++;
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await exporter.arrayBuffer());
    assert.equal(workbook.worksheets[0].getCell("A3").value, "STT (KH/ĐX)"); assert.equal(workbook.worksheets[0].getCell("A4").value, winner.kind === "MECHANICAL" ? "KH" : "ĐX"); checks += 2;
    assert.equal(workbook.worksheets.length, 1); assert.equal(workbook.worksheets[0].name, "Sổ cấp PCT"); assert.equal(workbook.worksheets[0].getCell("O3").value, "Loại đơn vị"); assert.ok(!(workbook.worksheets[0].getRow(3).values as unknown[]).includes("Trạng thái")); checks += 4;
    console.log(`Đạt ${checks} kiểm tra API/DB: phân quyền, vòng đời, đồng thời, thời gian, lịch sử, danh sách nhân viên và Excel.`);
  } finally {
    const own = await db.workPermit.findMany({ where: { createdById: { in: userIds } }, select: { id: true } });
    const ids = own.map(p => p.id);
    await new Promise(resolve => setTimeout(resolve, 250));
    await db.$transaction(async tx => {
      await tx.workPermitSession.deleteMany({ where: { permitId: { in: ids } } });
      await tx.workPermitHistory.deleteMany({ where: { permitId: { in: ids } } });
      await tx.workPermit.deleteMany({ where: { id: { in: ids } } });
      await tx.workPermitPerson.deleteMany({ where: { code: { startsWith: prefix } } });
      await tx.auditLog.deleteMany({ where: { userId: { in: userIds } } });
      await tx.systemAuditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
    });
    assert.equal(await db.workPermit.count({ where: { createdById: { in: userIds } } }), 0);
    assert.equal(await db.workPermitPerson.count({ where: { code: { startsWith: prefix } } }), 0);
    console.log("Đã dọn dữ liệu và tài khoản thử riêng.");
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
