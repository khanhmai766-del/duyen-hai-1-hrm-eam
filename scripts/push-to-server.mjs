// One-off: copy ALL data from the local embedded Postgres (:5433) to a remote
// server database, OVERWRITING the server. Pure-Node (no pg_dump needed).
//
// Usage:
//   1) Put the server connection string in .env.server.local (gitignored):
//        SERVER_DATABASE_URL="postgresql://user:pass@host:5432/dbname?schema=public"
//   2) Make sure the server schema is in sync first:
//        SERVER push:  npx prisma db push  (with DATABASE_URL pointed at server)
//   3) Dry-run (counts only, no writes):
//        node scripts/push-to-server.mjs
//   4) Real run (deletes + reinserts on server):
//        CONFIRM=1 node scripts/push-to-server.mjs
//
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- resolve connection strings -------------------------------------------
function readEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const localEnv = readEnvFile(join(root, ".env"));
const serverEnv = readEnvFile(join(root, ".env.server.local"));

const LOCAL_URL = process.env.LOCAL_DATABASE_URL || localEnv.DATABASE_URL;
const SERVER_URL =
  process.env.SERVER_DATABASE_URL || serverEnv.SERVER_DATABASE_URL || serverEnv.DATABASE_URL;

if (!LOCAL_URL) {
  console.error("✗ Không tìm thấy DATABASE_URL local (.env).");
  process.exit(1);
}
if (!SERVER_URL) {
  console.error(
    "✗ Không tìm thấy SERVER_DATABASE_URL.\n" +
      "  Tạo file .env.server.local với dòng:\n" +
      '    SERVER_DATABASE_URL="postgresql://user:pass@host:5432/dbname?schema=public"',
  );
  process.exit(1);
}

const redact = (u) => u.replace(/:\/\/([^:]+):[^@]+@/, "://$1:***@");
console.log("LOCAL :", redact(LOCAL_URL));
console.log("SERVER:", redact(SERVER_URL));
console.log("");

const local = new PrismaClient({ datasources: { db: { url: LOCAL_URL } } });
const server = new PrismaClient({ datasources: { db: { url: SERVER_URL } } });

// --- table copy order (parents first; delete in reverse) -------------------
// delegate = Prisma model accessor name
const ORDER = [
  "user",
  "shift",
  "device",
  "material",
  "webAuthnCredential",
  "announcement",
  "announcementRead",
  "forumPost",
  "forumReply",
  "operationEvent",
  "shiftAssignment",
  "checkIn",
  "shiftHandover",
  "repairLog",
  "materialReplacement",
  "materialReplacementLog",
  "deviceMaterial",
  "defect",
  "defectHistory",
  "auditLog",
  "hcGroup",
  "hcCheckIn",
  // NB: digitalDocument / rbacConfig / systemBroadcast are managed by the app via
  // raw SQL and are absent from the generated Prisma client — left untouched on the
  // server (they hold RBAC config the server app needs).
];

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

async function main() {
  const CONFIRM = process.env.CONFIRM === "1";

  // 1) Report current counts on both sides
  console.log("Bảng".padEnd(26), "local".padStart(8), "server".padStart(8));
  console.log("-".repeat(46));
  const localCounts = {};
  for (const m of ORDER) {
    let lc = "?";
    let sc = "?";
    try { lc = await local[m].count(); localCounts[m] = lc; } catch (e) { lc = "ERR"; }
    try { sc = await server[m].count(); } catch (e) { sc = "ERR"; }
    console.log(m.padEnd(26), String(lc).padStart(8), String(sc).padStart(8));
  }
  console.log("");

  if (!CONFIRM) {
    console.log("ℹ️  Đây là DRY-RUN (không ghi gì). Chạy lại với CONFIRM=1 để thực thi.");
    return;
  }

  // 2) Delete everything on server (reverse FK order)
  console.log("→ Xóa dữ liệu cũ trên server...");
  for (const m of [...ORDER].reverse()) {
    try {
      const { count } = await server[m].deleteMany({});
      console.log(`   - ${m}: xóa ${count}`);
    } catch (e) {
      console.error(`   ✗ deleteMany ${m}:`, e.message);
      throw e;
    }
  }

  // 3) Copy from local → server (FK order), chunked
  console.log("→ Chèn dữ liệu mới lên server...");
  for (const m of ORDER) {
    const rows = await local[m].findMany();
    if (rows.length === 0) {
      console.log(`   - ${m}: 0`);
      continue;
    }
    let done = 0;
    for (const batch of chunk(rows, 100)) {
      const res = await server[m].createMany({ data: batch, skipDuplicates: true });
      done += res.count;
    }
    console.log(`   - ${m}: chèn ${done}/${rows.length}`);
  }

  // 4) Verify
  console.log("\n→ Kiểm tra sau khi đồng bộ:");
  let ok = true;
  for (const m of ORDER) {
    const lc = localCounts[m];
    const sc = await server[m].count();
    const mark = lc === sc ? "✓" : "✗";
    if (lc !== sc) ok = false;
    console.log(`   ${mark} ${m}: local=${lc} server=${sc}`);
  }
  console.log(ok ? "\n✅ Đồng bộ hoàn tất, số lượng khớp." : "\n⚠️  Có bảng lệch số lượng — xem log ở trên.");
}

main()
  .catch((e) => {
    console.error("\n✗ Lỗi:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await local.$disconnect();
    await server.$disconnect();
  });
