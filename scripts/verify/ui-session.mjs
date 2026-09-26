// Ghi phiên đăng nhập dev ra tệp storage-state cho Playwright MCP (trình duyệt do AI điều khiển tương tác).
//
//   npm run verify:ui-session                       # mặc định tài khoản admin@powerplant.vn, hạn 8 giờ
//   node scripts/verify/ui-session.mjs [email] [BASE]
//
// Khác ui-shots.mjs: KHÔNG tạo user tạm (MCP chạy lâu, không có bước dọn) — chỉ ĐỌC một tài khoản có sẵn trên
// DB dev rồi ký cookie bằng AUTH_SECRET của .env. Cùng chốt an toàn: BASE và DB phải là local.
// Tệp ghi ở reports/verify/mcp-state.json (gitignore) — đó là phiên đăng nhập, không chép đi đâu.
import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { encode } from "next-auth/jwt";
import { assertDevDatabase, assertLocalBase, fail, loadDevEnv } from "./_safety.mjs";

loadDevEnv();
const [emailArg, baseArg] = process.argv.slice(2);
const email = emailArg ?? "admin@powerplant.vn";
const base = assertLocalBase(baseArg ?? "http://localhost:3030");
assertDevDatabase();
const HOURS = 8;

const prisma = new PrismaClient();
const user = await prisma.user.findFirst({
  where: { email, isActive: true, lockedAt: null },
  select: { id: true, name: true, email: true, role: true, accessMode: true, employeeId: true },
});
await prisma.$disconnect();
if (!user) fail(`không có tài khoản đang hoạt động "${email}" trên DB dev`);

const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
const value = await encode({ token: { sub: user.id, ...user }, secret, salt: "authjs.session-token", maxAge: HOURS * 3600 });
const out = path.join("reports", "verify", "mcp-state.json");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({
  cookies: [{ name: "authjs.session-token", value, domain: base.hostname, path: "/", expires: Math.floor(Date.now() / 1000) + HOURS * 3600, httpOnly: true, secure: false, sameSite: "Lax" }],
  origins: [],
}, null, 2));
console.log(`Đã ghi ${out} — phiên ${user.name} (${user.role}) trên ${base.origin}, hạn ${HOURS} giờ.`);
