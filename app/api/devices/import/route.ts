import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { invalidateDeviceListCache } from "@/lib/device-list-cache";
import { requirePermissionLevel } from "@/lib/rbac-guard";

function parentSeqOf(seq: string) {
  const parts = seq.split(".");
  parts.pop();
  return parts.length ? parts.join(".") : null;
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "device-manage", ["manage", "full"], "Không đủ quyền nhập danh mục thiết bị");
    const body = await req.json();
    const rows: Array<{ code?: string; name?: string; systemSeq?: string }> = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) return fail("Không có dòng dữ liệu hợp lệ");

    let created = 0;
    let updated = 0;
    const skipped: string[] = [];
    const maxSort = await prisma.equipmentNode.aggregate({ _max: { sort: true } });
    let nextSort = (maxSort._max.sort ?? 0) + 1;

    for (const row of rows) {
      const seq = String(row.code ?? "").trim();
      if (!seq) continue;
      const name = row.name != null ? String(row.name).trim() : "";
      const parentSeq = String(row.systemSeq ?? "").trim() || parentSeqOf(seq);

      const existing = await prisma.equipmentNode.findUnique({ where: { seq } });
      if (existing) {
        await prisma.equipmentNode.update({
          where: { seq },
          data: {
            ...(name ? { name } : {}),
            ...(parentSeq ? { parentSeq } : {}),
          },
        });
        updated++;
      } else {
        if (!name) {
          skipped.push(seq);
          continue;
        }
        await prisma.equipmentNode.create({
          data: {
            seq,
            code: seq,
            name,
            parentSeq,
            depth: seq.split(".").length,
            sort: nextSort++,
            drawing: null,
            kks: null,
            deviceSynced: true,
          },
        });
        created++;
      }
    }

    await audit(user.id, "IMPORT_EQUIPMENT_NODES", "EquipmentNode", undefined, `tạo ${created}, cập nhật ${updated}`);
    invalidateDeviceListCache();
    return ok({ created, updated, skipped });
  });
}
