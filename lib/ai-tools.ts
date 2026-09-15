import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeText } from "@/lib/nav";
import { equipmentSeqWhere, resolveEquipmentAccessForUser } from "@/lib/server-access";
import { getCachedEquipmentNodeList } from "@/lib/equipment-node-cache";
import { canViewPosition, resolvePositionViewScope } from "@/lib/position-data-scope";
import { canViewMaterialReplacement } from "@/lib/material-replacement-access";
import { createAiCitationProof } from "@/lib/ai-auth";

export type AiToolUser = Awaited<ReturnType<typeof import("@/lib/ai-auth").requireAiToolUser>>;

const MAX_RESULTS = 20;

export function sealAiToolResult<T extends { items?: Array<Record<string, unknown>> }>(user: AiToolUser, result: T) {
  return {
    ...result,
    items: result.items?.map((item) => ({
      ...item,
      proof: createAiCitationProof(user.conversationId, {
        sourceType: String(item.sourceType ?? ""),
        sourceId: String(item.sourceId ?? ""),
        url: String(item.url ?? ""),
      }),
    })) ?? [],
  };
}

function limitOf(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(MAX_RESULTS, Math.max(1, parsed)) : 10;
}

function text(value: unknown, max = 300) {
  return String(value ?? "").trim().slice(0, max);
}

function date(value: unknown, endOfDay = false) {
  const raw = text(value, 40);
  if (!raw) return null;
  const parsed = new Date(endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59.999+07:00` : raw);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function dateRange(input: Record<string, unknown>) {
  const from = date(input.from);
  const to = date(input.to, true);
  return from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;
}

function machine(value: unknown) {
  const normalized = text(value, 10).toUpperCase();
  return ["S1", "S2", "COMMON"].includes(normalized) ? normalized : null;
}

function deviceUrl(seq: string, selectedMachine?: string | null) {
  const suffix = selectedMachine ? `?machine=${encodeURIComponent(selectedMachine)}` : "";
  return `/devices/${encodeURIComponent(seq)}${suffix}`;
}

export async function aiSearchDevices(user: AiToolUser, input: Record<string, unknown>) {
  const query = normalizeText(text(input.query));
  if (query.length < 2) return { items: [], message: "Cần ít nhất 2 ký tự để tìm thiết bị" };
  const selectedMachine = machine(input.machine);
  const [nodes, access] = await Promise.all([
    getCachedEquipmentNodeList(),
    resolveEquipmentAccessForUser(user),
  ]);
  const items = nodes
    .filter((node) => access.canViewSeq(node.seq))
    .map((node) => ({ node, haystack: normalizeText([node.seq, node.name, node.kks].filter(Boolean).join(" ")) }))
    .filter(({ haystack }) => haystack.includes(query))
    .sort((left, right) => {
      const leftExact = normalizeText(left.node.name) === query || normalizeText(left.node.seq) === query;
      const rightExact = normalizeText(right.node.name) === query || normalizeText(right.node.seq) === query;
      return Number(rightExact) - Number(leftExact) || left.node.depth - right.node.depth || left.node.name.localeCompare(right.node.name, "vi");
    })
    .slice(0, limitOf(input.limit))
    .map(({ node }) => ({
      sourceType: "DEVICE" as const,
      sourceId: node.seq,
      title: node.name,
      summary: [node.seq, node.kks ? `KKS ${node.kks}` : null].filter(Boolean).join(" · "),
      occurredAt: null,
      url: deviceUrl(node.seq, selectedMachine),
      data: { deviceSeq: node.seq, name: node.name, kks: node.kks ?? null, machine: selectedMachine },
    }));
  return { items, ambiguous: items.length > 1 };
}

export async function aiSearchDefects(user: AiToolUser, input: Record<string, unknown>) {
  const access = await resolveEquipmentAccessForUser(user);
  const viewScope = await resolvePositionViewScope(user, "defect");
  const selectedMachine = machine(input.machine);
  const deviceSeq = text(input.deviceSeq, 200);
  const query = text(input.query);
  const requestNumber = text(input.requestNumber, 100);
  const range = dateRange(input);
  const requestedStatuses = Array.isArray(input.status)
    ? input.status.map((value) => text(value, 50)).filter(Boolean)
    : text(input.status, 50) ? [text(input.status, 50)] : [];
  const scopeWhere = equipmentSeqWhere(access.branchFilter, "deviceSeq") as Prisma.DefectWhereInput | null;
  const andConditions: Prisma.DefectWhereInput[] = [
    ...(scopeWhere ? [{ OR: [scopeWhere, { deviceSeq: null }] }] : []),
    ...(deviceSeq ? [{ OR: [{ deviceSeq }, { relatedDevices: { some: { deviceSeq } } }] }] : []),
  ];
  if (query) {
    andConditions.push({ OR: [
      { requestNumber: { contains: query, mode: "insensitive" } },
      { content: { contains: query, mode: "insensitive" } },
      { device: { contains: query, mode: "insensitive" } },
      { node: { name: { contains: query, mode: "insensitive" } } },
      { repairResultRaw: { contains: query, mode: "insensitive" } },
    ] });
  }
  const where: Prisma.DefectWhereInput = {
    AND: andConditions,
    ...(selectedMachine ? { unit: selectedMachine } : {}),
    ...(requestNumber ? { requestNumber: { contains: requestNumber, mode: "insensitive" } } : {}),
    ...(requestedStatuses.length ? { status: { in: requestedStatuses } } : {}),
    ...(text(input.severity, 10) ? { severity: text(input.severity, 10) } : {}),
    ...(range ? { detectedAt: range } : {}),
    cancelledAt: null,
  };
  const rows = await prisma.defect.findMany({
    where,
    orderBy: [{ detectedAt: "desc" }, { createdAt: "desc" }],
    take: Math.min(MAX_RESULTS * 4, limitOf(input.limit) * 4),
    select: {
      id: true, unit: true, deviceSeq: true, device: true, system: true, severity: true,
      requestType: true, requestNumber: true, content: true, status: true, detectedAt: true,
      repairOrderNumberRaw: true, repairSolutionRaw: true, repairPlanRaw: true,
      repairUnitRaw: true, repairResultRaw: true, repairPerformedByRaw: true,
      repairStartedAt: true, repairPerformedContentRaw: true, postRepairAwaitingMaterial: true,
      node: { select: { name: true } },
    },
  });
  const items = rows
    .filter((row) => canViewPosition(row.system, viewScope))
    .slice(0, limitOf(input.limit))
    .map((row) => ({
      sourceType: "DEFECT" as const,
      sourceId: row.id,
      title: [row.requestNumber || "Chưa cấp số", row.node?.name ?? row.device ?? "Chưa ánh xạ thiết bị"].join(" — "),
      summary: [row.status, row.severity ? `Mức ${row.severity}` : null, row.content].filter(Boolean).join(" · "),
      occurredAt: row.detectedAt?.toISOString() ?? null,
      url: `/defects?q=${encodeURIComponent(row.requestNumber ?? row.id)}`,
      data: row,
    }));
  return { items, hasMore: rows.length > items.length };
}

export async function aiGetDeviceHistory(user: AiToolUser, input: Record<string, unknown>) {
  const deviceSeq = text(input.deviceSeq, 200);
  if (!deviceSeq) return { items: [], message: "Thiếu mã thiết bị" };
  const access = await resolveEquipmentAccessForUser(user);
  if (!access.canViewSeq(deviceSeq)) return { items: [], message: "Không có quyền xem thiết bị này" };
  const [defectScope, replacementScope] = await Promise.all([
    resolvePositionViewScope(user, "defect"),
    resolvePositionViewScope(user, "replacement"),
  ]);
  const selectedMachine = machine(input.machine);
  const range = dateRange(input);
  const perType = limitOf(input.limit);
  const [histories, repairs, replacements] = await Promise.all([
    prisma.defectHistory.findMany({
      where: {
        OR: [{ deviceSeq }, { relatedDevices: { some: { deviceSeq } } }],
        ...(selectedMachine ? { unit: selectedMachine } : {}),
        ...(range ? { performedAt: range } : {}),
      },
      orderBy: { performedAt: "desc" },
      take: perType * 3,
      select: {
        id: true, defectId: true, unit: true, deviceSeq: true, device: true, system: true,
        requestType: true, workOrderNumber: true, performedAt: true, result: true,
        defectContent: true, content: true, requestNumber: true,
      },
    }),
    user.accessMode === "DEFECT_READ_ONLY" ? Promise.resolve([]) : prisma.repairLog.findMany({
      where: {
        deviceSeq,
        ...(selectedMachine ? { machine: selectedMachine } : {}),
        ...(range ? { startedAt: range } : {}),
      },
      orderBy: { startedAt: "desc" },
      take: perType,
      select: {
        id: true, deviceSeq: true, machine: true, title: true, description: true,
        symptom: true, cause: true, action: true, result: true, startedAt: true,
        completedAt: true, status: true, priority: true, downtime: true,
      },
    }),
    user.accessMode === "DEFECT_READ_ONLY" ? Promise.resolve([]) : prisma.materialReplacementLog.findMany({
      where: {
        deviceSeq,
        ...(selectedMachine ? { machine: selectedMachine } : {}),
        ...(range ? { replacedAt: range } : {}),
      },
      orderBy: { replacedAt: "desc" },
      take: perType * 3,
      select: {
        id: true, replacementId: true, replacedAt: true, quantity: true, usedQuantity: true,
        note: true, materialId: true, deviceSeq: true, machine: true, systemLabel: true,
        deviceLabel: true, managingPosition: true, intervalMonths: true, intervalNote: true,
        unitLabel: true, requestNumber: true, pctNumber: true, materialNameLabel: true,
        material: { select: { code: true, name: true, unit: true } },
        replacement: { select: { deviceSeq: true, system: true, managingPosition: true } },
      },
    }),
  ]);

  const items = [
    ...histories.filter((row) => canViewPosition(row.system, defectScope)).map((row) => ({
      sourceType: "DEFECT_HISTORY" as const,
      sourceId: row.id,
      title: `Lịch sử ${row.requestNumber || row.workOrderNumber || row.id}`,
      summary: [row.defectContent, row.content, row.result].filter(Boolean).join(" · "),
      occurredAt: row.performedAt.toISOString(),
      url: `/repair-history?search=${encodeURIComponent(row.requestNumber ?? row.workOrderNumber ?? row.id)}`,
      data: row,
    })),
    ...repairs.map((row) => ({
      sourceType: "REPAIR" as const,
      sourceId: row.id,
      title: row.title,
      summary: [row.status, row.description, row.result].filter(Boolean).join(" · "),
      occurredAt: row.startedAt.toISOString(),
      url: `/repair-history/${encodeURIComponent(deviceSeq)}`,
      data: row,
    })),
    ...replacements.filter((row) => canViewMaterialReplacement(access, {
      deviceSeq: row.deviceSeq ?? row.replacement?.deviceSeq,
      system: row.systemLabel ?? row.replacement?.system,
      managingPosition: row.managingPosition ?? row.replacement?.managingPosition,
    }, replacementScope)).map((row) => ({
      sourceType: "MATERIAL_REPLACEMENT" as const,
      sourceId: row.id,
      title: `Thay ${row.material?.name ?? row.materialNameLabel ?? "vật tư"}`,
      summary: [
        row.usedQuantity ?? row.quantity,
        row.unitLabel ?? row.material?.unit,
        row.requestNumber ? `SYC ${row.requestNumber}` : null,
        row.note,
      ].filter((value) => value !== null && value !== undefined && value !== "").join(" · "),
      occurredAt: row.replacedAt.toISOString(),
      url: `/replacement-history?q=${encodeURIComponent(row.requestNumber ?? deviceSeq)}`,
      data: row,
    })),
  ].sort((left, right) => String(right.occurredAt).localeCompare(String(left.occurredAt))).slice(0, perType);
  return { items, hasMore: histories.length + repairs.length + replacements.length > items.length };
}

export async function aiSearchMaterialReplacements(user: AiToolUser, input: Record<string, unknown>) {
  if (user.accessMode === "DEFECT_READ_ONLY") {
    return { items: [] as Array<Record<string, unknown>>, hasMore: false, message: "Tài khoản này chỉ được tra cứu khiếm khuyết" };
  }
  const access = await resolveEquipmentAccessForUser(user);
  const viewScope = await resolvePositionViewScope(user, "replacement");
  const query = text(input.query);
  const deviceSeq = text(input.deviceSeq, 200);
  const selectedMachine = machine(input.machine);
  const range = dateRange(input);
  const take = limitOf(input.limit);
  const rows = await prisma.materialReplacementLog.findMany({
    where: {
      ...(deviceSeq ? { deviceSeq } : {}),
      ...(selectedMachine ? { machine: selectedMachine } : {}),
      ...(range ? { replacedAt: range } : {}),
      ...(query ? { OR: [
        { materialNameLabel: { contains: query, mode: "insensitive" } },
        { deviceLabel: { contains: query, mode: "insensitive" } },
        { deviceSeq: { contains: query, mode: "insensitive" } },
        { requestNumber: { contains: query, mode: "insensitive" } },
        { pctNumber: { contains: query, mode: "insensitive" } },
        { material: { name: { contains: query, mode: "insensitive" } } },
      ] } : {}),
    },
    orderBy: { replacedAt: "desc" },
    take: take * 5,
    select: {
      id: true, replacementId: true, replacedAt: true, quantity: true, usedQuantity: true,
      note: true, materialId: true, deviceSeq: true, machine: true, systemLabel: true,
      deviceLabel: true, managingPosition: true, intervalMonths: true, intervalNote: true,
      unitLabel: true, requestNumber: true, pctNumber: true, unplanned: true,
      bbntDoNumber: true, proposalNumber: true, deliveryNoteNumber: true,
      materialNameLabel: true, importSource: true,
      material: { select: { code: true, name: true, unit: true } },
      replacement: { select: { deviceSeq: true, system: true, managingPosition: true } },
    },
  });
  const items = rows.filter((row) => canViewMaterialReplacement(access, {
    deviceSeq: row.deviceSeq ?? row.replacement?.deviceSeq,
    system: row.systemLabel ?? row.replacement?.system,
    managingPosition: row.managingPosition ?? row.replacement?.managingPosition,
    importSource: row.importSource,
  }, viewScope)).slice(0, take).map((row) => ({
    sourceType: "MATERIAL_REPLACEMENT" as const,
    sourceId: row.id,
    title: `Thay ${row.material?.name ?? row.materialNameLabel ?? "vật tư"}`,
    summary: [row.deviceLabel ?? row.deviceSeq, row.usedQuantity ?? row.quantity, row.unitLabel ?? row.material?.unit, row.requestNumber].filter((value) => value !== null && value !== undefined && value !== "").join(" · "),
    occurredAt: row.replacedAt.toISOString(),
    url: `/replacement-history?q=${encodeURIComponent(row.requestNumber ?? row.deviceSeq ?? row.id)}`,
    data: row,
  }));

  const due = text(input.due, 20).toUpperCase();
  let dueItems: Array<Record<string, unknown>> = [];
  if (due) {
    const now = new Date();
    const soon = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
    const points = await prisma.materialReplacement.findMany({
      where: {
        isActive: true,
        ...(deviceSeq ? { deviceSeq } : {}),
        ...(selectedMachine ? { machine: selectedMachine } : {}),
        ...(due === "OVERDUE" ? { nextDueAt: { lt: now } } : { nextDueAt: { gte: now, lte: soon } }),
      },
      orderBy: { nextDueAt: "asc" },
      take: take * 5,
      select: {
        id: true, deviceSeq: true, machine: true, system: true, location: true,
        managingPosition: true, managingPositionCode: true, intervalMonths: true,
        intervalNote: true, lastReplacedAt: true, nextDueAt: true,
        material: { select: { code: true, name: true, unit: true } },
        device: { select: { name: true } },
      },
    });
    dueItems = points.filter((row) => canViewMaterialReplacement(access, row, viewScope)).slice(0, take).map((row) => ({
      sourceType: "MATERIAL_REPLACEMENT" as const,
      sourceId: row.id,
      title: `${due === "OVERDUE" ? "Quá hạn" : "Sắp đến hạn"}: ${row.material.name}`,
      summary: [row.device?.name ?? row.location ?? row.deviceSeq, row.nextDueAt.toISOString()].filter(Boolean).join(" · "),
      occurredAt: row.nextDueAt.toISOString(),
      url: `/replacement-history?q=${encodeURIComponent(row.deviceSeq ?? row.material.code)}`,
      data: row,
    }));
  }
  return { items: [...dueItems, ...items].slice(0, take), hasMore: rows.length > items.length };
}
