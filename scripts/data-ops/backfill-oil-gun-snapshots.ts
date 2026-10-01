/**
 * Nạp ảnh chụp sơ đồ vòi đốt (OilGunSnapshot) cho các NGÀY ĐÃ QUA từ bản sao lưu DB mà deploy-server.sh để lại.
 *
 *   npx tsx scripts/data-ops/backfill-oil-gun-snapshots.ts                 # chạy thử: in ra sẽ nạp gì, KHÔNG ghi
 *   npx tsx scripts/data-ops/backfill-oil-gun-snapshots.ts --commit        # ghi thật
 *   npx tsx scripts/data-ops/backfill-oil-gun-snapshots.ts --dir /root --commit
 *
 * - Bản sao lưu: <dir>/backup-dh1db-YYYY-MM-DD-HHMM-*.sql.gz (giờ trong tên là giờ server = UTC). Mỗi NGÀY giờ VN lấy
 *   bản MUỘN NHẤT trong ngày đó làm "trạng thái cuối ngày" (capturedAt = giờ sao lưu, giao diện hiện giờ chụp).
 * - Chỉ đọc khối COPY "OilGun" / "OilGunNote" trong tệp, không khôi phục gì vào DB.
 * - Lưu qua saveOilGunSnapshot của app → tự bỏ bản trùng (ngày không đổi gì không sinh dòng). Ngày ĐÃ CÓ ảnh chụp
 *   (do app chụp) được giữ nguyên, không ghi đè. Hôm nay bỏ qua — app tự chụp.
 */
import { createReadStream, readdirSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createGunzip } from "node:zlib";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const FILE_PATTERN = /^backup-dh1db-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})-.*\.sql\.gz$/;

type Row = Record<string, unknown>;

/** Giải mã một ô định dạng COPY text của PostgreSQL. */
function copyCell(value: string | undefined): string | null {
  if (value === undefined || value === "\\N") return null;
  return value.replace(/\\(.)/g, (_, c: string) => ({ t: "\t", n: "\n", r: "\r", "\\": "\\" } as Record<string, string>)[c] ?? c);
}

/** Đọc khối COPY của các bảng cần thiết trong một tệp .sql.gz (đọc dòng một, dừng khi đã đủ). */
async function readTables(file: string, tables: string[]) {
  const result: Record<string, Row[]> = {};
  const lines = readline.createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
  let current: { name: string; cols: string[] } | null = null;
  for await (const line of lines) {
    if (current) {
      if (line === "\\.") {
        current = null;
        if (tables.every(t => result[t])) { lines.close(); break; }
        continue;
      }
      const values = line.split("\t");
      result[current.name].push(Object.fromEntries(current.cols.map((c, i) => [c, copyCell(values[i])])));
      continue;
    }
    const match = /^COPY public\."([^"]+)" \(([^)]*)\) FROM stdin;$/.exec(line);
    if (match && tables.includes(match[1])) {
      current = { name: match[1], cols: match[2].split(",").map(c => c.trim().replace(/"/g, "")) };
      result[current.name] = [];
    }
  }
  return result;
}

/** Dòng COPY → đối tượng OilGun đúng kiểu (số, boolean, Date). */
function toOilGun(row: Row) {
  const date = (v: unknown) => (v ? new Date(`${String(v).replace(" ", "T")}Z`) : null);
  return {
    ...row,
    position: Number(row.position ?? 0),
    forceFlame: row.forceFlame === "t",
    updatedAt: date(row.updatedAt),
    createdAt: date(row.createdAt),
    coalUpdatedAt: date(row.coalUpdatedAt),
  };
}

async function main() {
  const commit = process.argv.includes("--commit");
  const dirIndex = process.argv.indexOf("--dir");
  const dir = dirIndex > 0 ? process.argv[dirIndex + 1] : "/root";
  const { prisma } = await import("../../lib/prisma");
  const { saveOilGunSnapshot, snapshotSignature, vietnamDate } = await import("../../lib/server/oil-gun-snapshot");

  const today = vietnamDate();
  // Mỗi ngày giờ VN → bản sao lưu muộn nhất trong ngày đó.
  const byDay = new Map<string, { file: string; at: Date }>();
  for (const name of readdirSync(dir)) {
    const m = FILE_PATTERN.exec(name);
    if (!m) continue;
    const at = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
    const day = vietnamDate(at);
    if (day >= today) continue;
    const prev = byDay.get(day);
    if (!prev || at > prev.at) byDay.set(day, { file: path.join(dir, name), at });
  }
  const days = [...byDay.keys()].sort();
  console.log(`${commit ? "GHI THẬT" : "CHẠY THỬ (thêm --commit để ghi)"} · ${days.length} ngày có bản sao lưu trong ${dir}: ${days[0] ?? "—"} → ${days.at(-1) ?? "—"}`);

  const existing = new Set((await prisma.oilGunSnapshot.findMany({ select: { machine: true, date: true } })).map(s => `${s.machine}|${s.date}`));
  // Chạy thử: mô phỏng việc bỏ bản trùng theo thứ tự ngày.
  const lastSignature = new Map<string, string>();
  let saved = 0, unchanged = 0, kept = 0;
  for (const day of days) {
    const { file, at } = byDay.get(day)!;
    const tables = await readTables(file, ["OilGun", "OilGunNote"]);
    for (const machine of ["S1", "S2"]) {
      const guns = (tables.OilGun ?? []).filter(r => r.machine === machine).map(toOilGun).sort((a, b) => a.position - b.position);
      if (!guns.length) continue;
      const noteRow = (tables.OilGunNote ?? []).find(r => r.machine === machine);
      const state = {
        guns: guns as never,
        note: String(noteRow?.note ?? ""),
        noteUpdatedBy: (noteRow?.updatedBy as string | null) ?? null,
        noteUpdatedAt: noteRow?.updatedAt ? new Date(`${String(noteRow.updatedAt).replace(" ", "T")}Z`) : null,
      };
      const label = `${day} ${machine} (sao lưu ${at.toISOString().slice(11, 16)} UTC)`;
      if (existing.has(`${machine}|${day}`)) { kept++; console.log(`  giữ nguyên  ${label} — đã có ảnh chụp`); continue; }
      if (commit) {
        const outcome = await saveOilGunSnapshot(machine, day, state, at);
        if (outcome === "saved") saved++; else unchanged++;
        console.log(`  ${outcome === "saved" ? "đã nạp    " : "trùng, bỏ "}  ${label}`);
      } else {
        const sig = snapshotSignature(state);
        const same = lastSignature.get(machine) === sig;
        lastSignature.set(machine, sig);
        if (same) unchanged++; else saved++;
        console.log(`  ${same ? "trùng, bỏ " : "sẽ nạp    "}  ${label}`);
      }
    }
  }
  console.log(`Xong: ${saved} ${commit ? "đã nạp" : "sẽ nạp"}, ${unchanged} trùng bản trước (không sinh dòng), ${kept} ngày đã có ảnh chụp.`);
  await prisma.$disconnect();
}

main().catch(error => {
  console.error("Nạp ảnh chụp vòi đốt thất bại:", error);
  process.exitCode = 1;
});
