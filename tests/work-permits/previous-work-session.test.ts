import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as overhaul from "../../lib/work-permit-overhaul";

const at = (day: number, hour: number) => new Date(`2026-10-${day}T${String(hour).padStart(2, "0")}:00:00+07:00`);
const worker = { personId: "worker-1", code: "NV1", name: "Nguyễn Văn A", company: "Nhà thầu A" };
function session(id: string, openedAt: Date, endedAt: Date | null, endNote = "", members = [worker]) {
  return { id, permitId: "permit-1", commanderName: `CHTT ${id}`, openedAt, endedAt, endNote, members };
}
const completed = session("previous-day", at(11, 8), at(11, 17));
const handoff = session("handoff", at(13, 8), at(13, 9), "Bàn giao CHTT cho CHTT mới.", []);
const live = session("live", at(13, 9), null, "", []);

type PreviousWhere = { permitId: string; endedAt: { not: null; lte: Date }; NOT: { endNote: { startsWith: string } } };
function harness(sessions: ReturnType<typeof session>[], scope = "OVERHAUL", denied = false) {
  let previousReads = 0, detailReads = 0;
  const fail = (message: string, status: number) => Response.json({ error: message }, { status });
  const sorted = [...sessions].sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime() || b.id.localeCompare(a.id));
  const prisma = {
    workPermit: { findUnique: async (args: { include: { sessions: { take: number } } }) => {
      detailReads++;
      assert.equal(args.include.sessions.take, 2, "Giữ phân trang lịch sử hiện tại");
      return { id: "permit-1", teamType: "CONTRACTOR", contractorScope: scope, format: "PAPER", status: "ACTIVE", overhaulItems: [],
        sessions: sorted.filter(row => row.permitId === "permit-1").slice(0, 2), _count: { sessions: sessions.length, history: 0 }, history: [] };
    } },
    workPermitSession: { findFirst: async ({ where }: { where: PreviousWhere }) => {
      previousReads++;
      return sorted.find(row => row.permitId === where.permitId && row.endedAt && row.endedAt <= where.endedAt.lte
        && !row.endNote.startsWith(where.NOT.endNote.startsWith)) ?? null;
    } },
  };
  const modules: Record<string, unknown> = {
    "@/lib/api": { requireUser: async () => ({ role: "TECHNICIAN" }), fail, ok: (data: unknown) => Response.json({ data, error: null }) },
    "@/lib/server/work-permit-prisma": { workPermitPrisma: prisma },
    "@/lib/server/work-permit-scope": { requirePermitVisible: async () => { if (denied) throw fail("Không có quyền xem phiếu", 403); } },
    "@/lib/server/work-permit-permissions": { permitCapabilities: async () => ({}), permitRowCapabilities: () => ({}) },
    "@/lib/server/work-permits": { permitHandle: async (fn: () => Promise<Response>) => { try { return await fn(); } catch (error) { if (error instanceof Response) return error; throw error; } } },
    "@/lib/work-permit-overhaul": overhaul,
  };
  const source = ts.transpileModule(readFileSync("app/api/work-permits/[id]/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} as { GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response> } };
  new Function("require", "module", "exports", source)((name: string) => modules[name] ?? {}, loaded, loaded.exports);
  return { call: () => loaded.exports.GET(new Request("http://localhost/api/work-permits/permit-1"), { params: Promise.resolve({ id: "permit-1" }) }),
    previousReads: () => previousReads, detailReads: () => detailReads };
}

test("Sau đổi CHTT, lấy danh sách ngày trước nằm ngoài 2 lượt gần nhất", async () => {
  const h = harness([completed, handoff, live]);
  const { data } = await (await h.call()).json();
  assert.deepEqual(data.sessions.map((s: { id: string }) => s.id), [live.id, handoff.id]);
  assert.equal(data.previousWorkSession.id, completed.id);
  assert.deepEqual(data.previousWorkSession.members, [worker]);
});

test("Bỏ qua nhiều bàn giao, cả lượt có nhân viên, và giữ lượt kết thúc thực sự gần nhất", async () => {
  const older = session("older", at(10, 8), at(10, 17));
  const earlierHandoff = session("handoff-1", at(12, 8), at(12, 9), "Bàn giao CHTT cho CHTT khác.");
  const h = harness([older, completed, earlierHandoff, handoff, live]);
  assert.equal((await (await h.call()).json()).data.previousWorkSession.id, completed.id);
});

test("Không lấy lượt của phiếu khác hoặc lượt kết thúc sau giờ mở hiện tại", async () => {
  const other = { ...session("other-permit", at(13, 8), at(13, 9)), permitId: "permit-2" };
  const later = session("future-end", at(13, 8), at(13, 10));
  const h = harness([completed, other, later, live]);
  assert.equal((await (await h.call()).json()).data.previousWorkSession.id, completed.id);
});

test("Chưa có lượt công việc kết thúc thì không lấy lượt bàn giao làm danh sách cũ", async () => {
  const h = harness([handoff, live]);
  assert.equal((await (await h.call()).json()).data.previousWorkSession, null);
});

test("Lượt kết thúc thực sự không có nhân viên vẫn là lượt trước, không lùi sang ngày khác", async () => {
  const empty = session("empty-completed", at(12, 8), at(12, 17), "Đã thu dọn", []);
  const h = harness([completed, empty, handoff, live]);
  const previous = (await (await h.call()).json()).data.previousWorkSession;
  assert.equal(previous.id, empty.id);
  assert.deepEqual(previous.members, []);
});

test("Phiếu không có lượt mở hoặc không thuộc đại tu không tải danh sách cho vào lại", async () => {
  for (const h of [harness([completed]), harness([completed, live], "SCTX")]) {
    assert.equal((await (await h.call()).json()).data.previousWorkSession, null);
    assert.equal(h.previousReads(), 0);
  }
});

test("Kiểm tra quyền xem trước khi đọc danh sách nhân sự", async () => {
  const h = harness([completed, handoff, live], "OVERHAUL", true);
  assert.equal((await h.call()).status, 403);
  assert.equal(h.detailReads(), 0);
  assert.equal(h.previousReads(), 0);
});
