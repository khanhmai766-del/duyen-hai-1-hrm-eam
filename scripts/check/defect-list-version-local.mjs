// Đọc API thật trên dev để kiểm tra phiên bản phiếu dùng cho thao tác ẩn; không ghi dữ liệu.
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
import { assertDevDatabase, assertLocalBase, loadDevEnv } from "../verify/_safety.mjs";

loadDevEnv();
const base = assertLocalBase(process.argv[2] ?? "http://localhost:3030");
assertDevDatabase();
const prisma = new PrismaClient();
try {
  const user = await prisma.user.findFirst({
    where: { role: "ADMIN", accessMode: "NORMAL", isActive: true, lockedAt: null },
    select: { id: true, name: true, email: true, role: true, accessMode: true, employeeId: true },
  });
  assert.ok(user, "Cần tài khoản ADMIN dev có sẵn để đọc API");
  const token = await encode({ token: { sub: user.id, ...user }, secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
    salt: "authjs.session-token", maxAge: 300 });
  const response = await fetch(new URL("/api/defects?limit=25", base), {
    headers: { Cookie: `authjs.session-token=${token}; pp-admin-mode=on` }, redirect: "error",
  });
  assert.equal(response.status, 200, "API danh sách phải đọc được bằng phiên dev");
  const json = await response.json();
  assert.ok(json.data?.length > 0, "DB dev cần phiếu hiển thị để kiểm tra phản hồi API thật");
  for (const row of json.data) {
    assert.equal(typeof row.updatedAt, "string", `Phiếu ${row.requestNumber}: API thiếu phiên bản updatedAt`);
    assert.ok(Number.isFinite(new Date(row.updatedAt).getTime()), "Phiên bản phải là thời gian hợp lệ");
    const stored = await prisma.defect.findUniqueOrThrow({ where: { id: row.id }, select: { updatedAt: true } });
    assert.equal(row.updatedAt, stored.updatedAt.toISOString(), "Phiên bản API phải khớp bản ghi trong DB");
  }
  console.log(`Đạt: ${json.data.length} phiếu từ API thật có updatedAt hợp lệ, khớp DB; không ghi dữ liệu.`);
} finally {
  await prisma.$disconnect();
}
