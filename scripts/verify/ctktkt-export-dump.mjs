// So nội dung file Excel KTKT giữa hai phiên bản code (giai đoạn 3: SQL → Prisma).
//
//   npx tsx scripts/verify/ctktkt-export-dump.mjs <tệp-ra.json> [đường-dẫn-xuất …]
//
// Tải từng file xuất bằng phiên ADMIN dev, ghi ra JSON: tên sheet, ô gộp, giá trị/công thức từng ô (bỏ định dạng).
// Chạy một lần trên code cũ, một lần trên code mới (cùng dữ liệu mẫu), rồi so hai tệp JSON.
import { writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
import { assertDevDatabase, assertLocalBase, fail, loadDevEnv } from "./_safety.mjs";

loadDevEnv();
assertDevDatabase();
const base = assertLocalBase(process.env.CTKTKT_CONTRACT_BASE ?? "http://localhost:3030");
const [out, ...paths] = process.argv.slice(2);
if (!out) fail("thiếu tệp ra");
const targets = paths.length ? paths : ["water-report/export?month=2026-09", "water-report/export?month=2026-10"];

const prisma = new PrismaClient();
const user = await prisma.user.findFirst({ where: { role: "ADMIN", isActive: true, lockedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, role: true, accessMode: true, employeeId: true } });
await prisma.$disconnect();
const token = await encode({ token: { sub: user.id, ...user }, secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET, salt: "authjs.session-token", maxAge: 3600 });

const result = {};
for (const target of targets) {
  const res = await fetch(new URL(`/api/ctktkt/${target}`, base), { headers: { cookie: `authjs.session-token=${token}` } });
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("spreadsheet")) { result[target] = { status: res.status, body: (await res.text()).slice(0, 300) }; continue; }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await res.arrayBuffer()));
  result[target] = { status: res.status, filename: /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1], sheets: workbook.worksheets.map(ws => {
    const cells = {};
    ws.eachRow({ includeEmpty: false }, row => row.eachCell({ includeEmpty: false }, cell => { cells[cell.address] = cell.value; }));
    return { name: ws.name, merges: [...(ws.model.merges ?? [])].sort(), cells };
  }) };
}
writeFileSync(out, JSON.stringify(result, null, 1));
console.log(`Đã ghi ${out}:`, Object.entries(result).map(([k, v]) => `${k} → ${v.status}${v.sheets ? ` (${v.sheets.length} sheet)` : ""}`).join(" · "));
