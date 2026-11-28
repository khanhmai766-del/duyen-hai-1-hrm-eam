/**
 * Đối chiếu "Theo dõi dầu mỡ thiết bị": mỗi dòng Excel đã có đích xác minh chưa, và đích đó
 * có tồn tại thành điểm thay thế đang hoạt động trong DB không. CHỈ ĐỌC.
 *
 *   npx tsx scripts/check/lubricant-link-coverage.ts [--all]
 */
import { PrismaClient } from "@prisma/client";
import groups from "../../app/(dashboard)/replacements/lubricant-statistics.json";
import { expandSourceRows, isExcelOnly, targetAcceptsCode } from "../../lib/lubricant-link-targets";

const prisma = new PrismaClient();
const fold = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase().replace(/\s+/g, " ").trim();

async function main() {
  const rows = expandSourceRows(groups);
  const [points, materials] = await Promise.all([
    prisma.materialReplacement.findMany({
      where: { isActive: true },
      select: { deviceSeq: true, location: true, machine: true, material: { select: { code: true } } },
    }),
    prisma.material.findMany({ select: { code: true } }),
  ]);
  const materialCodes = new Set(materials.map((m) => m.code));
  const pointsAt = new Map<string, string[]>();
  for (const p of points) {
    const key = `${p.deviceSeq ?? fold(p.location ?? "")}|${p.machine}`;
    pointsAt.set(key, [...(pointsAt.get(key) ?? []), p.material.code]);
  }
  const stats = new Map<string, { total: number; ok: number; theoExcel: number; chuaTao: number; noTarget: number; missingMaterial: number; missingPoint: number }>();
  const problems: string[] = [];
  for (const row of rows) {
    const s = stats.get(row.group) ?? { total: 0, ok: 0, theoExcel: 0, chuaTao: 0, noTarget: 0, missingMaterial: 0, missingPoint: 0 };
    stats.set(row.group, s);
    s.total += 1;
    if (!row.target) {
      if (isExcelOnly(row.key)) { s.theoExcel += 1; continue; }
      s.noTarget += 1; problems.push(`${row.group} | ${row.name} | CHƯA CÓ ĐÍCH XÁC MINH`); continue;
    }
    const t = row.target;
    const where = "deviceSeq" in t ? t.deviceSeq : fold(t.location);
    if (!t.materialCode || !materialCodes.has(t.materialCode)) {
      s.missingMaterial += 1; problems.push(`${row.group} | ${row.name} | thiếu vật tư ${t.materialCode || "(chưa có mã)"}`); continue;
    }
    const found = (pointsAt.get(`${where}|${t.machine}`) ?? []).filter((code) => targetAcceptsCode(t, code));
    if (found.length === 0) {
      if (t.create) s.chuaTao += 1; else s.missingPoint += 1;
      problems.push(`${row.group} | ${row.name} | ${t.create ? "chờ tạo điểm" : "thiếu điểm hoạt động"} ${where} / ${t.machine} / ${t.materialCode}`);
      continue;
    }
    s.ok += 1;
  }
  console.table(Object.fromEntries(stats));
  console.log(`Tổng ${rows.length} dòng; điểm hoạt động trong DB: ${points.length}`);
  console.log(problems.filter((line) => !line.endsWith("CHƯA CÓ ĐÍCH XÁC MINH") || process.argv.includes("--all")).join("\n"));
}

main().finally(() => prisma.$disconnect());
