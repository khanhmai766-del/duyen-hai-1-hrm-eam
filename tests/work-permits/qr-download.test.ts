import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import sharp from "sharp";
import { BinaryBitmap, HybridBinarizer, RGBLuminanceSource, QRCodeReader } from "@zxing/library";
import { workPermitQrAssets, workPermitQrLabelPng, workPermitQrLabelText } from "../../lib/server/work-permit-qr";
import { effectivePermitFormat } from "../../lib/work-permits";

function harness(overrides = {}, denial?: number) {
  const row = { id: "cm1234567890permit", number: "4445", content: "Chuẩn bị mặt bằng, công cụ dụng cụ phục vụ đại tu các van hơi chính Tuabin, BFPT", year: 2026, kind: "MECHANICAL", teamType: "CONTRACTOR", format: "PAPER", status: "ISSUED", ...overrides };
  let generated = 0;
  let read = 0;
  const dependencies: Record<string, unknown> = {
    "@/lib/server/work-permit-scope": { requirePermitVisible: async () => { if (denial === 403) throw Response.json({ error: "Không có quyền xem phiếu" }, { status: 403 }); } },
    "@/lib/prisma": { prisma: { workPermit: { findUnique: async () => { read++; return row; } } } },
    "@/lib/api": { requireUser: async () => { if (denial === 401) throw Response.json({ error: "Chưa đăng nhập" }, { status: 401 }); return { id: "operator" }; }, fail: (error: string, status = 400) => Response.json({ error }, { status }) },
    "@/lib/work-permits": { effectivePermitFormat },
    "@/lib/server/work-permits": { permitHandle: async (fn: () => Promise<Response>) => { try { return await fn(); } catch (error) { if (error instanceof Response) return error; throw error; } } },
    "@/lib/server/work-permit-document-store": { permitDocumentBaseName: () => "PCT-Co-2026-4445" },
    "@/lib/server/work-permit-qr": { workPermitQrLabelPng: async (...args: Parameters<typeof workPermitQrLabelPng>) => { generated++; return workPermitQrLabelPng(...args); } },
  };
  const js = ts.transpileModule(readFileSync("app/api/work-permits/[id]/qr/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} as { GET: (req: Request, props: unknown) => Promise<Response> } };
  new Function("require", "module", "exports", js)((name: string) => {
    assert.ok(name in dependencies, name);
    return dependencies[name];
  }, loaded, loaded.exports);
  return { read: () => read, generated: () => generated, get: () => loaded.exports.GET(new Request(`https://duyenhai1.vn/api/work-permits/${row.id}/qr`), { params: Promise.resolve({ id: row.id }) }) };
}

test("phiếu đã cấp từ trước tải được QR PNG rõ nét, đúng ID và tên tệp", async () => {
  const h = harness();
  const response = await h.get();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/png");
  assert.equal(response.headers.get("Content-Disposition"), 'attachment; filename="QR-PCT-Co-2026-4445.png"');
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  const png = Buffer.from(await response.arrayBuffer());
  const meta = await sharp(png).metadata();
  assert.ok(meta.width! >= 1000);
  assert.ok(Math.abs(meta.width! / meta.density! * 25.4 - 60) < 0.1);
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  const qr = await sharp((await workPermitQrAssets({id:"cm1234567890permit"}, "https://duyenhai1.vn")).png).metadata();
  const pixels = await sharp(png).extract({left:Math.round((meta.width! - qr.width!) / 2),top:Math.round(2 * meta.density! / 25.4),width:qr.width!,height:qr.height!}).greyscale().raw().toBuffer();
  assert.deepEqual([...new Set(pixels)].sort((a, b) => a - b), [0, 255]);
  const decoded = new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(new Uint8ClampedArray(data), info.width, info.height)))).getText();
  assert.equal(decoded, "https://duyenhai1.vn/work-permits/cm1234567890permit/lam-viec?open=1");
  assert.equal(h.generated(), 1);
});

for (const status of ["ACTIVE", "WAITING", "CLOSED"]) test(`phiếu ${status} vẫn tải QR riêng được`, async () => {
  assert.equal((await harness({ status }).get()).status, 200);
});

for (const overrides of [{ status: "DRAFT" }, { status: "CANCELLED" }, { format: "ELECTRONIC" }, { teamType: "INTERNAL" }]) test(`không tải QR ngoài phạm vi: ${JSON.stringify(overrides)}`, async () => {
  const h = harness(overrides);
  assert.equal((await h.get()).status, 400);
  assert.equal(h.generated(), 0);
});

for (const denial of [401, 403]) test(`kiểm tra quyền ${denial} trước khi đọc phiếu/tạo QR`, async () => {
  const h = harness({}, denial);
  assert.equal((await h.get()).status, denial);
  assert.equal(h.read(), 0);
  assert.equal(h.generated(), 0);
});

 test("nhãn giữ đúng số phiếu, nội dung tiếng Việt và escape ký tự markup", () => {
  const text = workPermitQrLabelText({id:"cm1234567890permit",number:"4445",year:2026,content:'Đại tu van <A> & kiểm tra "B"'});
  assert.match(text, /<b>PCT 4445\/2026\/VH1-NĐDH<\/b>/);
  assert.match(text, /Nội dung: Đại tu van &lt;A&gt; &amp; kiểm tra &quot;B&quot;/);
});

test("nội dung dài xuống dòng làm nhãn cao hơn, QR vẫn quét được", async () => {
  const base = {id:"cm1234567890permit",number:"4445",year:2026,content:"Đại tu van"};
  const short = await sharp(await workPermitQrLabelPng(base)).metadata();
  const longPng = await workPermitQrLabelPng({...base,content:"Kiểm tra, sửa chữa và đại tu thiết bị Tuabin, các van hơi chính. ".repeat(8)});
  const long = await sharp(longPng).metadata();
  assert.equal(long.width, short.width);
  assert.ok(long.height! > short.height!);
  const {data,info} = await sharp(longPng).greyscale().raw().toBuffer({resolveWithObject:true});
  const decoded = new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(new Uint8ClampedArray(data),info.width,info.height)))).getText();
  assert.equal(new URL(decoded).pathname,"/work-permits/cm1234567890permit/lam-viec");
});
