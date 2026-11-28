/**
 * Tạo các điểm thay thế dầu mỡ còn thiếu cho trang "Theo dõi dầu mỡ thiết bị".
 *
 * Nguồn: các dòng trong `lubricant-link-decisions.json` có `create: true` (người dùng đã duyệt "tạo mới").
 * Chạy lại vô hại: điểm đã có (cùng thiết bị/vị trí + tổ máy + mã vật tư) thì bỏ qua.
 * Không tạo vật tư: thiếu mã vật tư trong Material thì chỉ liệt kê rồi bỏ qua.
 *
 *   npx tsx scripts/data-ops/lubricant-create-points.ts           # xem trước, không ghi (mặc định)
 *   npx tsx scripts/data-ops/lubricant-create-points.ts --apply   # ghi vào DB hiện tại
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import groups from "../../app/(dashboard)/replacements/lubricant-statistics.json";
import { lubricantNextDue } from "../../lib/constants";
import { excelIntervalMonths, parseExcelLastDate } from "../../lib/lubricant-excel-dates";
import { expandSourceRows } from "../../lib/lubricant-link-targets";
import { positionCodeOf } from "../../lib/position-catalog";

loadEnvConfig(process.cwd());
const apply = process.argv.includes("--apply");
const prisma = new PrismaClient();
const fold = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase().replace(/\s+/g, " ").trim();
const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

async function main() {
  console.log(`DB: ${new URL(process.env.DATABASE_URL ?? "http://invalid").host} · ${apply ? "GHI" : "XEM TRƯỚC (thêm --apply để ghi)"}`);
  const wanted = expandSourceRows(groups).filter((row) => row.target?.create);
  const [materials, points, admin] = await Promise.all([
    prisma.material.findMany({ select: { id: true, code: true, machine: true, system: true } }),
    prisma.materialReplacement.findMany({ where: { isActive: true }, select: { deviceSeq: true, location: true, machine: true, material: { select: { code: true } } } }),
    prisma.user.findFirst({ where: { role: "ADMIN", isActive: true }, select: { id: true }, orderBy: { createdAt: "asc" } }),
  ]);
  if (!admin) throw new Error("Không có tài khoản ADMIN để ghi createdById");
  const existing = new Set(points.map((p) => `${p.deviceSeq ?? fold(p.location ?? "")}|${p.machine}|${p.material.code}`));
  const nodes = new Set((await prisma.equipmentNode.findMany({
    where: { seq: { in: wanted.flatMap((row) => row.target && "deviceSeq" in row.target ? [row.target.deviceSeq] : []) } }, select: { seq: true },
  })).map((node) => node.seq));
  const today = new Date();
  const created: Record<string, number> = {};
  const missingOil: string[] = [];
  const skipped: string[] = [];

  for (const row of wanted) {
    const target = row.target!;
    const where = "deviceSeq" in target ? target.deviceSeq : target.location;
    const label = `${row.group} | ${row.name} -> ${where} / ${target.machine} / ${target.materialCode || "?"}`;
    const material = materials.find((m) => m.code === target.materialCode && m.machine === target.machine)
      ?? materials.find((m) => m.code === target.materialCode && m.machine === "COMMON")
      ?? materials.find((m) => m.code === target.materialCode);
    if (!target.materialCode || !material) { missingOil.push(`${row.group} | ${row.name} | dầu "${row.cells[3].replace(/\s+/g, " ")}"`); continue; }
    if ("deviceSeq" in target && !nodes.has(target.deviceSeq)) { skipped.push(`${label} (không có nút thiết bị)`); continue; }
    if (existing.has(`${"deviceSeq" in target ? target.deviceSeq : fold(target.location)}|${target.machine}|${target.materialCode}`)) { skipped.push(`${label} (đã có điểm)`); continue; }

    const position = target.position ?? row.cells[1];
    const lastReplacedAt = parseExcelLastDate(row.cells[6]);
    const months = excelIntervalMonths(row.cells[7]);
    const nextDueAt = (lastReplacedAt && months ? lubricantNextDue(lastReplacedAt.toISOString().slice(0, 10), months) : null)
      ?? (months ? lubricantNextDue(dateOnly(today), months) : null) ?? today;
    const quantity = Math.max(1, Math.round(Number(/\d+(?:[.,]\d+)?/.exec(row.cells[5])?.[0].replace(",", ".")) || 1));
    console.log(`${apply ? "TẠO " : "SẼ TẠO "}${label} · ${quantity} · chu kỳ ${months ?? 0}th · hạn ${dateOnly(nextDueAt)}`);
    created[row.group] = (created[row.group] ?? 0) + 1;
    if (!apply) continue;
    await prisma.materialReplacement.create({
      data: {
        materialId: material.id,
        deviceSeq: "deviceSeq" in target ? target.deviceSeq : null,
        location: "location" in target ? target.location : null,
        machine: target.machine,
        system: material.system,
        quantity,
        managingPosition: position || null,
        managingPositionCode: positionCodeOf(position),
        intervalMonths: months ?? 0,
        lastReplacedAt,
        nextDueAt,
        note: "Tạo từ bảng theo dõi dầu mỡ",
        isActive: true,
        createdById: admin.id,
      },
    });
    existing.add(`${"deviceSeq" in target ? target.deviceSeq : fold(target.location)}|${target.machine}|${target.materialCode}`);
  }

  console.log(`\n${apply ? "Đã tạo" : "Sẽ tạo"}: ${Object.values(created).reduce((a, b) => a + b, 0)} điểm`, created);
  if (skipped.length) console.log(`\nBỏ qua (${skipped.length}):\n${skipped.join("\n")}`);
  if (missingOil.length) console.log(`\nThiếu mã vật tư, KHÔNG tạo (${missingOil.length}):\n${missingOil.join("\n")}`);
}

main().finally(() => prisma.$disconnect());
