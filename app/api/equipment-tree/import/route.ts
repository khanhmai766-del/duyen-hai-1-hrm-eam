import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { invalidateEquipmentNodeCache } from "@/lib/equipment-node-cache";
import { invalidateDeviceListCache } from "@/lib/device-list-cache";
import {
  validateAndBuild,
  type RawImportRow,
  type ImportMode,
  type ExistingIndex,
  type BuiltNode,
  S1_PREFIX,
} from "@/lib/equipment-import";

export const dynamic = "force-dynamic";

const MAX_ROWS = 40000;
const CHUNK = 500;

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "device-manage", ["manage", "full"], "Không đủ quyền nhập danh mục thiết bị");

    const body = await req.json();
    const rows: RawImportRow[] = Array.isArray(body.rows) ? body.rows : [];
    const system = String(body.system ?? "").trim();
    const mode: ImportMode = ["ADD", "SYNC", "REPLACE"].includes(body.mode) ? body.mode : "SYNC";
    const dryRun = body.dryRun !== false; // mặc định preview cho an toàn
    if (!rows.length) return fail("Không có dòng dữ liệu");
    if (rows.length > MAX_ROWS) return fail(`Quá ${MAX_ROWS} dòng — hãy nhập theo từng hệ thống`);

    // Chỉ mục node hiện có (nhẹ) để xác định tạo/cập nhật + resolve cha.
    const existingRows = await prisma.equipmentNode.findMany({
      select: { seq: true, externalId: true, name: true, kks: true },
    });
    const existing: ExistingIndex = {
      byAsset: new Map(existingRows.filter((r) => r.externalId).map((r) => [r.externalId as string, r.seq])),
      seqs: new Set(existingRows.map((r) => r.seq)),
      detail: new Map(existingRows.map((r) => [r.seq, { name: r.name, kks: r.kks }])),
    };

    const { preview, nodes } = validateAndBuild(rows, system, existing, mode);

    if (dryRun) return ok({ preview, mode });

    // Không cho ghi khi có lỗi quan hệ cây / lỗi chặn.
    if (preview.errors.length) return fail(`Còn ${preview.errors.length} lỗi — không thể nhập. Hãy sửa file rồi thử lại.`);

    let created = 0, updated = 0, skipped = 0, deleted = 0;

    if (mode === "REPLACE") {
      const sysPrefix = system ? `${S1_PREFIX}.${system}` : S1_PREFIX;
      // Chặn thay thế nếu nhánh đã có dữ liệu nghiệp vụ.
      const used = await branchHasBusinessData(sysPrefix);
      if (used) return fail("Nhánh đã có dữ liệu nghiệp vụ (sửa chữa/khiếm khuyết/vật tư/QR) — không được thay thế. Hãy xử lý dữ liệu liên quan trước.");
      const del = await prisma.$executeRawUnsafe(
        `DELETE FROM "EquipmentNode" WHERE seq = $1 OR seq LIKE $2`,
        sysPrefix,
        `${sysPrefix}.%`
      );
      deleted = del;
      created = await insertMany(nodes);
    } else if (mode === "ADD") {
      const fresh = nodes.filter((n) => !existing.byAsset.has(n.externalId));
      skipped = nodes.length - fresh.length;
      created = await insertMany(fresh);
    } else {
      // SYNC: upsert theo externalId (thêm mới + cập nhật tên/mã/KKS/quan hệ), không tự xóa.
      for (const n of nodes) (existing.byAsset.has(n.externalId) ? updated++ : created++);
      await upsertManyByExternalId(nodes);
    }

    // Tính lại childCount toàn cây (chính xác) + xóa cache.
    await prisma.$executeRawUnsafe(
      `UPDATE "EquipmentNode" p SET "childCount" = (SELECT COUNT(*)::int FROM "EquipmentNode" c WHERE c."parentSeq" = p.seq)`
    );
    invalidateEquipmentNodeCache();
    invalidateDeviceListCache();

    await audit(
      user.id,
      "IMPORT_EQUIPMENT_TREE",
      "EquipmentNode",
      undefined,
      `HT ${system || "tất cả"} · ${mode} · tạo ${created}, cập nhật ${updated}, bỏ qua ${skipped}, xóa ${deleted}`
    );

    return ok({ result: { created, updated, skipped, deleted }, mode });
  });
}

async function branchHasBusinessData(sysPrefix: string): Promise<boolean> {
  const like = `${sysPrefix}.%`;
  const tables = [
    "RepairLog",
    "EquipmentMaterial",
    "DeviceQrCard",
    "MaterialReplacement",
    "Defect",
    "DefectRelatedDevice",
    "DefectHistory",
    "DefectHistoryRelatedDevice",
  ];
  for (const tbl of tables) {
    const rows = await prisma
      .$queryRawUnsafe<Array<{ n: number }>>(
        `SELECT 1 AS n FROM "${tbl}" WHERE "deviceSeq" = $1 OR "deviceSeq" LIKE $2 LIMIT 1`,
        sysPrefix,
        like
      )
      .catch(() => [] as Array<{ n: number }>);
    if (rows.length) return true;
  }
  return false;
}

/** createMany theo lô. */
async function insertMany(nodes: BuiltNode[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < nodes.length; i += CHUNK) {
    const chunk = nodes.slice(i, i + CHUNK);
    const res = await prisma.equipmentNode.createMany({ data: chunk, skipDuplicates: true });
    n += res.count;
  }
  return n;
}

/** Upsert theo externalId (Assetid) bằng raw INSERT ... ON CONFLICT — không ghi 32k query lẻ. */
async function upsertManyByExternalId(nodes: BuiltNode[]): Promise<void> {
  const cols = 14;
  for (let i = 0; i < nodes.length; i += CHUNK) {
    const chunk = nodes.slice(i, i + CHUNK);
    const values: string[] = [];
    const params: unknown[] = [];
    chunk.forEach((n, j) => {
      const b = j * cols;
      values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},CURRENT_TIMESTAMP)`);
      params.push(
        randomUUID(), n.seq, n.externalId, n.parentSeq, n.code, n.name, n.kks, n.drawing,
        n.depth, n.sort, n.searchText, n.childCount, false
      );
    });
    const sql = `
      INSERT INTO "EquipmentNode"
        (id, seq, "externalId", "parentSeq", code, name, kks, drawing, depth, sort, "searchText", "childCount", "deviceSynced", "createdAt")
      VALUES ${values.join(",")}
      ON CONFLICT ("externalId") DO UPDATE SET
        seq = EXCLUDED.seq, "parentSeq" = EXCLUDED."parentSeq", code = EXCLUDED.code,
        name = EXCLUDED.name, kks = EXCLUDED.kks, drawing = EXCLUDED.drawing,
        depth = EXCLUDED.depth, sort = EXCLUDED.sort, "searchText" = EXCLUDED."searchText"
    `;
    await prisma.$executeRawUnsafe(sql, ...params);
  }
}
