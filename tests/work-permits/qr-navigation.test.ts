import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { parseWorkPermitQrValue } from "../../lib/work-permit-qr";

const id = "cm1234567890permit";
function resolver(status: string, denied = false) {
  const fail = (error: string, code = 400) => Response.json({ error }, { status: code });
  const imports: Record<string, unknown> = {
    "@/lib/api": { requireUser: async () => ({ id: "operator" }), fail, ok: (data: unknown) => Response.json({ data }),
      handle: async (fn: () => Promise<Response>) => { try { return await fn(); } catch (error) { if (error instanceof Response) return error; throw error; } } },
    "@/lib/device-qr": {}, "@/lib/device-qr-access": {}, "@/lib/server-access": {},
    "@/lib/prisma": { prisma: { workPermit: { findUnique: async () => ({ id, status, teamType: "CONTRACTOR", contractorScope: "OVERHAUL" }) } } },
    "@/lib/work-permit-qr": { parseWorkPermitQrValue },
    "@/lib/server/work-permit-scope": { requirePermitVisible: async () => { if (denied) throw fail("Không có quyền xem phiếu", 403); } },
    "@/lib/server/work-permit-permissions": { requirePermitExecute: async () => {} },
  };
  const js = ts.transpileModule(readFileSync("app/api/device-qr/resolve/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} as { POST: (req: Request) => Promise<Response> } };
  new Function("require", "module", "exports", js)((name: string) => {
    assert.ok(name in imports, name); return imports[name];
  }, loaded, loaded.exports);
  return (query = "?open=1") => loaded.exports.POST(new Request("https://duyenhai1.vn/api/device-qr/resolve", {
    method: "POST", body: JSON.stringify({ value: `https://duyenhai1.vn/work-permits/${id}/lam-viec${query}` }),
  }));
}

for (const query of ["?open=1", "?scan=1", ""]) test(`QR PCT đang thực hiện mở trang bình thường, kể cả mã cũ ${query}`, async () => {
  const response = await resolver("ACTIVE")(query);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.url, `/work-permits/${id}/lam-viec`);
});

for (const status of ["ISSUED", "WAITING"]) test(`QR PCT ${status} vẫn gợi ý mở lần làm việc`, async () => {
  const response = await resolver(status)();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.url, `/work-permits/${id}/lam-viec?open=1`);
});

test("điều hướng từ QR vẫn kiểm tra quyền và trạng thái phiếu", async () => {
  assert.equal((await resolver("ACTIVE", true)()).status, 403);
  for (const status of ["DRAFT", "CLOSED", "CANCELLED"]) assert.equal((await resolver(status)()).status, 409);
});
