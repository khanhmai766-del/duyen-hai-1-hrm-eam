// Lấy HTML SERVER-RENDER của một trang (phiên ADMIN tạm, DB dev local) và dò chữ dễ gây lệch hydrate:
// thời lượng/giờ/ngày, lời chào theo phiên, khung "Đang tải". Dùng khi điều tra lỗi React #418.
//   node scripts/verify/ssr-probe.mjs <BASE> [route]
//   Git Bash: MSYS_NO_PATHCONV=1 node scripts/verify/ssr-probe.mjs http://127.0.0.1:3031 /
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { encode } from "next-auth/jwt";
import { assertDevDatabase, assertLocalBase, loadDevEnv } from "./_safety.mjs";

loadDevEnv();
const [BASE_ARG, ROUTE = "/"] = process.argv.slice(2);
const BASE = (BASE_ARG ?? "http://127.0.0.1:3031").replace(/\/$/, "");
assertLocalBase(BASE);
assertDevDatabase();
const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
const prisma = new PrismaClient();
const tag = Date.now();
const user = await prisma.user.create({
  data: {
    name: "TEST ssr (tạm)", employeeId: `TMP-SSR-${tag}`, email: `tmp-ssr-${tag}@local.test`,
    passwordHash: await bcrypt.hash(randomBytes(24).toString("hex"), 10), role: "ADMIN",
  },
});
try {
  const token = { sub: user.id, id: user.id, name: user.name, email: user.email, role: "ADMIN", accessMode: "NORMAL", employeeId: user.employeeId };
  const value = await encode({ token, secret, salt: "authjs.session-token", maxAge: 3600 });
  const res = await fetch(BASE + ROUTE, { headers: { cookie: `authjs.session-token=${value}` }, redirect: "manual" });
  const html = await res.text();
  console.log(`HTTP ${res.status} · ${html.length} ký tự HTML`);
  const body = html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const text = body.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const probes = [
    ["thời lượng X ngày Y giờ Z phút", /[0-9]+ ngày [0-9]+ giờ [0-9]+ phút/g, text],
    ["giờ HH:MM", /\b[0-9]{1,2}:[0-9]{2}\b/g, text],
    ["ngày dd/mm(/yyyy)", /\b[0-9]{1,2}\/[0-9]{1,2}(\/[0-9]{2,4})?\b/g, text],
    ["Welcome back (phụ thuộc phiên)", /Welcome back/g, text],
    ["skeleton / Đang tải", /animate-pulse|Đang tải/g, body],
  ];
  for (const [label, re, src] of probes) {
    const hits = [...src.matchAll(re)];
    console.log(`\n• ${label}: ${hits.length}`);
    for (const h of hits.slice(0, 6)) {
      const i = h.index ?? 0;
      console.log("   …" + src.slice(Math.max(0, i - 70), i + 70).replace(/\s+/g, " ") + "…");
    }
  }
} finally {
  await prisma.user.delete({ where: { id: user.id } }).catch(async () => {
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } }).catch(() => {});
  });
  await prisma.$disconnect();
  console.log("\nuser tạm: đã dọn");
}
