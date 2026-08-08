/**
 * Chuẩn hoá cương vị / cấp giám sát của toàn bộ dữ liệu PCCC về danh mục chức danh
 * chung, và tách tổ máy sang cột `machine`.
 *
 *   npm run normalize:pccc              # DRY-RUN: chỉ in ra sẽ đổi gì
 *   npm run normalize:pccc -- --apply   # ghi thật
 *
 * Idempotent: chạy lại lần 2 không đổi gì thêm. An toàn với dữ liệu người dùng đã
 * nhập trên web vì chỉ chạm 4 cột cương vị/giám sát/tổ máy.
 */
import { PrismaClient } from "@prisma/client";
import { normalizePosition, type PcccMachine } from "../lib/pccc-position";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

type Change = { table: string; id: string; ma: string; from: string; to: string };

const changes: Change[] = [];
const unmatched = new Map<string, number>();

function plan(table: string, id: string, ma: string, cur: Record<string, unknown>, next: Record<string, unknown>) {
  const diff = Object.keys(next).filter((k) => String(cur[k] ?? "") !== String(next[k] ?? ""));
  if (diff.length === 0) return null;
  changes.push({
    table,
    id,
    ma,
    from: diff.map((k) => `${k}=${cur[k] ?? "∅"}`).join(" "),
    to: diff.map((k) => `${k}=${next[k] ?? "∅"}`).join(" "),
  });
  return Object.fromEntries(diff.map((k) => [k, next[k]]));
}

function track(raw: string | null | undefined, res: ReturnType<typeof normalizePosition>) {
  if (res.unmatched && raw) unmatched.set(raw, (unmatched.get(raw) ?? 0) + 1);
}

async function main() {
  console.log(APPLY ? "CHẾ ĐỘ GHI THẬT (--apply)\n" : "DRY-RUN — chưa ghi gì. Thêm --apply để ghi thật.\n");

  // ---- BCC: cương vị + cấp giám sát
  const extinguishers = await prisma.pcccExtinguisher.findMany({
    select: { id: true, ma: true, cuongVi: true, cuongViCode: true, machine: true, nguoiGiamSat: true, nguoiGiamSatCode: true },
  });
  for (const r of extinguishers) {
    const cv = normalizePosition(r.cuongVi, r.machine);
    const gs = normalizePosition(r.nguoiGiamSat);
    track(r.cuongVi, cv);
    track(r.nguoiGiamSat, gs);
    const patch = plan("BCC", r.id, r.ma, r, {
      cuongVi: cv.label,
      cuongViCode: cv.code,
      machine: cv.machine satisfies PcccMachine,
      nguoiGiamSat: gs.label,
      nguoiGiamSatCode: gs.code,
    });
    if (patch && APPLY) await prisma.pcccExtinguisher.update({ where: { id: r.id }, data: patch });
  }

  // ---- TCC
  const cabinets = await prisma.pcccCabinet.findMany({
    select: { id: true, ma: true, cuongVi: true, cuongViCode: true, machine: true },
  });
  for (const r of cabinets) {
    const cv = normalizePosition(r.cuongVi, r.machine);
    track(r.cuongVi, cv);
    const patch = plan("TCC", r.id, r.ma, r, { cuongVi: cv.label, cuongViCode: cv.code, machine: cv.machine });
    if (patch && APPLY) await prisma.pcccCabinet.update({ where: { id: r.id }, data: patch });
  }

  // ---- FCD
  const bulks = await prisma.pcccBulk.findMany({
    select: { id: true, ten: true, cuongVi: true, cuongViCode: true, machine: true },
  });
  for (const r of bulks) {
    const cv = normalizePosition(r.cuongVi, r.machine);
    track(r.cuongVi, cv);
    const patch = plan("FCD", r.id, r.ten, r, { cuongVi: cv.label, cuongViCode: cv.code, machine: cv.machine });
    if (patch && APPLY) await prisma.pcccBulk.update({ where: { id: r.id }, data: patch });
  }

  // ---- FM200 (hiện chưa gán cương vị, xử lý cho đủ bộ)
  const panels = await prisma.pcccFm200Panel.findMany({
    select: { id: true, title: true, cuongVi: true, cuongViCode: true, machine: true },
  });
  for (const r of panels) {
    const cv = normalizePosition(r.cuongVi, r.machine);
    track(r.cuongVi, cv);
    const patch = plan("FM200", r.id, r.title, r, { cuongVi: cv.label, cuongViCode: cv.code, machine: cv.machine });
    if (patch && APPLY) await prisma.pcccFm200Panel.update({ where: { id: r.id }, data: patch });
  }

  // ---- Báo cáo: gộp theo cùng một phép đổi để đọc được, thay vì in 2000 dòng
  const grouped = new Map<string, { table: string; from: string; to: string; n: number; sample: string }>();
  for (const c of changes) {
    const key = `${c.table}|${c.from}|${c.to}`;
    const cur = grouped.get(key);
    if (cur) cur.n += 1;
    else grouped.set(key, { table: c.table, from: c.from, to: c.to, n: 1, sample: c.ma });
  }
  console.log(`${changes.length} dòng cần đổi, gộp thành ${grouped.size} phép đổi:\n`);
  for (const g of [...grouped.values()].sort((a, b) => b.n - a.n)) {
    console.log(`  ${g.table.padEnd(6)} ${String(g.n).padStart(4)} dòng`);
    console.log(`         từ: ${g.from}`);
    console.log(`         → : ${g.to}   (vd ${g.sample})`);
  }

  if (unmatched.size > 0) {
    console.log(`\n⚠ ${unmatched.size} giá trị KHÔNG khớp danh mục chức danh (giữ nguyên nhãn, code = null):`);
    for (const [value, n] of [...unmatched.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`   ${value} (${n} dòng)`);
    }
    console.log("   → thêm bí danh vào lib/position-catalog.ts rồi chạy lại.");
  } else {
    console.log("\n✔ Mọi giá trị đều khớp danh mục chức danh.");
  }

  if (!APPLY && changes.length > 0) console.log("\nChưa ghi gì. Chạy lại với --apply để áp dụng.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
