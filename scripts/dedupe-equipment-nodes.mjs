import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compareSeq(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i += 1) {
    const x = i < pa.length ? pa[i] : -1;
    const y = i < pb.length ? pb[i] : -1;
    if (x !== y) return x - y;
  }
  return 0;
}

function inferParentSeq(seq, bySeq) {
  const parts = seq.split(".");
  parts.pop();
  while (parts.length) {
    const parent = parts.join(".");
    if (bySeq.has(parent)) return parent;
    parts.pop();
  }
  return null;
}

function firstFilled(field, nodes) {
  for (const node of nodes) {
    const value = node[field];
    if (value !== null && value !== undefined && String(value).trim()) return value;
  }
  return null;
}

function buildDuplicateGroups(nodes) {
  const bySeq = new Map(nodes.map((node) => [node.seq, node]));
  const childrenOf = new Map();

  for (const node of nodes) {
    const parentSeq = node.parentSeq && bySeq.has(node.parentSeq) ? node.parentSeq : inferParentSeq(node.seq, bySeq);
    if (!parentSeq) continue;
    const children = childrenOf.get(parentSeq) ?? [];
    children.push(node);
    childrenOf.set(parentSeq, children);
  }

  const groups = [];
  for (const [parentSeq, children] of childrenOf.entries()) {
    const leaves = children.filter((node) => !(childrenOf.get(node.seq) ?? []).length);
    const byContent = new Map();
    for (const node of leaves) {
      const key = [parentSeq, normalizeText(node.name)].join("|");
      const group = byContent.get(key) ?? [];
      group.push(node);
      byContent.set(key, group);
    }

    for (const group of byContent.values()) {
      if (group.length > 1) {
        groups.push(group.sort((a, b) => compareSeq(a.seq, b.seq)));
      }
    }
  }

  return groups.sort((a, b) => b.length - a.length || compareSeq(a[0].seq, b[0].seq));
}

async function mergeLinkedDevice(tx, keepSeq, duplicateSeqs, keepNode) {
  const seqs = [keepSeq, ...duplicateSeqs];
  const devices = await tx.device.findMany({ where: { code: { in: seqs } }, orderBy: { code: "asc" } });
  if (!devices.length) return { mergedDevices: 0, movedRelations: 0 };

  let target = devices.find((device) => device.code === keepSeq) ?? null;
  if (!target) {
    target = devices.sort((a, b) => compareSeq(a.code, b.code))[0];
    target = await tx.device.update({
      where: { id: target.id },
      data: {
        code: keepSeq,
        name: target.name || keepNode.name,
        system: target.system || keepNode.name,
      },
    });
  }

  const extras = devices.filter((device) => device.id !== target.id);
  if (!extras.length) return { mergedDevices: 0, movedRelations: 0 };

  const extraIds = extras.map((device) => device.id);
  const [repairLogs, deviceMaterials, replacements] = await Promise.all([
    tx.repairLog.updateMany({ where: { deviceId: { in: extraIds } }, data: { deviceId: target.id } }),
    tx.deviceMaterial.updateMany({ where: { deviceId: { in: extraIds } }, data: { deviceId: target.id } }),
    tx.materialReplacement.updateMany({ where: { deviceId: { in: extraIds } }, data: { deviceId: target.id } }),
  ]);
  await tx.device.deleteMany({ where: { id: { in: extraIds } } });

  return {
    mergedDevices: extras.length,
    movedRelations: repairLogs.count + deviceMaterials.count + replacements.count,
  };
}

async function mergePositionScopes(tx, keepSeq, duplicateSeqs) {
  const scopes = await tx.positionSystemScope.findMany({ where: { systemSeq: { in: duplicateSeqs } } });
  for (const scope of scopes) {
    await tx.positionSystemScope.upsert({
      where: { position_systemSeq: { position: scope.position, systemSeq: keepSeq } },
      update: {},
      create: { position: scope.position, systemSeq: keepSeq },
    });
  }
  if (scopes.length) {
    await tx.positionSystemScope.deleteMany({ where: { id: { in: scopes.map((scope) => scope.id) } } });
  }
  return scopes.length;
}

async function main() {
  const nodes = await prisma.equipmentNode.findMany({ orderBy: { sort: "asc" } });
  const groups = buildDuplicateGroups(nodes);
  const duplicateCount = groups.reduce((sum, group) => sum + group.length - 1, 0);

  console.log(`Duplicate leaf groups: ${groups.length}`);
  console.log(`Equipment nodes to delete: ${duplicateCount}`);
  for (const group of groups.slice(0, 15)) {
    const keep = group[0];
    const duplicates = group.slice(1);
    console.log(
      `${group.length} nodes | keep ${keep.seq} | delete ${duplicates.slice(0, 6).map((node) => node.seq).join(", ")}${duplicates.length > 6 ? " ..." : ""} | ${keep.name}`
    );
  }

  if (!APPLY || !groups.length) {
    console.log(APPLY ? "No duplicate nodes found." : "Dry run only. Re-run with --apply to delete duplicate source data.");
    return;
  }

  const backupDir = path.join(process.cwd(), "scripts", "data");
  await fs.mkdir(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `equipment-dedupe-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await fs.writeFile(
    backupPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        deletedCount: duplicateCount,
        groups: groups.map((group) => ({ keep: group[0], delete: group.slice(1) })),
      },
      null,
      2
    ),
    "utf8"
  );

  const stats = {
    deletedNodes: 0,
    updatedDefects: 0,
    updatedDefectHistories: 0,
    mergedDevices: 0,
    movedDeviceRelations: 0,
    movedPositionScopes: 0,
  };

  for (const group of groups) {
    const keep = group[0];
    const duplicates = group.slice(1);
    const duplicateSeqs = duplicates.map((node) => node.seq);

    await prisma.$transaction(async (tx) => {
      const mergeData = {
        code: keep.code || firstFilled("code", duplicates) || keep.seq,
        kks: keep.kks || firstFilled("kks", duplicates),
        drawing: keep.drawing || firstFilled("drawing", duplicates),
        attachedInfo: keep.attachedInfo || firstFilled("attachedInfo", duplicates),
        documentUrl: keep.documentUrl || firstFilled("documentUrl", duplicates),
        imageUrl: keep.imageUrl || firstFilled("imageUrl", duplicates),
      };
      await tx.equipmentNode.update({ where: { seq: keep.seq }, data: mergeData });

      const defects = await tx.defect.updateMany({ where: { device: { in: duplicateSeqs } }, data: { device: keep.seq } });
      const histories = await tx.defectHistory.updateMany({ where: { device: { in: duplicateSeqs } }, data: { device: keep.seq } });
      const deviceStats = await mergeLinkedDevice(tx, keep.seq, duplicateSeqs, keep);
      const movedScopes = await mergePositionScopes(tx, keep.seq, duplicateSeqs);

      const deleted = await tx.equipmentNode.deleteMany({ where: { seq: { in: duplicateSeqs } } });

      stats.updatedDefects += defects.count;
      stats.updatedDefectHistories += histories.count;
      stats.mergedDevices += deviceStats.mergedDevices;
      stats.movedDeviceRelations += deviceStats.movedRelations;
      stats.movedPositionScopes += movedScopes;
      stats.deletedNodes += deleted.count;
    });
  }

  console.log(`Backup written: ${backupPath}`);
  console.log(JSON.stringify(stats, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
