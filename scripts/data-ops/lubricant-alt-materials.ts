/**
 * Chuyển `altMaterialCodes` / `altMaterialNames` của các dòng liên kết trong JSON
 * (lubricant-verified-links / lubricant-link-decisions) vào cột MaterialReplacement.alternateMaterialIds.
 *
 * Với mỗi dòng có dầu thay thế: tìm điểm đang hoạt động khớp đích (thiết bị/vị trí + tổ máy + mã vật tư),
 * rồi hợp nhất {vật tư đích + các dầu thay thế} trừ vật tư chính của điểm vào alternateMaterialIds
 * (chỉ lấy vật tư dầu bôi trơn cùng tổ máy). Chạy lại vô hại: chỉ thêm, không bớt.
 *
 *   npx tsx scripts/data-ops/lubricant-alt-materials.ts          # xem trước, không ghi (mặc định)
 *   npx tsx scripts/data-ops/lubricant-alt-materials.ts --apply  # ghi vào DB hiện tại
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import groups from "../../app/(dashboard)/replacements/lubricant-statistics.json";
import { expandSourceRows, targetAcceptsCode } from "../../lib/lubricant-link-targets";

loadEnvConfig(process.cwd());
const apply = process.argv.includes("--apply");
const prisma = new PrismaClient();
const fold = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase().replace(/\s+/g, " ").trim();

async function main() {
  console.log(`DB: ${new URL(process.env.DATABASE_URL ?? "http://invalid").host} · ${apply ? "GHI" : "XEM TRƯỚC (thêm --apply để ghi)"}`);
  const rows = expandSourceRows(groups).filter((row) => row.target && (row.target.altMaterialCodes?.length || row.target.altMaterialNames?.length));
  const [materials, points] = await Promise.all([
    prisma.material.findMany({ where: { category: "Dầu bôi trơn" }, select: { id: true, code: true, name: true, machine: true } }),
    prisma.materialReplacement.findMany({
      where: { isActive: true },
      select: { id: true, deviceSeq: true, location: true, machine: true, materialId: true, alternateMaterialIds: true, material: { select: { code: true } } },
    }),
  ]);
  let changed = 0;
  const problems: string[] = [];
  for (const row of rows) {
    const target = row.target!;
    const where = "deviceSeq" in target ? target.deviceSeq : target.location;
    const matches = points.filter((point) => point.machine === target.machine
      && ("deviceSeq" in target ? point.deviceSeq === target.deviceSeq : fold(point.location ?? "") === fold(target.location))
      && targetAcceptsCode(target, point.material.code));
    if (matches.length !== 1) { problems.push(`${row.group} | ${row.name} | ${matches.length} điểm khớp ${where}/${target.machine} — bỏ qua`); continue; }
    const point = matches[0];
    const resolve = (predicate: (m: (typeof materials)[number]) => boolean, label: string) => {
      const found = materials.find((m) => m.machine === point.machine && predicate(m)) ?? materials.find(predicate);
      if (!found) problems.push(`${row.group} | ${row.name} | không thấy dầu thay thế "${label}"`);
      return found;
    };
    const wanted = [
      resolve((m) => m.code === target.materialCode, target.materialCode),
      ...(target.altMaterialCodes ?? []).map((code) => resolve((m) => m.code === code, code)),
      ...(target.altMaterialNames ?? []).map((name) => resolve((m) => fold(m.name) === fold(name), name)),
    ];
    const ids = [...new Set(wanted.flatMap((m) => m && m.machine === point.machine && m.id !== point.materialId ? [m.id] : []))];
    const next = [...new Set([...point.alternateMaterialIds, ...ids])];
    if (next.length === point.alternateMaterialIds.length) continue;
    const name = (id: string) => materials.find((m) => m.id === id)?.name ?? id;
    console.log(`${apply ? "GHI " : "SẼ GHI "}${row.group} | ${row.name} -> ${where}: ${next.map(name).join(" / ")}`);
    changed += 1;
    if (apply) await prisma.materialReplacement.update({ where: { id: point.id }, data: { alternateMaterialIds: next } });
    point.alternateMaterialIds = next;
  }
  console.log(`\n${apply ? "Đã cập nhật" : "Sẽ cập nhật"}: ${changed} điểm (từ ${rows.length} dòng có dầu thay thế)`);
  if (problems.length) console.log(`\nCần xem lại (${problems.length}):\n${problems.join("\n")}`);
}

main().finally(() => prisma.$disconnect());
