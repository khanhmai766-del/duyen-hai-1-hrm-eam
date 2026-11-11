import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as crypto from "node:crypto";
import test from "node:test";
import ts from "typescript";
import * as XLSX from "xlsx";
import { readProcedureImport } from "../../lib/procedure-import";

type Row = Record<string, any>;
function load(file: string, imports: Row) {
  const mod = { exports: {} as Row };
  new Function("require", "module", "exports", ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)((name: string) => { assert.ok(name in imports, `Thiếu mock ${name}`); return imports[name]; }, mod, mod.exports);
  return mod.exports;
}
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, v]: [string, any]) => {
    if (v === undefined) return true;
    if (v instanceof Date) return row[key]?.getTime() === v.getTime();
    if (v && typeof v === "object") {
      if ("in" in v) return v.in.includes(row[key]);
      if ("not" in v) return row[key] !== v.not;
    }
    return row[key] === v;
  });
}
const fail = (error: string, status = 400) => Response.json({ error }, { status });
function fixture() {
  let state: Row = { digitalDocument: [], aiKnowledgeDocument: [], aiKnowledgeChunk: [], forumPost: [], forumReply: [], user: [] };
  let serial = 0, failure = "", tail = Promise.resolve(), embeddingHook = async () => {};
  const writes: string[] = [], locks: string[] = [];
  const db: Row = {};
  for (const model of Object.keys(state)) {
    const find = (where: Row = {}) => state[model].filter((r: Row) => matches(r, where));
    const check = (action: string) => { writes.push(`${model}.${action}`); if (failure === `${model}.${action}`) throw Error("Giả lập lỗi ghi"); };
    db[model] = {
      findMany: async ({ where }: Row = {}) => structuredClone(find(where)),
      findUnique: async ({ where }: Row) => structuredClone(find(where)[0] ?? null),
      findFirst: async ({ where }: Row) => structuredClone(find(where)[0] ?? null),
      create: async ({ data }: Row) => { check("create"); const r = { id: `new-${++serial}`, ...structuredClone(data) }; state[model].push(r); return structuredClone(r); },
      update: async ({ where, data }: Row) => { check("update"); const r = find(where)[0]; assert.ok(r); Object.assign(r, structuredClone(data)); return structuredClone(r); },
      updateMany: async ({ where, data }: Row) => { check("updateMany"); const rows = find(where); rows.forEach((r: Row) => Object.assign(r, structuredClone(data))); return { count: rows.length }; },
      delete: async ({ where }: Row) => { check("delete"); const r = find(where)[0]; assert.ok(r); state[model] = state[model].filter((x: Row) => x !== r); return r; },
      deleteMany: async ({ where }: Row) => { check("deleteMany"); const rows = find(where); state[model] = state[model].filter((r: Row) => !rows.includes(r));
        if (model === "aiKnowledgeDocument") state.aiKnowledgeChunk = state.aiKnowledgeChunk.filter((r: Row) => !rows.some((d: Row) => d.id === r.documentId));
        return { count: rows.length }; },
      createMany: async ({ data }: Row) => { check("createMany"); state[model].push(...structuredClone(data)); return { count: data.length }; },
      upsert: async ({ where, create, update }: Row) => { check("upsert"); const r = find(where)[0]; if (r) { Object.assign(r, structuredClone(update)); return structuredClone(r); }
        state[model].push(structuredClone(create)); return structuredClone(create); },
    };
  }
  db.$queryRaw = async () => [{ now: new Date("2026-11-11T08:00:00Z"), ready: true }];
  db.$transaction = async (fn: (tx: Row) => Promise<unknown>) => {
    let unlock: (() => void) | undefined, snapshot: Row | undefined;
    const tx = { ...db, $queryRaw: async (sql: TemplateStringsArray) => {
      if (/FOR UPDATE|advisory/.test(sql.join("?"))) {
        locks.push(sql.join("?"));
        if (!unlock) { const previous = tail; tail = new Promise<void>(r => { unlock = r; }); await previous; snapshot = structuredClone(state); }
      }
      return [{ now: new Date("2026-11-11T08:00:00Z") }];
    } };
    try { return await fn(tx); } catch (e) { if (snapshot) state = snapshot; throw e; } finally { unlock?.(); }
  };
  const api = { fail, requireUser: async () => ({ id: "owner", role: "ADMIN" }), audit: async () => {}, ok: (data: unknown) => Response.json({ data }),
    handle: async (fn: () => Promise<Response>) => { try { return await fn(); } catch (e) { return e instanceof Response ? e : fail(String(e), 500); } } };
  const embedding = { AI_EMBEDDING_DIMENSIONS: 3, AI_EMBEDDING_MODEL: "test", embedTexts: async () => { await embeddingHook(); return [[1, 0, 0]]; } };
  const index = load("lib/document-ai-index.ts", { "node:crypto": crypto, "@/lib/ai-embedding": embedding, "@/lib/ai-knowledge": {
    AI_KNOWLEDGE_CHUNKER_VERSION: 1, cleanExtractedPdfText: (s: string) => s, chunkKnowledgeText: (s: string) => [{ chunkIndex: 0, heading: null, content: s }],
  } });
  const lifecycle = load("lib/server/document-lifecycle.ts", { "@/lib/api": api, "@/lib/document-ai-index": index });
  const google = load("lib/google-drive-document.ts", {});
  const candidates = load("lib/document-drive-candidates.ts", { "@/lib/google-drive-document": google });
  const imports: Row = { "node:crypto": crypto, "@/lib/prisma": { prisma: db }, "@/lib/api": api, "@/lib/document-ai-index": index,
    "@/lib/server/document-lifecycle": lifecycle, "./document-lifecycle": lifecycle, "@/lib/google-drive-document": google,
    "@/lib/document-read-access": { requireDigitalDocumentPermission: async () => {} }, "@/lib/document-drive-candidates": candidates,
    "@/lib/rbac-guard": { requirePermissionLevel: async () => {}, hasPermissionLevel: async () => false },
    "@/lib/nav": { normalizeText: (s: string) => s.toLowerCase().trim() },
    "@/lib/s3": { maybeUploadDataUrlList: async (v: unknown) => v, publicUserRef: (v: unknown) => v },
    "@/lib/ai-knowledge-store": { invalidateAiKnowledgeCache: () => {} },
    "@/lib/forum-targets": { normalizeForumTargetPositions: (v: unknown) => v ?? [] },
  };
  imports["@/lib/server/digital-document"] = load("lib/server/digital-document.ts", imports);
  imports["@/lib/server/forum"] = load("lib/server/forum.ts", imports);
  imports["@/lib/server/document-drive-update"] = load("lib/server/document-drive-update.ts", imports);
  const routes = Object.fromEntries(["documents", "documents/import", "documents/[id]/select-drive-file", "forum/[id]", "forum/[id]/replies", "forum/replies/[id]"].map(path => [path, load(`app/api/${path}/route.ts`, imports)]));
  imports["@/lib/document-drive-sync"] = { verifyN8nDocumentSyncToken: () => true };
  imports["@/lib/ai-embedding"] = embedding;
  imports["@/lib/ai-knowledge"] = { knowledgeEmbeddingText: (_title: string, chunk: Row) => chunk.content };
  imports["@/lib/tcms/server/pdf/pdf-preview"] = { extractPdfPreview: async () => ({ text: "PDF text", source: "text", pageCount: 1 }) };
  routes.index = load("app/api/integrations/n8n/documents/index/route.ts", imports);
  return { db, routes, imports, index, lifecycle, writes, locks, tables: () => state, fail: (action: string) => { failure = action; },
    onEmbedding: (fn: () => Promise<void>) => { embeddingHook = fn; } };
}
const req = (body: Row = {}, query = "") => ({ json: async () => body, nextUrl: new URL(`http://localhost/api/documents?${query}`) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
function document(f: ReturnType<typeof fixture>) {
  const d = { id: "doc", category: "PROCEDURE", title: "Quy trình", documentUrl: "https://drive.google.com/drive/folders/oldfolder12345", decisionNumber: null,
    issueDate: null, managingPosition: null, managementBlock: null, attachmentUrls: "[]", driveFolderId: "oldfolder12345", driveFileId: "oldfile1234567",
    driveManualFileId: "oldfile1234567", driveModifiedAt: null, driveChecksum: "old", driveSyncStatus: "SYNCED", aiIndexedAt: new Date(),
    aiIndexVersion: f.index.buildDocumentAiIndexVersion({ driveChecksum: "old" }), aiIndexError: null, driveCandidateFiles: "[]" };
  f.tables().digitalDocument.push(d);
  f.tables().aiKnowledgeDocument.push({ id: "kb", sourcePath: "digital-document:doc" });
  f.tables().aiKnowledgeChunk.push({ documentId: "kb", content: "old" });
  return d;
}

test("đổi link xóa trạng thái Drive/AI cũ; lỗi giữa chừng hoàn tác cả chỉ mục", async () => {
  for (const failure of ["", "digitalDocument.update"]) {
    const f = fixture(), d = document(f), before = structuredClone(f.tables()); f.fail(failure);
    const response = await f.routes.documents.PUT(req({ ...d, issueDate: null, documentUrl: "https://drive.google.com/drive/folders/newfolder12345" }));
    assert.equal(response.status, failure ? 500 : 200);
    if (failure) assert.deepEqual(f.tables(), before);
    else { assert.equal(f.tables().digitalDocument[0].driveFileId, null); assert.equal(f.tables().digitalDocument[0].driveManualFileId, null);
      assert.equal(f.tables().digitalDocument[0].aiIndexVersion, null); assert.equal(f.tables().aiKnowledgeChunk.length, 0); }
    assert.ok(f.locks.some(s => s.includes("FOR UPDATE")));
  }
});
test("sửa ghi chú giữ nguyên chỉ mục; xóa tài liệu xóa cả tri thức trong cùng giao dịch", async () => {
  const f = fixture(), d = document(f);
  assert.equal((await f.routes.documents.PUT(req({ ...d, note: "Ghi chú mới" }))).status, 200);
  assert.equal(f.tables().aiKnowledgeChunk.length, 1);
  f.fail("digitalDocument.delete"); const before = structuredClone(f.tables());
  assert.equal((await f.routes.documents.DELETE(req({}, "id=doc&category=PROCEDURE"))).status, 500); assert.deepEqual(f.tables(), before);
  f.fail(""); assert.equal((await f.routes.documents.DELETE(req({}, "id=doc&category=PROCEDURE"))).status, 200);
  assert.equal(f.tables().aiKnowledgeDocument.length, 0); assert.equal(f.tables().aiKnowledgeChunk.length, 0);
});
test("đồng bộ không ghi đè nguồn mới hoặc PDF đã chọn lại", async () => {
  const f = fixture(); document(f);
  const record = { documentId: "doc", driveFolderId: "newfolder12345", driveFileId: "newfile1234567", driveSyncStatus: "SYNCED", driveChecksum: "new" };
  const before = structuredClone(f.tables());
  for (const r of [record, { ...record, driveFolderId: "oldfolder12345" }]) await assert.rejects(f.db.$transaction((tx: Row) => f.imports["@/lib/server/document-drive-update"].applyDocumentDriveSync(tx, r)), (e: unknown) => e instanceof Response && e.status === 409);
  assert.deepEqual(f.tables(), before);
});
test("lỗi Drive cho link file trực tiếp chỉ đổi trạng thái lỗi, giữ metadata và nội dung để đối chiếu", async () => {
  const f = fixture(), d = document(f); d.documentUrl = `https://drive.google.com/file/d/${d.driveFileId}/view`;
  const version = d.aiIndexVersion;
  await f.db.$transaction((tx: Row) => f.imports["@/lib/server/document-drive-update"].applyDocumentDriveSync(tx, {
    documentId: d.id, driveFolderId: null, driveFileId: null, driveSyncStatus: "ERROR", driveSyncError: "Không đọc được Drive",
  }));
  assert.equal(f.tables().digitalDocument[0].driveSyncStatus, "ERROR");
  assert.equal(f.tables().digitalDocument[0].driveFileId, d.driveFileId);
  assert.equal(f.tables().digitalDocument[0].aiIndexVersion, version);
  assert.equal(f.tables().aiKnowledgeChunk.length, 1);
});
test("nạp AI thành công dùng ID upsert thật; kết quả cũ không được ghi sau khi PDF thay đổi", async () => {
  for (const changed of [false, true]) {
    const f = fixture(), d = document(f);
    d.aiIndexVersion = null;
    if (changed) f.onEmbedding(async () => { f.tables().digitalDocument[0].driveFileId = "newfile1234567"; });
    const request = { nextUrl: new URL(`http://localhost?documentId=doc&fileId=${d.driveFileId}`), headers: new Headers({ "content-type": "application/pdf" }), arrayBuffer: async () => new TextEncoder().encode("pdf").buffer };
    const response = await f.routes.index.POST(request);
    assert.equal(response.status, changed ? 409 : 200);
    assert.equal(f.tables().aiKnowledgeChunk[0].content, changed ? "old" : "PDF text");
    if (!changed) assert.equal(f.tables().aiKnowledgeChunk[0].documentId, "kb");
  }
});
test("công tắc tạm dừng AI từ chối trước mọi ghi dữ liệu", async () => {
  const previous = process.env.DOCUMENT_AI_INDEX_PAUSED;
  try { process.env.DOCUMENT_AI_INDEX_PAUSED = "1"; const f = fixture();
    assert.equal((await f.routes.index.POST({ headers: new Headers() })).status, 503); assert.equal(f.writes.length, 0);
  } finally { if (previous === undefined) delete process.env.DOCUMENT_AI_INDEX_PAUSED; else process.env.DOCUMENT_AI_INDEX_PAUSED = previous; }
});
test("AI loại nguồn cần chọn PDF, sai phiên bản và mồ côi ngay cả khi vector còn cache", async () => {
  const f = fixture(), valid = document(f);
  const state = f.tables();
  state.digitalDocument.push({ ...valid, id: "review", driveSyncStatus: "NEEDS_REVIEW" }, { ...valid, id: "stale", aiIndexVersion: "old-version" });
  state.aiKnowledgeDocument.push({ id: "review-kb", sourcePath: "digital-document:review", category: "quy-trinh", title: "Review" },
    { id: "orphan-kb", sourcePath: "digital-document:missing", category: "quy-trinh", title: "Missing" },
    { id: "static-kb", sourcePath: "public/static.pdf", category: "quy-trinh", title: "Static" },
    { id: "stale-kb", sourcePath: "digital-document:stale", category: "quy-trinh", title: "Stale" });
  Object.assign(state.aiKnowledgeDocument[0], { category: "quy-trinh", title: "Valid" });
  for (const d of state.aiKnowledgeDocument.slice(1)) state.aiKnowledgeChunk.push({ documentId: d.id, content: d.title });
  let loads = 0, sqlText = "", sqlValues: unknown[] = [];
  f.db.aiKnowledgeChunk.findMany = async () => { loads++; return state.aiKnowledgeChunk.map((c: Row) => ({ ...c,
    document: state.aiKnowledgeDocument.find((d: Row) => d.id === c.documentId) })); };
  f.db.$queryRaw = async (sql: TemplateStringsArray, ...values: unknown[]) => {
    sqlText = sql.join("?"); sqlValues = values;
    return sqlText.includes("information_schema") ? [{ ready: true }] : [];
  };
  const globals = globalThis as Row; delete globals.__dh1AiKnowledge; delete globals.__dh1AiKnowledgeVec;
  const store = load("lib/ai-knowledge-store.ts", { ...f.imports, "@/lib/rbac-permissions": { hasAssignedPermissionLevel: async () => true },
    "@/lib/ai-knowledge": { AI_KNOWLEDGE_CATEGORIES: {}, AI_KNOWLEDGE_MAX_PER_DOCUMENT: 2, AI_KNOWLEDGE_MAX_RESULTS: 5, AI_KNOWLEDGE_MIN_SCORE: 0.5 } });
  try {
    assert.deepEqual((await store.getAiKnowledgeChunks()).map((c: Row) => c.sourcePath), ["digital-document:doc", "public/static.pdf"]);
    await store.searchAiKnowledgeChunksInDb([1, 0, 0], ["quy-trinh"]);
    assert.ok(sqlText.includes('source."driveSyncStatus"'));
    assert.ok(sqlValues.some(v => Array.isArray(v) && v.length === 1 && v[0] === "digital-document:doc"));
    valid.driveSyncStatus = "NEEDS_REVIEW";
    assert.deepEqual((await store.getAiKnowledgeChunks()).map((c: Row) => c.sourcePath), ["public/static.pdf"]);
    assert.equal(loads, 1);
  } finally { delete globals.__dh1AiKnowledge; delete globals.__dh1AiKnowledgeVec; }
});
test("chọn PDF trong danh sách hiện tại xóa chỉ mục cũ; ID ngoài danh sách không được lưu", async () => {
  const f = fixture(), d = document(f);
  d.driveCandidateFiles = JSON.stringify([{ id: "newfile1234567", name: "New.pdf", mimeType: "application/pdf" }]);
  const route = f.routes["documents/[id]/select-drive-file"];
  assert.equal((await route.PUT(req({ fileId: "outside1234567" }), params("doc"))).status, 409);
  assert.equal((await route.PUT(req({ fileId: "newfile1234567" }), params("doc"))).status, 200);
  assert.equal(f.tables().digitalDocument[0].driveManualFileId, "newfile1234567");
  assert.equal(f.tables().aiKnowledgeChunk.length, 0);
});
test("xác nhận lại cùng PDF giữ chỉ mục hợp lệ; yêu cầu nạp cho file cũ không đè lỗi nguồn mới", async () => {
  const f = fixture(), d = document(f);
  d.driveCandidateFiles = JSON.stringify([{ id: d.driveFileId, name: "Old.pdf", mimeType: "application/pdf", md5Checksum: "old" }]);
  const version = d.aiIndexVersion;
  assert.equal((await f.routes["documents/[id]/select-drive-file"].PUT(req({ fileId: d.driveFileId }), params("doc"))).status, 200);
  assert.equal(f.tables().aiKnowledgeChunk.length, 1); assert.equal(f.tables().digitalDocument[0].aiIndexVersion, version);
  const before = structuredClone(f.tables());
  const response = await f.routes.index.POST({ nextUrl: new URL("http://localhost?documentId=doc&fileId=wrongfile12345"), headers: new Headers({ "content-type": "application/pdf" }) });
  assert.equal(response.status, 409); assert.deepEqual(f.tables(), before);
});
test("nạp AI lỗi khi ghi đoạn phải giữ nội dung cũ; xóa trong lúc trích PDF không sinh bản ghi mồ côi", async () => {
  for (const removed of [false, true]) {
    const f = fixture(), d = document(f); d.aiIndexVersion = null;
    if (removed) f.onEmbedding(async () => { assert.equal((await f.routes.documents.DELETE(req({}, "id=doc&category=PROCEDURE"))).status, 200); });
    else f.fail("aiKnowledgeChunk.createMany");
    const response = await f.routes.index.POST({ nextUrl: new URL(`http://localhost?documentId=doc&fileId=${d.driveFileId}`),
      headers: new Headers({ "content-type": "application/pdf" }), arrayBuffer: async () => new Uint8Array([1]).buffer });
    assert.equal(response.status, removed ? 409 : 500);
    assert.equal(f.tables().aiKnowledgeDocument.length, removed ? 0 : 1);
    if (!removed) assert.equal(f.tables().aiKnowledgeChunk[0].content, "old");
  }
});
test("quyền danh mục và mở file dùng chung mức quyền; tài khoản tra cứu vẫn đọc được tab đã cấp", async () => {
  const calls: Row[] = []; let gates = 0;
  const permission = load("lib/document-read-access.ts", {
    "@/lib/archive-permissions": { archiveCategoryPermissionId: (category: string) => category === "OIL_GUN_DATA" ? "archive-oil-gun-data" : null },
    "@/lib/rbac-guard": { requirePermissionLevel: async (_user: Row, id: string, levels: string[]) => calls.push({ id, levels }) },
    "@/lib/oil-soot-access": { OIL_SOOT_GATED_CATEGORIES: new Set(["OIL_GUN_DATA"]) },
    "@/lib/server-access": { assertOilSootAccess: async () => { gates++; } },
  });
  await permission.requireDigitalDocumentReadPermission({ accessMode: "DEFECT_READ_ONLY" }, "OIL_GUN_DATA");
  assert.equal(gates, 0); assert.equal(calls[0].id, "archive-oil-gun-data");
  await permission.requireDigitalDocumentPermission({}, "PROCEDURE", "create");
  await permission.requireDigitalDocumentPermission({}, "PID", "manage");
  await permission.requireDigitalDocumentPermission({}, "ARCHIVE", "delete");
  assert.deepEqual(calls.slice(1), [{ id: "document-procedure", levels: ["personal", "manage", "full"] },
    { id: "document-pid", levels: ["manage", "full"] }, { id: "archive-create-delete", levels: ["manage", "full"] }]);
});
test("nhập batch có lỗi không lưu dở; nhập lại và nhập đồng thời không tạo trùng", async () => {
  const f = fixture(), rows = [{ title: "A", documentUrl: "https://example.com/a" }, { title: "B", documentUrl: "https://example.com/b" }];
  const create = f.db.digitalDocument.create; let count = 0;
  f.db.digitalDocument.create = async (args: Row) => { if (++count === 2) throw Error("Lỗi dòng 2"); return create(args); };
  assert.equal((await f.routes["documents/import"].POST(req({ documents: rows }))).status, 500); assert.equal(f.tables().digitalDocument.length, 0);
  f.db.digitalDocument.create = create;
  const responses = await Promise.all([1, 2].map(() => f.routes["documents/import"].POST(req({ documents: rows }))));
  assert.deepEqual(await Promise.all(responses.map(async r => (await r.json()).data.imported)), [2, 0]);
  assert.equal(f.tables().digitalDocument.length, 2);
  assert.equal((await f.routes["documents/import"].POST(req({ documents: [...rows, { title: "Sai", documentUrl: "javascript:bad" }] }))).status, 400);
  assert.equal(f.tables().digitalDocument.length, 2);
});
test("đóng chủ đề chặn sửa/xóa phản hồi và gửi phản hồi mới", async () => {
  const f = fixture(); f.tables().forumPost.push({ id: "post", authorId: "owner", closedAt: new Date() });
  f.tables().forumReply.push({ id: "reply", postId: "post", authorId: "owner" });
  const before = structuredClone(f.tables());
  for (const action of ["PUT", "DELETE"]) assert.equal((await f.routes["forum/replies/[id]"][action](req({ content: "Sửa" }), params("reply"))).status, 409);
  assert.equal((await f.routes["forum/[id]/replies"].POST(req({ content: "Mới" }), params("post"))).status, 409);
  assert.deepEqual(f.tables(), before);
});
test("đóng và gửi phản hồi đồng thời được tuần tự hóa trên cùng chủ đề", async () => {
  const f = fixture(); f.tables().forumPost.push({ id: "post", authorId: "owner", closedAt: null });
  const [close, reply] = await Promise.all([
    f.routes["forum/[id]"].PUT(req({ action: "CLOSE", closeSummary: "Kết luận" }), params("post")),
    f.routes["forum/[id]/replies"].POST(req({ content: "Gửi sau" }), params("post")),
  ]);
  assert.equal(close.status, 200); assert.equal(reply.status, 409); assert.equal(f.tables().forumReply.length, 0);
});
test("sửa phản hồi không bỏ qua chủ sở hữu; lỗi cập nhật chủ đề hoàn tác phản hồi", async () => {
  const f = fixture(); f.tables().forumPost.push({ id: "post", authorId: "other", closedAt: null });
  f.tables().forumReply.push({ id: "reply", postId: "post", authorId: "other" });
  assert.equal((await f.routes["forum/replies/[id]"].PUT(req({ content: "Sửa" }), params("reply"))).status, 403);
  f.fail("forumPost.update");
  assert.equal((await f.routes["forum/[id]/replies"].POST(req({ content: "Mới" }), params("post"))).status, 500);
  assert.equal(f.tables().forumReply.length, 1);
});
test("đọc workbook thật giữ hyperlink, ngày Excel và cương vị; từ chối ngày sai ở API", async () => {
  const sheet = XLSX.utils.aoa_to_sheet([["STT", "Tên quy trình", "Loại QT", "Cương vị", "Số quyết định", "Ngày ban hành", "Link tài liệu"], [1, "Quy trình A", "QTNV", "Chung", "QD1", 46337, "Tài liệu"]]);
  sheet.G2.l = { Target: "https://example.com/doc.pdf" };
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, "Quy trinh");
  const rows = readProcedureImport(XLSX.write(workbook, { type: "array", bookType: "xlsx" }), ["Lò trưởng"]);
  assert.equal(rows[0].documentUrl, "https://example.com/doc.pdf"); assert.equal(rows[0].managingPosition, '["Lò trưởng"]');
  assert.match(rows[0].issueDate!, /^\d{4}-\d{2}-\d{2}$/);
  const f = fixture();
  assert.equal((await f.routes["documents/import"].POST(req({ documents: [{ ...rows[0], issueDate: "2026-02-31" }] }))).status, 400);
  assert.equal(f.writes.length, 0);
});
