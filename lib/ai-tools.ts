import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeText } from "@/lib/nav";
import { equipmentSeqWhere, resolveEquipmentAccessForUser } from "@/lib/server-access";
import { getCachedEquipmentNodeList } from "@/lib/equipment-node-cache";
import { canViewPosition, resolvePositionViewScope } from "@/lib/position-data-scope";
import { canViewMaterialReplacement } from "@/lib/material-replacement-access";
import { normalizeAiCitation } from "@/lib/ai-chat";
import { SHIFT_TYPE, SHIFT_TYPE_ORDER, type ShiftTypeKey } from "@/lib/constants";
import { dateRange as dayRange } from "@/lib/utils";
import { compactAiFacts as facts, fitAiToolItems } from "@/lib/ai-tool-budget";
import {
  AI_MAX_TOOL_CALLS,
  claimAiToolCall,
  recordAiCitations,
  type AiToolName,
} from "@/lib/ai-request-registry";

export type AiToolUser = Awaited<ReturnType<typeof import("@/lib/ai-auth").requireAiToolUser>>;

const MAX_RESULTS = 20;

/** Đọc thân yêu cầu của công cụ; body hỏng/không phải object thì coi như rỗng thay vì lỗi 500. */
export async function readAiToolInput(req: Request): Promise<Record<string, unknown>> {
  const body: unknown = await req.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

/**
 * Chạy một công cụ AI qua các rào của lượt hỏi (xem lib/ai-request-registry.ts và
 * lib/ai-tool-budget.ts): giới hạn số lần gọi, phát tiến trình, cắt kết quả vừa ngân sách token
 * và ghi lại nguồn phía máy chủ.
 *
 * Kết quả gửi cho mô hình BỎ `url` (nguồn do website tự gắn, mô hình không cần thấy đường dẫn
 * nên cũng không bịa link) và `summary` (trùng với `facts`). Chỉ những dòng mô hình THẬT SỰ
 * nhận được mới được ghi làm nguồn đối chiếu.
 */
export async function runAiTool<T extends { items?: Array<Record<string, unknown>> }>(
  user: AiToolUser,
  tool: AiToolName,
  run: () => Promise<T>
) {
  const owner = { userId: user.id, conversationId: user.conversationId };
  if (user.requestId && !claimAiToolCall(user.requestId, owner, tool).allowed) {
    return {
      items: [],
      message: `Đã dùng hết ${AI_MAX_TOOL_CALLS} lần tra cứu cho câu hỏi này. Hãy trả lời dựa trên dữ liệu đã có, hoặc đề nghị người dùng hỏi cụ thể hơn.`,
    };
  }
  const result = await run();
  const rows = result.items ?? [];
  const fitted = fitAiToolItems(rows.map((item) => Object.fromEntries(
    Object.entries(item).filter(([key]) => key !== "url" && key !== "summary")
  )));
  if (user.requestId) {
    recordAiCitations(user.requestId, owner, rows.slice(0, fitted.items.length).flatMap((item) => normalizeAiCitation(item) ?? []));
  }
  return {
    ...result,
    items: fitted.items,
    ...(fitted.omitted > 0 ? {
      omitted: fitted.omitted,
      message: `Còn ${fitted.omitted} kết quả không gửi kèm vì giới hạn độ dài. Nói rõ điều này và đề nghị người dùng lọc hẹp hơn (tổ máy, khoảng thời gian, trạng thái).`,
    } : {}),
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
      facts: facts({ deviceSeq: node.seq, name: node.name, kks: node.kks, machine: selectedMachine }),
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
      facts: facts({ unit: row.unit, status: row.status, severity: row.severity, requestType: row.requestType, requestNumber: row.requestNumber, device: row.node?.name ?? row.device, deviceSeq: row.deviceSeq, system: row.system, content: row.content, detectedAt: row.detectedAt, repairOrderNumber: row.repairOrderNumberRaw, repairSolution: row.repairSolutionRaw, repairPlan: row.repairPlanRaw, repairUnit: row.repairUnitRaw, repairResult: row.repairResultRaw, repairPerformedBy: row.repairPerformedByRaw, repairStartedAt: row.repairStartedAt, repairPerformedContent: row.repairPerformedContentRaw, awaitingMaterial: row.postRepairAwaitingMaterial }),
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
      facts: facts({ unit: row.unit, requestNumber: row.requestNumber, workOrderNumber: row.workOrderNumber, requestType: row.requestType, performedAt: row.performedAt, defectContent: row.defectContent, content: row.content, result: row.result }),
    })),
    ...repairs.map((row) => ({
      sourceType: "REPAIR" as const,
      sourceId: row.id,
      title: row.title,
      summary: [row.status, row.description, row.result].filter(Boolean).join(" · "),
      occurredAt: row.startedAt.toISOString(),
      url: `/repair-history/${encodeURIComponent(deviceSeq)}`,
      facts: facts({ machine: row.machine, status: row.status, priority: row.priority, startedAt: row.startedAt, completedAt: row.completedAt, description: row.description, symptom: row.symptom, cause: row.cause, action: row.action, result: row.result, downtime: row.downtime }),
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
      facts: facts({ material: row.material?.name ?? row.materialNameLabel, materialCode: row.material?.code, device: row.deviceLabel ?? row.deviceSeq, machine: row.machine, replacedAt: row.replacedAt, usedQuantity: row.usedQuantity, plannedQuantity: row.quantity, unit: row.unitLabel ?? row.material?.unit, requestNumber: row.requestNumber, pctNumber: row.pctNumber, intervalMonths: row.intervalMonths, note: row.note }),
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
    facts: facts({ material: row.material?.name ?? row.materialNameLabel, materialCode: row.material?.code, device: row.deviceLabel ?? row.deviceSeq, machine: row.machine, replacedAt: row.replacedAt, usedQuantity: row.usedQuantity, plannedQuantity: row.quantity, unit: row.unitLabel ?? row.material?.unit, requestNumber: row.requestNumber, pctNumber: row.pctNumber, bbntDoNumber: row.bbntDoNumber, unplanned: row.unplanned, intervalMonths: row.intervalMonths, note: row.note }),
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
      facts: facts({ material: row.material.name, materialCode: row.material.code, device: row.device?.name ?? row.location ?? row.deviceSeq, machine: row.machine, system: row.system, managingPosition: row.managingPosition, intervalMonths: row.intervalMonths, intervalNote: row.intervalNote, lastReplacedAt: row.lastReplacedAt, nextDueAt: row.nextDueAt }),
    }));
  }
  return { items: [...dueItems, ...items].slice(0, take), hasMore: rows.length > items.length };
}


/** Một ca trực chiếm nhiều chỗ hơn một dòng khiếm khuyết, nên trần thấp hơn các công cụ khác. */
const MAX_SHIFTS = 10;

function shiftTypeKey(value: unknown): ShiftTypeKey | null {
  const normalized = text(value, 20).toUpperCase();
  return normalized in SHIFT_TYPE ? (normalized as ShiftTypeKey) : null;
}

/**
 * Ngày của ca trực dưới dạng dd/mm/yyyy giờ Việt Nam.
 *
 * `Shift.date` được ghi ở NỬA ĐÊM GIỜ MÁY CHỦ (xem `dateRange` trong lib/utils.ts): production
 * chạy UTC nên là 00:00Z, máy dev Việt Nam thì là 17:00Z hôm trước. Quy về múi giờ VN cho ra
 * đúng ngày ở cả hai nơi, còn `slice(0, 10)` trên chuỗi ISO thì lệch một ngày trên máy dev.
 */
function vnDateLabel(value: Date) {
  return value.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });
}

/**
 * LỊCH TRỰC CA — ai trực ca nào, ngày nào, ở cương vị nào.
 *
 * Phạm vi bằng đúng `GET /api/shifts`: mọi tài khoản đăng nhập đều xem được sơ đồ ca trực, nên
 * công cụ không rào thêm. Chỉ trả TÊN + CƯƠNG VỊ, không trả điện thoại, ảnh, chữ ký hay điểm
 * danh — điểm danh là dữ liệu nhân sự, không thuộc phạm vi tra cứu vận hành.
 */
export async function aiGetShiftSchedule(user: AiToolUser, input: Record<string, unknown>) {
  const rawLimit = Number(input.limit);
  const take = Math.min(MAX_SHIFTS, Math.max(1, Number.isInteger(rawLimit) ? rawLimit : 3));
  const anchor = date(input.date);
  const from = date(input.from) ?? anchor;
  const to = date(input.to, true) ?? anchor;
  const window = {
    gte: dayRange(from ?? to ?? new Date()).start,
    lte: dayRange(to ?? from ?? new Date()).end,
  };
  const wantedType = shiftTypeKey(input.shiftType);
  const unit = text(input.unit, 60);
  // "tôi" = người đang hỏi; mô hình không biết id tài khoản nên chỉ cần truyền person="tôi".
  const rawPerson = text(input.person, 120);
  const person = /^(toi|minh|ban than)$/.test(normalizeText(rawPerson)) ? (user.name ?? "") : rawPerson;
  // Lọc người TRONG BỘ NHỚ chứ không bằng `contains` của Postgres: tên tiếng Việt phải so sau khi
  // bỏ dấu (normalizeText), nếu không thì "Khanh" không khớp "Khánh".
  const personNeedle = normalizeText(person).length >= 2 ? normalizeText(person) : "";

  const shifts = await prisma.shift.findMany({
    where: {
      date: window,
      ...(wantedType ? { shiftType: wantedType } : {}),
      ...(unit ? { unit: { contains: unit, mode: "insensitive" } } : {}),
    },
    orderBy: [{ date: "asc" }],
    // Lọc người diễn ra sau khi đọc, nên phải lấy dư mới đủ kết quả.
    take: personNeedle ? MAX_SHIFTS * 6 : take * 3,
    select: {
      id: true,
      date: true,
      shiftType: true,
      unit: true,
      assignments: {
        orderBy: { positionLabel: "asc" },
        select: { positionLabel: true, user: { select: { name: true } } },
      },
    },
  });

  const matched = shifts
    .map((shift) => ({
      shift,
      staff: shift.assignments
        .filter((assignment) => assignment.user?.name)
        .map((assignment) => `${assignment.positionLabel}: ${assignment.user.name}`),
    }))
    .filter(({ staff }) => !personNeedle || staff.some((line) => normalizeText(line).includes(personNeedle)))
    .sort((left, right) =>
      left.shift.date.getTime() - right.shift.date.getTime() ||
      SHIFT_TYPE_ORDER.indexOf(left.shift.shiftType as ShiftTypeKey) - SHIFT_TYPE_ORDER.indexOf(right.shift.shiftType as ShiftTypeKey));

  const items = matched.slice(0, take).map(({ shift, staff }) => ({
    sourceType: "SHIFT" as const,
    sourceId: shift.id,
    title: `Ca ${SHIFT_TYPE[shift.shiftType as ShiftTypeKey]?.label ?? shift.shiftType} ${vnDateLabel(shift.date)} — ${shift.unit}`,
    summary: `${staff.length} người trực`,
    occurredAt: shift.date.toISOString(),
    url: "/hr",
    facts: {
      ...facts({
        date: vnDateLabel(shift.date),
        shift: SHIFT_TYPE[shift.shiftType as ShiftTypeKey]?.label ?? shift.shiftType,
        unit: shift.unit,
        staffCount: staff.length,
      }),
      // Mảng KHÔNG bị compactAiFacts cắt còn 200 ký tự như chuỗi — cả kíp phải tới được mô hình.
      staff: staff.slice(0, 30),
    },
  }));

  return {
    items,
    ...(items.length === 0 ? {
      message: personNeedle
        ? "Không thấy người này trong sơ đồ ca trực của khoảng ngày đã hỏi"
        : "Không có ca trực nào khớp điều kiện trong khoảng ngày đã hỏi",
    } : {}),
    hasMore: matched.length > items.length,
  };
}

const ANNOUNCEMENT_CATEGORY_LABEL: Record<string, string> = {
  BULLETIN: "Bảng tin nội bộ",
  ORDER: "Mệnh lệnh sản xuất",
};

/**
 * THÔNG BÁO NỘI BỘ & MỆNH LỆNH SẢN XUẤT.
 *
 * Phạm vi bằng đúng `GET /api/announcements`: mọi tài khoản đăng nhập đều đọc được. Mệnh lệnh
 * đã hết hiệu lực (`invalidatedAt`) bị loại trừ mặc định — trả lời bằng mệnh lệnh đã huỷ là sai
 * nghiệp vụ; muốn tra cứu thì mô hình phải hỏi rõ (`includeInvalidated`).
 */
export async function aiSearchAnnouncements(user: AiToolUser, input: Record<string, unknown>) {
  void user;
  const query = text(input.query);
  const rawCategory = text(input.category, 20).toUpperCase();
  const category = rawCategory in ANNOUNCEMENT_CATEGORY_LABEL ? rawCategory : null;
  const range = dateRange(input);
  const includeInvalidated = input.includeInvalidated === true || text(input.includeInvalidated, 10) === "true";
  const take = limitOf(input.limit);

  const rows = await prisma.announcement.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(includeInvalidated ? {} : { invalidatedAt: null }),
      ...(range ? { OR: [{ issuedAt: range }, { issuedAt: null, createdAt: range }] } : {}),
      ...(query ? {
        AND: [{ OR: [
          { title: { contains: query, mode: "insensitive" } },
          { body: { contains: query, mode: "insensitive" } },
          { classification: { contains: query, mode: "insensitive" } },
          { orderedBy: { contains: query, mode: "insensitive" } },
        ] }],
      } : {}),
    },
    orderBy: [{ pinned: "desc" }, { issuedAt: "desc" }, { createdAt: "desc" }],
    take,
    select: {
      id: true, category: true, classification: true, stt: true, title: true, body: true,
      pinned: true, orderedBy: true, issuedAt: true, invalidatedAt: true, createdAt: true,
      createdBy: { select: { name: true } },
    },
  });

  const items = rows.map((row) => ({
    sourceType: "ANNOUNCEMENT" as const,
    sourceId: row.id,
    title: [ANNOUNCEMENT_CATEGORY_LABEL[row.category] ?? row.category, row.title].join(" — "),
    summary: [row.classification, row.orderedBy ? `Theo lệnh ${row.orderedBy}` : null].filter(Boolean).join(" · "),
    occurredAt: (row.issuedAt ?? row.createdAt).toISOString(),
    url: `/notifications?announcementId=${encodeURIComponent(row.id)}`,
    facts: facts({
      category: ANNOUNCEMENT_CATEGORY_LABEL[row.category] ?? row.category,
      classification: row.classification,
      stt: row.stt,
      title: row.title,
      // Thân mệnh lệnh bị cắt còn 200 ký tự như mọi trường văn bản; mô hình phải dẫn người dùng
      // sang trang gốc khi cần đọc đủ.
      body: row.body,
      orderedBy: row.orderedBy,
      issuedAt: row.issuedAt ?? row.createdAt,
      pinned: row.pinned,
      invalidatedAt: row.invalidatedAt,
      createdBy: row.createdBy?.name,
    }),
  }));

  return {
    items,
    ...(items.length === 0 ? { message: "Không có thông báo hoặc mệnh lệnh nào khớp điều kiện" } : {}),
    hasMore: rows.length >= take,
  };
}
