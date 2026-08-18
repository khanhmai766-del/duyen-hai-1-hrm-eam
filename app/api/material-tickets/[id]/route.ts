import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { isShiftLeader, isTechnician, getWorkflowRoleMap, isMaterialTicketExtraAssignedPosition, returnStepAllowed, stepAllowedWithMap } from "@/lib/material-workflow";
import { generateBbntDoc, type BbntItem } from "@/lib/bbnt-doc";
import { generateBbntDoDoc, resolveSignatureBuffer, type BbntDoItem } from "@/lib/bbnt-do-doc";
import { generateBbthvtDoc } from "@/lib/bbthvt-doc";
import { generateDxvtDoc } from "@/lib/dxvt-doc";
import { materialTicketFileBase, materialTicketReference } from "@/lib/material-ticket-sequence";
import { normalizeText } from "@/lib/nav";
import { consumeStock, deliveryNoteSummary, receiveIntoLot, releaseUsage, reverseTicketStock, sharedCodesOf, syncMaterialQuantity, usedLotsOfTicket } from "@/lib/material-stock-lot";
import { parseDateInput } from "@/lib/utils";
import { CHEMICAL_TICKET_TYPE, GAS_RETURN_STATUS, isChemicalFlowTicket, isGasCylinderTicket, materialTicketRequiresRecovery, recoveryRequiredForReason, ticketReasonAllowed, TICKET_MATERIAL_CATEGORIES, TICKET_TO_MATERIAL_CATEGORY } from "@/lib/constants";
import { positionsMatch } from "@/lib/position-catalog";
import { replacementPointDisplayLabel, replacementPointSelectionKey } from "@/lib/material-replacement-display";

export const dynamic = "force-dynamic";

const SCCN_REPRESENTATIVES = ["Võ Văn Chiến", "Lê Văn Khánh", "Nguyễn Thanh Toàn"] as const;
const SCCN_POSITIONS = ["Quản Đốc", "Phó Quản Đốc"] as const;

const ITEM_INCLUDE = {
  items: {
    include: {
      material: { select: { id: true, code: true, erpCodes: true, name: true, unit: true, quantity: true } },
      device: { select: { seq: true, name: true, kks: true } },
    },
  },
} as const;

type FullTicket = NonNullable<Awaited<ReturnType<typeof getTicket>>>;

async function getTicket(id: string) {
  return prisma.materialTicket.findUnique({ where: { id }, include: ITEM_INCLUDE });
}

async function recoveryRequiredForTicketReason(t: FullTicket, proposalNote: string) {
  const item = t.items[0];
  const selectedKeys = new Set(item?.replacementPointKeys ?? []);
  if (!item || selectedKeys.size === 0) return recoveryRequiredForReason(proposalNote);
  const points = await prisma.materialReplacement.findMany({
    where: { materialId: item.materialId },
    select: { id: true, deviceSeq: true, location: true, system: true, managingPosition: true, recoveryOnSupplement: true },
  });
  const recoveryOnSupplement = points.some(
    (point) => point.recoveryOnSupplement
      && positionsMatch(point.managingPosition, t.assignedPosition)
      && selectedKeys.has(replacementPointSelectionKey(point)),
  );
  return recoveryRequiredForReason(proposalNote, recoveryOnSupplement);
}

const normalizeReceiptSource = (source: unknown): "ERP" | "EXISTING" =>
  source === "EXISTING" || source === "OUTSIDE" ? "EXISTING" : "ERP";

const receiptSourceLabel = (source: unknown) =>
  normalizeReceiptSource(source) === "ERP" ? "lãnh kho DH1" : "lãnh ngoài";

const sameTicketNumber = (left?: string | null, right?: string | null) =>
  !!left?.trim() && !!right?.trim() && left.trim().toLocaleLowerCase("vi") === right.trim().toLocaleLowerCase("vi");

/** Sửa/Xoá phiếu: ADMIN, cương vị được cấu hình bước "manage"; khi CHƯA cấu hình → người tạo phiếu (mặc định cũ). */
function samePosition(a?: string | null, b?: string | null) {
  return positionsMatch(a, b);
}

function isAssignedPosition(user: { position?: string | null }, t: { assignedPosition: string }) {
  return samePosition(user.position, t.assignedPosition);
}

function assignedPositionError(
  user: { role?: string | null; position?: string | null },
  t: { assignedPosition: string }
) {
  if (user.role === "ADMIN" || isAssignedPosition(user, t)) return null;
  return fail(`Phiếu này được giao cho cương vị "${t.assignedPosition}" — bạn chỉ được xem, không được thao tác`, 403);
}

async function canManageTicket(
  user: { id: string; role?: string | null; position?: string | null },
  t: { createdById: string; assignedPosition: string }
) {
  if (user.role === "ADMIN") return true;
  const map = await getWorkflowRoleMap();
  if (map.manage.length > 0) return stepAllowedWithMap(map, "manage", user);
  return t.createdById === user.id;
}

function toBbntItems(t: FullTicket, quantityOverrides?: Map<string, number>): BbntItem[] {
  return t.items.map((it) => ({
    materialName: it.erpName || it.material.name,
    materialCode: it.erpCode || it.material.code,
    materialUnit: it.material.unit,
    quantity: quantityOverrides?.get(it.id) ?? (t.type === "UNG" ? it.replacementQuantity ?? it.quantity : it.quantity),
    deviceName: it.deviceNameManual || it.device?.name || "",
    deviceKks: it.device?.kks ?? null,
  }));
}

/**
 * Xuất BBNT DO đã điền dữ liệu từ templates/bbnt-do-template.docx (thay file trắng cũ).
 * Chèn chữ ký số: Quản đốc (đại diện chủ quản) + người sử dụng vật tư (Người lập).
 * `overrides` cho giá trị vừa nhập trong request hiện tại nhưng chưa ghi vào `t`.
 */
async function buildBbntDoDocument(
  t: FullTicket,
  overrides?: {
    pctNumber?: string;
    workStartedAt?: Date;
    workEndedAt?: Date;
    receivedQuantity?: number;
    deliveryNoteNumber?: string;
    itemOverride?: { materialCode: string; materialName: string };
    sccnRepresentative?: { name: string; position: string };
  }
) {
  const items: BbntDoItem[] = t.items.map((it, index) => ({
    deviceSeq: it.deviceSeq,
    deviceName: it.deviceNameManual || it.device?.name || "",
    materialCode: (index === 0 ? overrides?.itemOverride?.materialCode : undefined) || it.erpCode || it.material.code,
    materialName: (index === 0 ? overrides?.itemOverride?.materialName : undefined) || it.erpName || it.material.name,
    materialUnit: it.material.unit,
  }));
  // "Hệ thống, thiết bị" theo cột Hệ thống/thiết bị của Chi tiết điểm thay thế:
  // tên node cây thiết bị; thiết bị đã xóa thì rơi về hệ thống của điểm thay thế.
  const missingDevice = t.items.filter((it) => !it.device?.name && it.deviceSeq);
  const systemBySeq = new Map<string, string>();
  if (missingDevice.length) {
    const points = await prisma.materialReplacement.findMany({
      where: { OR: missingDevice.map((it) => ({ materialId: it.materialId, deviceSeq: it.deviceSeq! })) },
      select: { deviceSeq: true, system: true },
    });
    for (const point of points) {
      if (point.deviceSeq && point.system) systemBySeq.set(point.deviceSeq, point.system);
    }
  }
  const heThongThietBi = [...new Set(
    t.items
      .map((it) => it.device?.name || (it.deviceSeq ? systemBySeq.get(it.deviceSeq) : null) || it.deviceSeq)
      .filter(Boolean) as string[]
  )].join(", ");
  const signatureSelect = { name: true, position: true, signatureKey: true, signatureUrl: true } as const;
  const [usedByUser, activeUsers] = await Promise.all([
    t.usedById
      ? prisma.user.findUnique({ where: { id: t.usedById }, select: signatureSelect })
      : Promise.resolve(null),
    prisma.user.findMany({ where: { isActive: true }, select: signatureSelect }),
  ]);
  // Quản đốc PXVH1 (không tính Phó quản đốc): giữ riêng với đại diện SCCN.
  const defaultQuanDoc = activeUsers.find((u) => normalizeText(u.position ?? "").startsWith("quan doc")) ?? null;
  const selectedSccnRepresentative = overrides?.sccnRepresentative
    ?? (t.sccnRepresentativeName && t.sccnRepresentativePosition
      ? { name: t.sccnRepresentativeName, position: t.sccnRepresentativePosition }
      : undefined);
  const selectedSccnUser = selectedSccnRepresentative
    ? activeUsers.find((u) => normalizeText(u.name) === normalizeText(selectedSccnRepresentative.name)) ?? null
    : null;
  // Người in vào biên bản: ưu tiên tên VHV trực tiếp sử dụng vật tư (nhập tay ở bước
  // sử dụng); chữ ký lấy theo tài khoản khớp tên đó, không khớp thì theo tài khoản
  // thao tác bước sử dụng (chỉ khi cùng tên) để tránh ký nhầm người.
  const materialUserName = t.materialUserName?.trim() || null;
  let signer: typeof usedByUser = usedByUser;
  if (materialUserName && normalizeText(materialUserName) !== normalizeText(usedByUser?.name ?? "")) {
    signer = activeUsers.find((u) => normalizeText(u.name) === normalizeText(materialUserName)) ?? null;
  }
  const [chuKyNguoiLap, chuKyQuanDoc] = await Promise.all([
    resolveSignatureBuffer(signer),
    resolveSignatureBuffer(defaultQuanDoc),
  ]);
  return generateBbntDoDoc({
    fileBaseName: materialTicketFileBase(t),
    unit: t.unit,
    materialCategory: t.materialCategory,
    heThongThietBi,
    bbktNumber: t.bbktNumber,
    pctNumber: overrides?.pctNumber ?? t.pctNumber,
    proposalNumber: t.proposalNumber,
    deliveryNoteNumber: overrides?.deliveryNoteNumber ?? (await deliveryNoteForDocuments(t)) ?? t.deliveryNoteNumber,
    sccnRepresentativeName: selectedSccnRepresentative?.name ?? selectedSccnUser?.name ?? null,
    sccnRepresentativePosition: selectedSccnRepresentative?.position ?? selectedSccnUser?.position ?? null,
    quanDocName: defaultQuanDoc?.name ?? null,
    quanDocPosition: defaultQuanDoc?.position ?? null,
    usedByName: materialUserName || t.usedByName,
    usedByPosition: (materialUserName ? signer?.position : null) ?? t.usedByPosition,
    workStartedAt: overrides?.workStartedAt ?? t.workStartedAt,
    workEndedAt: overrides?.workEndedAt ?? t.workEndedAt,
    receivedQuantity: overrides?.receivedQuantity ?? t.receivedQuantity,
    usedQuantity: t.usedQuantity,
    recoveryQuantity: t.recoveryQuantity,
    recoveryReturned: Boolean(t.recoveryReturnedAt),
    items,
    chuKyQuanDoc,
    chuKyNguoiLap,
  });
}

/** Năm hiện tại theo giờ Việt Nam — mốc reset dãy số văn bản BBTHVT. */
function vietnamYear(value = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric" }).format(value));
}

/**
 * Cấp số văn bản BBTHVT cho phiếu: tăng dần trong năm, sang năm mới reset về 1.
 * Số đã cấp lưu trên phiếu — xuất lại biên bản vẫn giữ nguyên số.
 */
async function assignRecoveryDocNo(t: FullTicket) {
  if (t.recoveryDocNo != null) return t.recoveryDocNo;
  const year = vietnamYear();
  const seq = await prisma.recoveryDocSequence.upsert({
    where: { year },
    create: { year, value: 1 },
    update: { value: { increment: 1 } },
  });
  await prisma.materialTicket.update({
    where: { id: t.id },
    data: { recoveryDocNo: seq.value, recoveryDocNoYear: year },
  });
  return seq.value;
}

/**
 * Xuất Phiếu ĐXVT (QLVT.12 — Giấy đề nghị xuất vật tư thiết bị SCTX) tại bước
 * Thống Kê xác nhận ĐXVT, với mã/tên ERP vừa đối chiếu. Chữ ký: Quản đốc +
 * Thống kê đang thao tác (Người đề nghị).
 */
async function buildProposalDocument(
  t: FullTicket,
  statsUser: { id: string; name?: string | null },
  itemOverride: { materialCode: string; materialName: string },
  sccnRepresentative?: { name: string; position: string }
) {
  const selectedSccnRepresentative = sccnRepresentative
    ?? (t.sccnRepresentativeName && t.sccnRepresentativePosition
      ? { name: t.sccnRepresentativeName, position: t.sccnRepresentativePosition }
      : undefined);
  const signatureSelect = { name: true, position: true, signatureKey: true, signatureUrl: true } as const;
  const [statsUserRow, activeUsers] = await Promise.all([
    prisma.user.findUnique({ where: { id: statsUser.id }, select: signatureSelect }),
    prisma.user.findMany({ where: { isActive: true }, select: signatureSelect }),
  ]);
  const defaultQuanDoc = activeUsers.find((u) => normalizeText(u.position ?? "").startsWith("quan doc")) ?? null;
  const representativeUser = selectedSccnRepresentative
    ? activeUsers.find((u) => normalizeText(u.name) === normalizeText(selectedSccnRepresentative.name)) ?? null
    : defaultQuanDoc;
  const [chuKyThongKe, chuKyQuanDoc] = await Promise.all([
    resolveSignatureBuffer(statsUserRow),
    resolveSignatureBuffer(representativeUser),
  ]);
  const proposalItems = t.items.map((it, index) => ({
    deviceName: it.deviceNameManual || it.device?.name || "",
    materialCode: (index === 0 ? itemOverride.materialCode : undefined) || it.erpCode || it.material.code,
    materialName: (index === 0 ? itemOverride.materialName : undefined) || it.erpName || it.material.name,
    materialUnit: it.material.unit,
    quantity: it.quantity,
  }));
  const erpMaterials = await prisma.erpMaterial.findMany({
    where: {
      code: {
        in: [...new Set(proposalItems.map((item) => item.materialCode))],
      },
    },
    select: { code: true, warehouse: true, erpStock: true },
  });
  const erpMaterialByCode = new Map(
    erpMaterials.map((material) => [material.code, material])
  );

  return generateDxvtDoc({
    fileBaseName: materialTicketFileBase(t),
    lyDo: t.proposalNote,
    soBBKT: t.bbktNumber,
    quanDocName: selectedSccnRepresentative?.name ?? representativeUser?.name ?? null,
    quanDocPosition: selectedSccnRepresentative?.position ?? representativeUser?.position ?? null,
    tenThongKe: statsUserRow?.name ?? statsUser.name ?? null,
    items: proposalItems.map((item) => ({
      ...item,
      warehouse: erpMaterialByCode.get(item.materialCode)?.warehouse ?? "",
      erpStock: erpMaterialByCode.get(item.materialCode)?.erpStock ?? null,
    })),
    chuKyQuanDoc,
    chuKyThongKe,
  });
}

/** Xuất Biên bản vật tư thu hồi (QLVT.06) đã điền dữ liệu — thay file trắng cũ. */
/**
 * Số phiếu giao hàng để in lên biên bản. Phần vật tư thực dùng có thể lấy từ NHIỀU lô (ví dụ
 * dùng 7 lít = 5 lít phiếu cũ + 2 lít phiếu mới), nên in đủ cả hai kèm số lượng thay vì chỉ số
 * phiếu trên đầu phiếu. Phiếu cũ chưa có sổ lô thì rơi về số phiếu đã lưu như trước.
 */
async function deliveryNoteForDocuments(t: FullTicket) {
  const used = await usedLotsOfTicket(prisma, t.id);
  const unit = t.items[0]?.material.unit ?? null;
  return deliveryNoteSummary(used, unit) || t.deliveryNoteNumber || t.receivedMethod || undefined;
}

async function buildRecoveryDocument(
  t: FullTicket,
  overrides?: {
    recoveryQuantity?: number | null;
    deliveryNoteNumber?: string;
    pctNumber?: string;
    itemOverride?: { materialCode: string; materialName: string };
  }
) {
  const docNo = await assignRecoveryDocNo(t);
  return generateBbthvtDoc({
    fileBaseName: materialTicketFileBase(t),
    soVB: String(docNo).padStart(2, "0"),
    recoveryQuantity: overrides?.recoveryQuantity !== undefined ? overrides.recoveryQuantity : t.recoveryQuantity,
    deliveryNoteNumber: overrides?.deliveryNoteNumber ?? t.deliveryNoteNumber,
    pctNumber: overrides?.pctNumber ?? t.pctNumber,
    materialCategory: t.materialCategory,
    items: t.items.map((it, index) => ({
      deviceName: it.deviceNameManual || it.device?.name || "",
      materialCode: (index === 0 ? overrides?.itemOverride?.materialCode : undefined) || it.erpCode || it.material.code,
      materialName: (index === 0 ? overrides?.itemOverride?.materialName : undefined) || it.erpName || it.material.name,
      materialUnit: it.material.unit,
    })),
  });
}

type ExportedDocumentUrls = {
  proposalDocUrl?: string;
  docUrl?: string;
  bbktDocUrl?: string;
  recoveryDocUrl?: string;
};

/**
 * Xuất lại đúng các biên bản đã tồn tại trước khi chỉnh sửa bước.
 * Không tự sinh thêm loại biên bản của bước chưa hoàn thành.
 */
async function refreshExistingDocuments(
  previous: FullTicket,
  updated: FullTicket,
  editor: { id: string; name?: string | null },
  skip: ReadonlySet<keyof ExportedDocumentUrls> = new Set()
) {
  const urls: ExportedDocumentUrls = {};
  const firstItem = updated.items[0];
  const itemOverride = firstItem
    ? {
        materialCode: firstItem.erpCode || firstItem.material.code,
        materialName: firstItem.erpName || firstItem.material.name,
      }
    : null;

  if (previous.proposalDocUrl && itemOverride && !skip.has("proposalDocUrl")) {
    const proposal = await buildProposalDocument(
      updated,
      {
        id: updated.statsById || editor.id,
        name: updated.statsByName || editor.name,
      },
      itemOverride
    );
    urls.proposalDocUrl = proposal.url;
  }

  if (previous.bbktDocUrl && !skip.has("bbktDocUrl")) {
    const bbnt = await generateBbntDoc({
      fileBaseName: materialTicketFileBase(updated),
      materialCategory: updated.materialCategory,
      soGiaoHang: await deliveryNoteForDocuments(updated),
      lyDo: updated.proposalNote,
      soBBKT: updated.bbktNumber,
      soPCT: updated.pctNumber,
      noiDung: updated.completionNote ?? "",
      thoiGianBatDau: updated.workStartedAt,
      thoiGianKetThuc: updated.workEndedAt,
      tenChiHuy: updated.chiHuyName ?? "",
      tenTruongCa: updated.completedByName ?? "",
      tenVHV: updated.proposedByName,
      chucVuVHV: updated.proposedByPosition,
      unit: updated.unit,
      usedByName: updated.materialUserName || updated.usedByName,
      usedByPosition: updated.usedByPosition,
      items: toBbntItems(updated),
    });
    urls.bbktDocUrl = bbnt.url;
  }

  if (previous.docUrl && !skip.has("docUrl")) {
    const bbntDo = await buildBbntDoDocument(updated);
    urls.docUrl = bbntDo.url;
  }

  if (previous.recoveryDocUrl && !skip.has("recoveryDocUrl")) {
    const recovery = await buildRecoveryDocument(updated);
    urls.recoveryDocUrl = recovery.url;
  }

  if (Object.keys(urls).length === 0) return updated;
  return prisma.materialTicket.update({
    where: { id: updated.id },
    data: urls,
    include: ITEM_INCLUDE,
  });
}

// GET /api/material-tickets/[id]
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    await requireUser();
    const t = await getTicket(params.id);
    if (!t) return fail("Không tìm thấy phiếu", 404);
    return ok(t);
  });
}

// DELETE /api/material-tickets/[id] — Xóa phiếu. Quản trị / cương vị được phân quyền "Sửa/Xoá phiếu"
// (khi chưa cấu hình: người tạo phiếu như cũ).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const t = await getTicket(params.id);
    if (!t) return fail("Không tìm thấy phiếu", 404);
    if (t.settledAt && user.role !== "ADMIN") {
      return fail("Phiếu đã xác nhận quyết toán, chỉ Quản trị mới được phép xóa", 403);
    }
    if (!(await canManageTicket(user, t)))
      return fail("Bạn không có quyền xóa phiếu (Quản trị phân quyền ở mục Phân quyền quy trình)", 403);
    const deletedMaterial = t.items[0]?.material;
    await prisma.$transaction(async (tx) => {
      // Chặn thao tác tạo/xóa đồng thời trong lúc dồn STT để không phát sinh
      // số trùng hoặc khoảng trống giữa các phiếu.
      await tx.$executeRaw`LOCK TABLE "MaterialTicket" IN EXCLUSIVE MODE`;
      // HOÀN KHO TRƯỚC KHI XÓA: gỡ lô phiếu mang vào và trả lại phần nó đã dùng. Không làm
      // thì phiếu tạo thử rồi xóa vẫn để lại số ma trong kho — đã gặp trên production: một phiếu
      // lãnh 27 dùng 18 rồi bị xóa, kho dôi ra 9 không ai truy được vì phiếu không còn.
      if (deletedMaterial) {
        await reverseTicketStock(tx, { materialCode: deletedMaterial.code, ticketId: t.id });
        await syncMaterialQuantity(tx, deletedMaterial.code, sharedCodesOf(deletedMaterial));
      }
      // Ghi tombstone trước khi cascade xóa các item. Workflow V2 dùng các khóa này
      // để xóa đúng mọi dòng của phiếu khỏi VH1_VTDONGBO.
      if (t.items.length > 0) {
        await tx.materialTicketSyncDeletion.createMany({
          data: t.items.map((item) => ({
            ticketId: t.id,
            syncKey: `${t.id}:${item.id}`,
          })),
          skipDuplicates: true,
        });
      }
      await tx.materialTicket.delete({ where: { id: t.id } });

      // Chỉ dồn STT trong tháng của phiếu vừa xóa. Các tháng cũ giữ nguyên
      // dãy số riêng để tra cứu lịch sử.
      await tx.$executeRaw`
        UPDATE "MaterialTicket"
        SET "sequenceNumber" = -"sequenceNumber"
        WHERE "sequenceMonth" = ${t.sequenceMonth}
      `;
      await tx.$executeRaw`
        WITH ranked AS (
          SELECT
            id,
            ROW_NUMBER() OVER (
              ORDER BY "sequenceNumber" DESC, "createdAt" ASC, id ASC
            )::INTEGER AS "nextSequenceNumber"
          FROM "MaterialTicket"
          WHERE "sequenceMonth" = ${t.sequenceMonth}
        )
        UPDATE "MaterialTicket" AS ticket
        SET "sequenceNumber" = ranked."nextSequenceNumber"
        FROM ranked
        WHERE ticket.id = ranked.id
      `;
    });
    await audit(user.id, "MT_DELETE", "MaterialTicket", t.id, `${materialTicketReference(t)}: xóa phiếu`);
    return ok({ id: t.id, sequenceNumber: t.sequenceNumber, sequenceMonth: t.sequenceMonth });
  });
}

// PUT /api/material-tickets/[id]   { action, ...payload }
// Mọi khóa (trạng thái × cương vị × phạm vi × 2 ngày) thi hành TẠI ĐÂY.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json();
    const action = String(body.action || "");
    const t = await getTicket(params.id);
    if (!t) return fail("Không tìm thấy phiếu", 404);

    // Sửa toàn bộ thông tin khởi tạo phiếu (Tổ máy, cương vị, loại vật tư, vật tư, SL, ghi chú, thiết bị, BBKT).
    // Quản trị / cương vị được phân quyền "Sửa/Xoá phiếu" (chưa cấu hình: người tạo).
    if (action === "editInfo") {
      if (!(await canManageTicket(user, t)))
        return fail("Bạn không có quyền sửa phiếu (Quản trị phân quyền ở mục Phân quyền quy trình)", 403);
      const unit = String(body.unit || "").trim();
      if (!["S1", "S2", "COMMON"].includes(unit)) return fail("Tổ máy không hợp lệ");
      const assignedPosition = String(body.assignedPosition || "").trim();
      if (!assignedPosition) return fail("Vui lòng chọn cương vị được giao");
      // Không còn ràng buộc cương vị theo tổ máy (bỏ 2026-08-10) — xem POST /api/material-tickets.
      const totalScopeCount = await prisma.positionSystemScope.count();
      const scopeCount = await prisma.positionSystemScope.count({ where: { position: assignedPosition } });
      if (totalScopeCount > 0 && scopeCount === 0 && !isMaterialTicketExtraAssignedPosition(assignedPosition)) {
        return fail(`Cương vị "${assignedPosition}" chưa được phân giao hệ thống thiết bị`);
      }
      const materialCategory = String(body.materialCategory || "").trim();
      if (!(TICKET_MATERIAL_CATEGORIES as readonly string[]).includes(materialCategory)) return fail("Vui lòng chọn loại vật tư");
      const bbkt = String(body.bbktNumber || "").trim(); // BBKT giờ là tuỳ chọn (bổ sung ở bước Nghiệm thu)
      const data: {
        unit: string;
        assignedPosition: string;
        materialCategory: string;
        bbktNumber: string | null;
        proposalNote?: string | null;
        recoveryRequired?: boolean;
        recoveryQuantity?: number | null;
        recoveryReturnedAt?: Date | null;
      } = { unit, assignedPosition, materialCategory, bbktNumber: bbkt || null };
      let editedItemData: {
        materialId: string;
        erpCode: string | null;
        quantity: number;
        deviceSeq: string | null;
        replacementPointKeys: string[];
        deviceNameManual: string | null;
      } | null = null;

      if (["CHUA_CHON", "DE_XUAT", "UNG", "SU_DUNG_HIEN_CO", CHEMICAL_TICKET_TYPE, "GHI_NHAN"].includes(t.type)) {
        const proposalNote = String(body.note || "").trim();
        const materialId = String(body.materialId || "").trim();
        const erpCode = String(body.erpCode || "").trim();
        const proposedQuantity = Math.trunc(Number(body.proposedQuantity || body.quantity || 0));
        const rawReplacementKeys: unknown[] = Array.isArray(body.replacementDeviceSeqs)
          ? body.replacementDeviceSeqs
          : [body.replacementDeviceSeq];
        const requestedReplacementKeys = Array.from(new Set<string>(
          rawReplacementKeys
            .map((value: unknown) => String(value || "").trim())
            .filter(Boolean)
        ));
        if (!proposalNote) return fail("Vui lòng nhập Ghi chú cho phiếu đề xuất");
        if (!ticketReasonAllowed(materialCategory, proposalNote)) {
          return fail(`Loại vật tư "${materialCategory}" chỉ chọn lý do Nhập hoặc Khác`);
        }
        if (!materialId) return fail("Vui lòng chọn tên vật tư đề xuất");
        if (!Number.isFinite(proposedQuantity) || proposedQuantity <= 0) return fail("Số lượng đề xuất phải lớn hơn 0");
        if (!requestedReplacementKeys.length) return fail("Vui lòng chọn ít nhất một thiết bị thay thế");
        if (requestedReplacementKeys.length > 50) return fail("Mỗi phiếu được chọn tối đa 50 thiết bị thay thế");
        const material = await prisma.material.findUnique({
          where: { id: materialId },
          select: { id: true, code: true, erpCodes: true, category: true, machine: true },
        });
        if (!material) return fail("Không tìm thấy vật tư đề xuất", 404);
        if (material.machine !== unit) return fail("Vật tư không thuộc tổ máy đã chọn");
        const expectedCategory = TICKET_TO_MATERIAL_CATEGORY[materialCategory] ?? materialCategory;
        if (material.category !== expectedCategory) return fail("Vật tư không thuộc loại vật tư đã chọn");
        const allowedCodes = material.erpCodes.length ? material.erpCodes : [material.code];
        if (erpCode && !allowedCodes.includes(erpCode)) return fail("Mã vật tư không thuộc tên vật tư đã chọn");
        const replacementPoints = await prisma.materialReplacement.findMany({
          where: { materialId },
          select: { id: true, deviceSeq: true, location: true, system: true, managingPosition: true, recoveryOnSupplement: true, device: { select: { name: true } } },
        });
        const assignedPointByKey = new Map<string, (typeof replacementPoints)[number]>();
        for (const point of replacementPoints) {
          if (!positionsMatch(point.managingPosition, assignedPosition)) continue;
          const key = replacementPointSelectionKey(point);
          if (key && !assignedPointByKey.has(key)) assignedPointByKey.set(key, point);
        }
        const selectedReplacementPoints = requestedReplacementKeys.map((key) => assignedPointByKey.get(key));
        if (selectedReplacementPoints.some((point) => !point)) {
          return fail("Một hoặc nhiều thiết bị đã chọn không thuộc cương vị được giao quản lý");
        }
        const validReplacementPoints = selectedReplacementPoints.filter(
          (point): point is NonNullable<typeof point> => Boolean(point)
        );
        const replacementDeviceLabels = validReplacementPoints.map(
          (point) => replacementPointDisplayLabel(point)
        );
        const primaryReplacementPoint = validReplacementPoints[0];
        const primaryReplacementKey = requestedReplacementKeys[0];
        editedItemData = {
          materialId,
          erpCode: erpCode || null,
          quantity: proposedQuantity,
          deviceSeq: primaryReplacementKey.startsWith("manual:") ? null : primaryReplacementPoint.deviceSeq,
          replacementPointKeys: requestedReplacementKeys,
          deviceNameManual: replacementDeviceLabels.join(", "),
        };
        data.proposalNote = proposalNote;
        // Đổi lý do hoặc điểm dùng có thể đổi yêu cầu thu hồi. Hồ sơ đã phát hành BBTHVT
        // không được phép chuyển sang trạng thái không thu hồi vì sẽ làm hồ sơ mâu thuẫn.
        const recoveryRequired = recoveryRequiredForReason(
          proposalNote,
          validReplacementPoints.some((point) => point.recoveryOnSupplement),
        );
        if (!recoveryRequired && t.recoveryDocUrl) {
          return fail("Biên bản vật tư thu hồi đã được cấp. Không thể đổi phiếu sang trạng thái không thu hồi; vui lòng liên hệ Quản trị để xử lý hồ sơ.");
        }
        data.recoveryRequired = recoveryRequired;
        if (!recoveryRequired) {
          data.recoveryQuantity = null;
          data.recoveryReturnedAt = null;
        }
      }

      const up = await prisma.$transaction(async (tx) => {
        await tx.materialTicket.update({
          where: { id: t.id },
          data,
        });
        if (["CHUA_CHON", "DE_XUAT", "UNG", "SU_DUNG_HIEN_CO", CHEMICAL_TICKET_TYPE, "GHI_NHAN"].includes(t.type)) {
          if (!editedItemData) throw fail("Thiếu thông tin vật tư đề xuất");
          await tx.materialTicketItem.deleteMany({ where: { ticketId: t.id } });
          await tx.materialTicketItem.create({
            data: {
              ticketId: t.id,
              ...editedItemData,
            },
          });
        }
        return tx.materialTicket.findUnique({
          where: { id: t.id },
          include: ITEM_INCLUDE,
        });
      });
      await audit(user.id, "MT_EDIT_INFO", "MaterialTicket", t.id, `${materialTicketReference(t)}: sửa thông tin phiếu`);
      return ok(up);
    }

    // Xem lại/chỉnh sửa dữ liệu của bước đã hoàn thành. Quyền sửa dùng đúng quyền
    // của bước; các thay đổi số lượng được bù trừ theo chênh lệch vào tồn kho.
    if (action === "editStep") {
      const step = String(body.step || "");
      const permissionByStep = {
        confirm: "confirm", stats: "stats", receive: "receive", use: "use", accept: "accept",
      } as const;
      const permission = permissionByStep[step as keyof typeof permissionByStep];
      if (!permission) return fail("Bước chỉnh sửa không hợp lệ");
      if (!stepAllowedWithMap(await getWorkflowRoleMap(), permission, user))
        return fail("Bạn không có quyền chỉnh sửa bước này (Quản trị phân quyền ở mục Phân quyền quy trình)", 403);
      let before = "";
      let after = "";
      let up: FullTicket | null = null;
      let recoveryDocumentCreatedAfterEdit = false;

      if (step === "confirm") {
        if (!t.confirmedAt) return fail("Bước Trưởng ca/Trưởng kíp xác nhận chưa hoàn thành");
        const value = String(body.bbktNumber || "").trim();
        const reason = String(body.note || "").trim();
        if (!reason) return fail("Lý do không được để trống");
        if (!ticketReasonAllowed(t.materialCategory, reason)) {
          return fail(`Loại vật tư "${t.materialCategory}" chỉ chọn lý do Nhập hoặc Khác`);
        }
        before = `Lý do: ${t.proposalNote || "—"}; Số biên bản kiểm tra: ${t.bbktNumber ?? "—"}`;
        after = `Lý do: ${reason}; Số biên bản kiểm tra: ${value || "—"}`;
        const recoveryRequired = await recoveryRequiredForTicketReason(t, reason);
        if (!recoveryRequired && t.recoveryDocUrl) {
          return fail("Biên bản vật tư thu hồi đã được cấp. Không thể đổi phiếu sang trạng thái không thu hồi; vui lòng liên hệ Quản trị để xử lý hồ sơ.");
        }
        up = await prisma.materialTicket.update({
          where: { id: t.id },
          data: {
            proposalNote: reason,
            bbktNumber: value || null,
            recoveryRequired,
            ...(!recoveryRequired ? { recoveryQuantity: null, recoveryReturnedAt: null } : {}),
          },
          include: ITEM_INCLUDE,
        });
      } else if (step === "stats") {
        if (!t.statsAt && !t.proposalIssuedAt) return fail("Bước Thống Kê xác nhận ĐXVT chưa hoàn thành");
        const value = String(body.proposalNumber || "").trim();
        const proposalReceiverName = String(body.proposalReceiverName || t.proposalReceiverName || "").trim();
        if (!value) return fail("Vui lòng nhập số phiếu ĐXVT");
        before = `Số phiếu ĐXVT: ${t.proposalNumber ?? "—"}; VHV nhận: ${t.proposalReceiverName ?? "—"}`;
        after = `Số phiếu ĐXVT: ${value}; VHV nhận: ${proposalReceiverName || "—"}`;
        up = await prisma.materialTicket.update({ where: { id: t.id }, data: { proposalNumber: value, proposalReceiverName: proposalReceiverName || null }, include: ITEM_INCLUDE });
      } else if (step === "receive") {
        if (!t.receivedAt || t.receivedQuantity == null) return fail("Bước xác nhận vật tư lãnh chưa hoàn thành");
        const value = Math.trunc(Number(body.receivedQuantity));
        const method = String(body.deliveryNoteNumber || body.receivedMethod || "").trim();
        const receiptSource = t.type === "UNG" ? normalizeReceiptSource(body.receiptSource) : "ERP";
        if (value <= 0 || !method) return fail("Khối lượng lãnh hoặc số phiếu giao hàng không hợp lệ");
        const item = t.items[0]; if (!item) return fail("Phiếu chưa có vật tư");
        const delta = value - t.receivedQuantity;
        const erpCode = item.erpCode || item.material.code;
        const erpRows = await prisma.$queryRaw<Array<{ erpStock: number }>>`SELECT "erpStock" FROM "ErpMaterial" WHERE "code" = ${erpCode} LIMIT 1`;
        if (!erpRows.length) return fail(`Không tìm thấy mã vật tư ERP "${erpCode}"`, 404);
        const oldSource = normalizeReceiptSource(t.receiptSource);
        const erpDelta = (oldSource === "ERP" ? t.receivedQuantity : 0) - (receiptSource === "ERP" ? value : 0);
        if (item.material.quantity + delta < 0 || erpRows[0].erpStock + erpDelta < 0) return fail("Không thể điều chỉnh vì số lượng hiện có hoặc ERP sẽ âm");
        before = `Nhận ${t.receivedQuantity}, phiếu giao hàng ${t.deliveryNoteNumber ?? t.receivedMethod ?? "—"}`; after = `Nhận ${value}, phiếu giao hàng ${method}`;
        up = await prisma.$transaction(async (tx) => {
          if (delta || method !== (t.deliveryNoteNumber ?? "")) {
            try {
              await receiveIntoLot(tx, {
                materialCode: item.material.code, quantity: delta, ticketId: t.id,
                deliveryNote: method, erpCode,
              });
            } catch (error) {
              throw fail((error as Error).message);
            }
            await syncMaterialQuantity(tx, item.material.code, sharedCodesOf(item.material));
          }
          if (erpDelta) await tx.$executeRaw`UPDATE "ErpMaterial" SET "erpStock" = "erpStock" + ${erpDelta}, "updatedAt" = NOW() WHERE "code" = ${erpCode}`;
          return tx.materialTicket.update({ where: { id: t.id }, data: { receivedQuantity: value, receivedMethod: method || null, deliveryNoteNumber: method || null, receiptSource, remainingQuantity: value - (t.usedQuantity ?? 0) }, include: ITEM_INCLUDE });
        });
      } else if (step === "use") {
        if (!t.usedAt || t.usedQuantity == null) return fail("Bước sử dụng vật tư chưa hoàn thành");
        const value = Math.trunc(Number(body.usedQuantity));
        const materialUserName = String(body.materialUserName || "").trim();
        // Có thu hồi hay không dùng snapshot đã chốt từ lý do và cấu hình điểm dùng vật tư.
        // Giao diện chỉ gửi số lượng để điền BBTHVT, không cho bật/tắt thu hồi tại bước này.
        const recoveryRequired = materialTicketRequiresRecovery(t);
        const hasRecoveryQuantity = Object.prototype.hasOwnProperty.call(body, "recoveryQuantity");
        const recoveryQuantity = recoveryRequired
          ? hasRecoveryQuantity
            ? Math.trunc(Number(body.recoveryQuantity))
            : t.recoveryQuantity
          : null;
        const recoveryReturned = recoveryRequired && body.recoveryReturned === true;
        if (value <= 0) return fail("Số lượng sử dụng phải lớn hơn 0");
        if (!materialUserName) return fail("Vui lòng nhập tên VHV sử dụng vật tư");
        if (recoveryRequired && (!recoveryQuantity || recoveryQuantity <= 0)) return fail("Vui lòng nhập số lượng vật tư thu hồi");
        if (!recoveryRequired && t.recoveryDocUrl) {
          return fail("Biên bản vật tư thu hồi đã được cấp. Không thể chuyển sang không có vật tư thu hồi; vui lòng liên hệ Quản trị để xử lý hồ sơ.");
        }
        const item = t.items[0]; if (!item) return fail("Phiếu chưa có vật tư");
        const delta = value - t.usedQuantity;
        if (item.material.quantity - delta < 0) return fail("Không đủ số lượng hiện có để tăng số lượng sử dụng");
        // Phiếu đã nghiệm thu nhưng mới chuyển sang "Có vật tư thu hồi" phải được
        // bổ sung BBTHVT ngay. Điều kiện thiếu URL cũng tự sửa các phiếu cũ đã lưu
        // recoveryRequired=true nhưng chưa từng phát sinh tài liệu.
        const recoveryDoc = recoveryRequired && t.completedAt && !t.recoveryDocUrl
          ? await buildRecoveryDocument(t, { recoveryQuantity })
          : null;
        before = `Dùng ${t.usedQuantity}; thu hồi ${t.recoveryRequired ? `${t.recoveryQuantity ?? 0}${t.recoveryReturnedAt ? " (đã trả)" : " (chưa trả)"}` : "không"}`;
        after = `Dùng ${value}; thu hồi ${recoveryRequired ? `${recoveryQuantity}${recoveryReturned ? " (đã trả)" : " (chưa trả)"}` : "không"}`;
        up = await prisma.$transaction(async (tx) => {
          if (delta) {
            // Chia lại từ đầu theo số dùng mới: trả hết phần cũ về lô rồi cấp lại, không cộng dồn.
            try {
              await consumeStock(tx, { materialCode: item.material.code, ticketId: t.id, quantity: value });
            } catch (error) {
              throw fail((error as Error).message);
            }
            await syncMaterialQuantity(tx, item.material.code, sharedCodesOf(item.material));
          }
          return tx.materialTicket.update({
            where: { id: t.id },
            data: {
              usedQuantity: value,
              remainingQuantity: (t.receivedQuantity ?? 0) - value,
              materialUserName,
              recoveryRequired,
              // Chai khí không có BBTHVT, nhưng recoveryQuantity/recoveryReturnedAt lại là nơi
              // lưu số vỏ đã trả — sửa lại bước Sử dụng thì không được xoá dấu vết bước Trả.
              ...(isGasCylinderTicket(t.materialCategory) ? {} : {
                recoveryQuantity,
                recoveryReturnedAt: recoveryReturned ? (t.recoveryReturnedAt ?? new Date()) : null,
              }),
              // Biên bản thu hồi chỉ được sinh cùng BBNT ký tay ở bước Nghiệm thu.
              // Khi chỉnh sửa sau nghiệm thu, bổ sung tài liệu còn thiếu ngay trong lần lưu.
              recoveryDocUrl: recoveryRequired && t.completedAt
                ? (recoveryDoc?.url ?? t.recoveryDocUrl)
                : null,
            },
            include: ITEM_INCLUDE,
          });
        });
        recoveryDocumentCreatedAfterEdit = recoveryDoc != null;
      } else if (step === "accept") {
        if (!t.completedAt) return fail("Bước xác nhận/nghiệm thu chưa hoàn thành");
        const pct = String(body.pctNumber || "").trim();
        const chiHuy = String(body.chiHuyName || "").trim();
        const note = String(body.completionNote ?? t.completionNote ?? "").trim();
        const workStartedAt = new Date(String(body.workStartedAt || ""));
        const workEndedAt = new Date(String(body.workEndedAt || ""));
        if (!pct || !chiHuy || !note) return fail("Vui lòng nhập đầy đủ số PCT/LCT, tên chỉ huy và nội dung nghiệm thu");
        if (Number.isNaN(workStartedAt.getTime()) || Number.isNaN(workEndedAt.getTime())) {
          return fail("Vui lòng chọn thời gian bắt đầu và kết thúc nghiệm thu");
        }
        if (workEndedAt <= workStartedAt) {
          return fail("Thời gian kết thúc nghiệm thu phải sau thời gian bắt đầu nghiệm thu");
        }
        // KHÔNG nhận đại diện SCCN ở đây nữa: đại diện là việc của bước Thống kê. Nếu BBNT
        // D-Office đã phát hành thì lần xuất lại bên dưới dùng đúng đại diện đã lưu trên phiếu
        // (buildBbntDoDocument tự rơi về `t.sccnRepresentative*` khi không có override) — sửa
        // giờ nghiệm thu không được phép đổi người ký thay Thống kê.
        before = `${t.pctNumber ?? "—"}; ${t.chiHuyName ?? "—"}; ${t.workStartedAt?.toISOString() ?? "—"} → ${t.workEndedAt?.toISOString() ?? "—"}`;
        after = `${pct}; ${chiHuy}; ${workStartedAt.toISOString()} → ${workEndedAt.toISOString()}`;
        const { url } = await generateBbntDoc({
          fileBaseName: materialTicketFileBase(t),
          materialCategory: t.materialCategory,
          soGiaoHang: await deliveryNoteForDocuments(t),
          lyDo: t.proposalNote,
          soBBKT: t.bbktNumber,
          soPCT: pct,
          noiDung: note,
          thoiGianBatDau: workStartedAt,
          thoiGianKetThuc: workEndedAt,
          tenChiHuy: chiHuy,
          tenTruongCa: t.completedByName ?? "",
          tenVHV: t.proposedByName,
          chucVuVHV: t.proposedByPosition,
          unit: t.unit,
          usedByName: t.materialUserName || t.usedByName,
          usedByPosition: t.usedByPosition,
          items: toBbntItems(t),
        });
        // Chỉ tái xuất BBNT D-Office nếu loại tài liệu này đã được phát hành.
        // Phiếu đang chờ tác vụ Thống kê không được sinh file sớm.
        const bbntDo = t.docUrl
          ? await buildBbntDoDocument(t, {
              pctNumber: pct,
              workStartedAt,
              workEndedAt,
            })
          : null;
        // Đổi số PCT/LCT → xuất lại BBTHVT để cột Ghi chú đồng bộ số mới.
        const recoveryDoc = materialTicketRequiresRecovery(t) ? await buildRecoveryDocument(t, { pctNumber: pct }) : null;
        up = await prisma.materialTicket.update({
          where: { id: t.id },
          data: {
            pctNumber: pct,
            chiHuyName: chiHuy,
            completionNote: note,
            workStartedAt,
            workEndedAt,
            bbktDocUrl: url,
            ...(bbntDo ? { docUrl: bbntDo.url } : {}),
            ...(recoveryDoc ? { recoveryDocUrl: recoveryDoc.url } : {}),
          },
          include: ITEM_INCLUDE,
        });
      }
      if (!up) return fail("Không thể cập nhật bước");
      // Bước accept đã tự xuất lại BBNT ký tay, BBNT D-Office và biên bản thu hồi ở trên.
      // Các file còn lại (nếu đã tồn tại) được tạo lại từ dữ liệu vừa lưu.
      const skipRefreshedInStep = step === "accept"
        ? new Set<keyof ExportedDocumentUrls>(["bbktDocUrl", "docUrl", "recoveryDocUrl"])
        : step === "use" && !t.completedAt
          // Không tái tạo liên kết BBTHVT cũ trước khi phiếu hoàn tất bước Nghiệm thu.
          ? new Set<keyof ExportedDocumentUrls>(["recoveryDocUrl"])
          : new Set<keyof ExportedDocumentUrls>();
      up = await refreshExistingDocuments(t, up, user, skipRefreshedInStep);
      if (recoveryDocumentCreatedAfterEdit) {
        await audit(
          user.id,
          "MT_RECOVERY_DOC_CREATE_AFTER_EDIT",
          "MaterialTicket",
          t.id,
          `${materialTicketReference(t)}: phát sinh Biên bản vật tư thu hồi sau khi chỉnh sửa bước sử dụng vật tư`
        );
      }
      await audit(user.id, "MT_EDIT_STEP", "MaterialTicket", t.id, `${materialTicketReference(t)}: chỉnh sửa bước ${step} — ${before} → ${after}`, { actorName: user.name, beforeData: { summary: before }, afterData: { summary: after }, changedFields: [step] });
      return ok(up);
    }

    if (["HOAN_TAT", "TU_CHOI"].includes(t.status)) return fail("Phiếu đã khóa, không thể thao tác");

    /* ---------- helper kiểm tra items (dùng cho propose) ---------- */
    async function validateItems() {
      const items: Array<{ materialId: string; erpCode?: string; deviceSeq: string; quantity: number }> =
        Array.isArray(body.items) ? body.items : [];
      if (items.length === 0) return "Phiếu phải có ít nhất 1 vật tư";

      for (const it of items) {
        if (!it.materialId || !it.erpCode || !it.deviceSeq || !(it.quantity >= 1)) return "Dòng vật tư thiếu thông tin";
      }
      const materials = await prisma.material.findMany({
        where: { id: { in: [...new Set(items.map((i) => i.materialId))] } },
        select: { id: true, code: true, erpCodes: true, category: true, machine: true },
      });
      const materialCodeMap = new Map(materials.map((material) => [material.id, material.erpCodes.length ? material.erpCodes : [material.code]]));
      const materialMachineMap = new Map(materials.map((material) => [material.id, material.machine]));
      const materialCategoryMap = new Map(materials.map((material) => [material.id, material.category]));
      const expectedCategory = TICKET_TO_MATERIAL_CATEGORY[t!.materialCategory ?? ""] ?? t!.materialCategory;
      for (const it of items) {
        if (materialMachineMap.get(it.materialId) !== t!.unit) return "Vật tư không thuộc tổ máy của phiếu";
        if (materialCategoryMap.get(it.materialId) !== expectedCategory) return "Vật tư không thuộc loại vật tư của phiếu";
        if (!materialCodeMap.get(it.materialId)?.includes(it.erpCode || "")) return "Mã vật tư không thuộc tên vật tư đã chọn";
      }
      // Mỗi cặp (vật tư, thiết bị) phải là điểm đã khai báo trong Danh mục vật tư.
      // Không lọc isActive/chu kỳ: đề xuất bổ sung do hao hụt hoặc chất lượng dầu
      // không đạt vẫn được phép chọn điểm không theo dõi lịch.
      const matIds = [...new Set(items.map((i) => i.materialId))];
      const decls = await prisma.materialReplacement.findMany({
        where: { materialId: { in: matIds } },
        select: { id: true, materialId: true, deviceSeq: true, location: true, system: true, managingPosition: true, device: { select: { name: true } } },
      });
      const assignedDecls = decls.filter(
        (decl) => positionsMatch(decl.managingPosition, t!.assignedPosition)
      );
      const declSet = new Set(assignedDecls.map((d) => `${d.materialId}::${d.deviceSeq}`));
      const replacementLabelMap = new Map(
        assignedDecls.map((d) => [`${d.materialId}::${d.deviceSeq}`, replacementPointDisplayLabel(d)])
      );
      const manualDeclMap = new Map(
        assignedDecls
          .filter((d) => !d.deviceSeq)
          .map((d) => [`${d.materialId}::manual:${d.id}`, replacementPointDisplayLabel(d)])
      );
      for (const it of items) {
        const key = `${it.materialId}::${it.deviceSeq}`;
        if (!declSet.has(key) && !manualDeclMap.has(key)) {
          return "Vật tư và thiết bị đã chọn không khớp danh mục vật tư";
        }
      }
      const deviceSeqs = [...new Set(items.map((i) => i.deviceSeq).filter((seq) => !seq.startsWith("manual:")))];
      const devices = await prisma.equipmentNode.findMany({
        where: { seq: { in: deviceSeqs } },
        select: { seq: true },
      });
      const deviceSet = new Set(devices.map((device) => device.seq));
      for (const it of items) {
        if (it.deviceSeq.startsWith("manual:")) continue;
        if (!deviceSet.has(it.deviceSeq)) return "Thiết bị đã chọn không còn tồn tại trong cây thiết bị";
      }

      return items.map((i) => {
        const manualName = manualDeclMap.get(`${i.materialId}::${i.deviceSeq}`);
        const replacementLabel = replacementLabelMap.get(`${i.materialId}::${i.deviceSeq}`);
        return {
          ticketId: t!.id,
          materialId: i.materialId,
          erpCode: i.erpCode || null,
          deviceSeq: manualName ? null : i.deviceSeq,
          deviceNameManual: manualName ?? replacementLabel ?? null,
          quantity: Math.trunc(Number(i.quantity)),
        };
      });
    }

    /* =================== LUỒNG ĐỀ XUẤT =================== */

    // B1 — cương vị phân giao gửi đề xuất (luồng cũ; giữ để tương thích phiếu cũ còn dang dở)
    if (action === "propose") {
      if (t.type !== "DE_XUAT" || t.status !== "CHO_DE_XUAT") return fail("Phiếu không ở bước Đề xuất");
      if (!isAssignedPosition(user, t))
        return fail(`Phiếu này được giao cho cương vị "${t.assignedPosition}" — bạn không có quyền đề xuất`, 403);
      const itemData = await validateItems();
      if (typeof itemData === "string") return fail(itemData);
      const up = await prisma.$transaction(async (tx) => {
        await tx.materialTicketItem.deleteMany({ where: { ticketId: t.id } });
        await tx.materialTicketItem.createMany({ data: itemData });
        await tx.materialTicket.update({
          where: { id: t.id },
          data: {
            status: "CHO_XAC_NHAN",
            proposedById: user.id, proposedByName: user.name ?? "",
            proposedByPosition: user.position ?? null, proposedAt: new Date(),
          },
          include: ITEM_INCLUDE,
        });
      });
      await audit(user.id, "MT_PROPOSE", "MaterialTicket", t.id, `${materialTicketReference(t)}: gửi đề xuất`);
      return ok(up);
    }

    // B1 — Trưởng Ca/Trưởng Kíp chọn luồng xử lý.
    if (action === "confirm") {
      // LUỒNG HÓA CHẤT — bước 2: không chọn luồng, không đổi số lượng, chỉ xác nhận BỒN VÀ
      // THIẾT BỊ ĐỦ ĐIỀU KIỆN nhận hóa chất. Để trống bước này là xe bồn đến nơi mới biết bồn
      // chưa sẵn sàng.
      if (t.type === CHEMICAL_TICKET_TYPE) {
        if (t.status !== "CHO_XAC_NHAN") return fail("Phiếu không ở bước xác nhận bồn/thiết bị");
        if (!stepAllowedWithMap(await getWorkflowRoleMap(), "confirm", user))
          return fail("Bạn không có quyền xác nhận (Quản trị phân quyền ở mục Phân quyền quy trình)", 403);
        const up = await prisma.materialTicket.update({
          where: { id: t.id },
          data: {
            status: "CHO_THONG_KE",
            confirmedById: user.id,
            confirmedByName: user.name ?? "",
            confirmedByPosition: user.position ?? null,
            confirmedAt: new Date(),
          },
          include: ITEM_INCLUDE,
        });
        await audit(user.id, "MT_CONFIRM", "MaterialTicket", t.id,
          `${materialTicketReference(t)}: Xác nhận bồn/thiết bị đủ điều kiện nhận hóa chất`);
        return ok(up);
      }
      if (!["DE_XUAT", "CHUA_CHON"].includes(t.type) || t.status !== "CHO_XAC_NHAN") return fail("Phiếu không ở bước Trưởng ca/Trưởng kíp xử lý");
      if (!stepAllowedWithMap(await getWorkflowRoleMap(), "confirm", user))
        return fail("Bạn không có quyền xác nhận (Quản trị phân quyền ở mục Phân quyền quy trình)", 403);
      const isChemicalTicket = isChemicalFlowTicket(t.materialCategory);
      const isGasTicket = isGasCylinderTicket(t.materialCategory);
      const requestedWorkflowType = body.workflowType === "UNG" ? "UNG" : body.workflowType === "SU_DUNG_HIEN_CO" ? "SU_DUNG_HIEN_CO" : body.workflowType === "DE_XUAT" ? "DE_XUAT" : t.type;
      // Quy tắc nghiệp vụ: Hóa chất chỉ đi luồng Đề xuất. Chai khí chọn được Đề xuất hoặc
      // Ứng nhưng KHÔNG có Sử dụng hiện có — chai khí lãnh về là dùng ngay, không tồn sẵn.
      const workflowType = isGasTicket
        ? (requestedWorkflowType === "UNG" ? "UNG" : "DE_XUAT")
        : isChemicalTicket ? "DE_XUAT" : requestedWorkflowType;
      const item = t.items[0];
      if (!item) return fail("Phiếu chưa có vật tư");
      const quantity = Math.trunc(Number(body.proposedQuantity || item.quantity));
      const bbktNumber = String(body.bbktNumber || "").trim();
      const proposalNote = String(body.proposalNote || "").trim(); // Lý do — hiện ở "Ghi chú lý do" trên phiếu
      if (!ticketReasonAllowed(t.materialCategory, proposalNote)) {
        return fail(`Loại vật tư "${t.materialCategory}" chỉ chọn lý do Nhập hoặc Khác`);
      }
      if (!Number.isFinite(quantity) || quantity <= 0) return fail("Số lượng xác nhận phải lớn hơn 0");
      if (!isChemicalTicket && t.type === "CHUA_CHON" && workflowType === "DE_XUAT") {
        const allowedCodes = item.material.erpCodes.length ? item.material.erpCodes : [item.material.code];
        const availableErpCode = await prisma.erpMaterial.findFirst({
          where: {
            code: { in: allowedCodes },
            isActive: true,
            mappingStatus: "CONFIRMED",
            erpStock: { gt: 0 },
          },
          select: { code: true },
        });
        if (!availableErpCode) {
          return fail("Không thể chọn luồng Đề xuất vì tất cả mã vật tư ERP đều không còn tồn kho. Vui lòng chọn luồng Ứng");
        }
      }
      const short = t.items.filter((it) => (it.id === item.id ? quantity : it.quantity) > it.material.quantity);
      if (workflowType === "SU_DUNG_HIEN_CO" && short.length > 0) {
        return fail(
          "Số lượng hiện có không đủ: " +
          short.map((s) => `${s.material.name} (cần ${s.id === item.id ? quantity : s.quantity}, tồn ${s.material.quantity})`).join("; ") +
          " — không thể chọn luồng Sử dụng hiện có. Vui lòng chọn Đề xuất hoặc Ứng."
        );
      }
      const up = await prisma.$transaction(async (tx) => {
        // Bước chọn luồng chỉ xác nhận số lượng; mã ERP được chọn ở bước nhận vật tư.
        await tx.materialTicketItem.update({
          where: { id: item.id },
          data: { erpCode: null, erpName: null, quantity },
        });
        return tx.materialTicket.update({
          where: { id: t.id },
          data: {
            type: workflowType,
            status: workflowType === "UNG" ? "VHV_LANH_VAT_TU" : workflowType === "SU_DUNG_HIEN_CO" ? "NHAN_TU_HIEN_CO" : "CHO_THONG_KE",
            bbktNumber: bbktNumber || null,
            ...(proposalNote ? {
              proposalNote,
              recoveryRequired: await recoveryRequiredForTicketReason(t, proposalNote),
            } : {}),
            confirmedById: user.id, confirmedByName: user.name ?? "",
            confirmedByPosition: user.position ?? null, confirmedAt: new Date(),
          },
          include: ITEM_INCLUDE,
        });
      });
      await audit(user.id, "MT_CONFIRM", "MaterialTicket", t.id, `${materialTicketReference(t)}: chọn luồng ${workflowType}`);
      return ok(up);
    }

    if (action === "receiveExisting") {
      if (t.type !== "SU_DUNG_HIEN_CO" || t.status !== "NHAN_TU_HIEN_CO") return fail("Phiếu không ở bước Nhận vật tư từ Hiện có");
      if (!stepAllowedWithMap(await getWorkflowRoleMap(), "receive", user))
        return fail("Bạn không có quyền ở bước Nhận vật tư từ Hiện có (Quản trị phân quyền ở mục Phân quyền quy trình)", 403);
      // Bước của VHV: quyền bước có phạm vi toàn phân xưởng nên phải giao thêm với cương vị phiếu.
      { const err = assignedPositionError(user, t); if (err) return err; }
      const quantity = Math.trunc(Number(body.quantity));
      const item = t.items[0];
      if (!item) return fail("Phiếu chưa có vật tư");
      if (!Number.isFinite(quantity) || quantity <= 0) return fail("Số lượng nhận phải lớn hơn 0");
      if (quantity > item.material.quantity) return fail(`Số lượng nhận vượt quá Hiện có (${item.material.quantity} ${item.material.unit})`);
      const up = await prisma.materialTicket.update({
        where: { id: t.id },
        data: {
          status: "SU_DUNG_VAT_TU",
          receivedQuantity: quantity,
          receiptSource: "EXISTING",
          receivedById: user.id,
          receivedByName: user.name ?? "",
          receivedByPosition: user.position ?? null,
          receivedAt: new Date(),
        },
        include: ITEM_INCLUDE,
      });
      await audit(user.id, "MT_RECEIVE_EXISTING", "MaterialTicket", t.id, `${materialTicketReference(t)}: nhận ${quantity} từ Hiện có, chưa trừ tồn`);
      return ok(up);
    }

    // Luồng Ứng — VHV chỉ ghi nhận số lượng thực tế đã lãnh.
    // Mã vật tư nhập tay (nếu có) được bổ sung tại bước Nghiệm thu + BBNT ký tay.
    // Số đã lãnh được cộng vào Hiện có để bước Sử dụng có thể trừ sau đó; ERP không thay đổi.
    if (action === "vhvReceive") {
      if (t.type !== "UNG" || t.status !== "VHV_LANH_VAT_TU") return fail("Phiếu không ở bước VHV lãnh vật tư");
      const wfMap = await getWorkflowRoleMap();
      if (wfMap.vhvReceive.length > 0) {
        if (!stepAllowedWithMap(wfMap, "vhvReceive", user)) return fail("Bạn không có quyền ở bước VHV lãnh vật tư", 403);
      } else {
        const assignedError = assignedPositionError(user, t);
        if (assignedError) return assignedError;
      }
      const quantity = Math.trunc(Number(body.quantity));
      if (!Number.isFinite(quantity) || quantity <= 0) return fail("Số lượng vật tư đã lãnh phải lớn hơn 0");
      const repairRequestNumber = String(body.repairRequestNumber || "").trim();
      // Tên VHV lãnh: chai khí bắt buộc khai (người lãnh thường không phải người bấm máy);
      // các loại khác giữ nguyên nếp cũ là lấy tên người đăng nhập.
      const vhvReceivedByName = String(body.vhvReceivedByName || "").trim();
      if (isGasCylinderTicket(t.materialCategory) && !vhvReceivedByName) return fail("Vui lòng nhập tên VHV lãnh");
      const item = t.items[0];
      if (!item) return fail("Phiếu chưa có vật tư");
      const sharedCodes = item.material.erpCodes.length ? item.material.erpCodes : [item.material.code];
      const up = await prisma.$transaction(async (tx) => {
        const claimed = await tx.materialTicket.updateMany({
          where: { id: t.id, status: "VHV_LANH_VAT_TU", vhvReceivedAt: null },
          data: {
            // Chai khí Ứng: lãnh xong mới tới Thống kê xác nhận ĐXVT rồi mới sử dụng.
            status: isGasCylinderTicket(t.materialCategory) ? "NHAN_VAT_TU" : "SU_DUNG_VAT_TU",
            vhvReceivedQuantity: quantity,
            repairRequestNumber: repairRequestNumber || null,
            vhvReceivedByName: vhvReceivedByName || user.name || "",
            vhvReceivedByPosition: user.position ?? null,
            vhvReceivedAt: new Date(),
          },
        });
        if (claimed.count === 0) return null;
        // Lô của phiếu Ứng: tạo trước, số phiếu giao hàng điền sau ở bước Thống kê xác nhận.
        await receiveIntoLot(tx, {
          materialCode: item.material.code,
          quantity,
          ticketId: t.id,
          erpCode: item.erpCode,
        });
        await syncMaterialQuantity(tx, item.material.code, sharedCodes);
        return tx.materialTicket.findUnique({ where: { id: t.id }, include: ITEM_INCLUDE });
      });
      if (!up) return fail("Bước VHV lãnh vật tư đã được xác nhận trước đó");
      await audit(user.id, "MT_VHV_RECEIVE", "MaterialTicket", t.id, `${materialTicketReference(t)}: VHV lãnh ${quantity}${vhvReceivedByName ? ` — ${vhvReceivedByName}` : ""}${repairRequestNumber ? `; số yêu cầu sửa chữa ${repairRequestNumber}` : ""}; Hiện có ${item.material.quantity} → ${item.material.quantity + quantity}; ERP không đổi`);
      return ok(up);
    }

    // B1' — Từ chối khi vật tư không có/không đủ hoặc lý do khác. Phiếu đóng vĩnh viễn.
    if (action === "reject") {
      if (!["DE_XUAT", "UNG"].includes(t.type) || !["CHO_XAC_NHAN", "VAT_TU_KHONG_CO"].includes(t.status)) return fail("Phiếu không ở bước có thể từ chối");
      const canReject = isShiftLeader(user.position) || user.role === "ADMIN" || t.createdById === user.id;
      if (!canReject) return fail("Chỉ người tạo phiếu, Quản trị hoặc Trưởng Ca / Trưởng Kíp được từ chối", 403);
      const reason = String(body.reason || "").trim();
      if (!reason) return fail("Vui lòng nhập lý do từ chối");
      const up = await prisma.materialTicket.update({
        where: { id: t.id },
        data: { status: "TU_CHOI", rejectedReason: reason },
        include: ITEM_INCLUDE,
      });
      await audit(user.id, "MT_REJECT", "MaterialTicket", t.id, `${materialTicketReference(t)}: từ chối — ${reason}`);
      return ok(up);
    }

    // B2 — Nhập số phiếu trước, sau đó xác nhận đã giao/trả phiếu.
    // Luồng Ứng không yêu cầu tên VHV nhận phiếu.
    // PHA 1 của bước Thống Kê xác nhận ĐXVT (Đề xuất/Ứng): đối chiếu mã ERP và xuất
    // Phiếu ĐXVT (QLVT.12). Số phiếu ĐXVT bị khóa cho tới khi phiếu được xuất.
    if (action === "statsExportProposal") {
      const canExportProposal =
        (t.type === "DE_XUAT" && ["CHO_THONG_KE", "CHO_PHIEU__XUAT_KHO"].includes(t.status)) ||
        (t.type === "UNG" && t.status === "NHAN_VAT_TU");
      if (!canExportProposal) return fail("Phiếu không ở bước Thống Kê xác nhận ĐXVT");
      if (!stepAllowedWithMap(await getWorkflowRoleMap(), "stats", user))
        return fail("Bạn không có quyền Thống Kê xác nhận ĐXVT (Quản trị phân quyền ở mục Phân quyền quy trình)", 403);
      if (t.proposalDocUrl) return fail("Phiếu ĐXVT đã được xuất; mã vật tư đã được khóa");
      const item = t.items[0];
      if (!item) return fail("Phiếu chưa có vật tư");
      const sccnRepresentativeName = String(body.sccnRepresentative || "").trim();
      const sccnRepresentativePosition = String(body.sccnPosition || "").trim();
      const sccnRepresentative = t.type === "UNG"
        ? { name: sccnRepresentativeName, position: sccnRepresentativePosition }
        : undefined;
      if (t.type === "UNG" && !SCCN_REPRESENTATIVES.includes(sccnRepresentativeName as typeof SCCN_REPRESENTATIVES[number])) {
        return fail("Vui lòng chọn đại diện SCCN hợp lệ");
      }
      if (t.type === "UNG" && !SCCN_POSITIONS.includes(sccnRepresentativePosition as typeof SCCN_POSITIONS[number])) {
        return fail("Vui lòng chọn chức vụ đại diện SCCN hợp lệ");
      }
      const requestedErpCode = String(body.erpCode || "").trim();
      if (t.type === "UNG" && item.erpCode && requestedErpCode && requestedErpCode !== item.erpCode) {
        return fail("Mã vật tư đã được khóa khi xuất biên bản ở bước Nghiệm thu");
      }
      const erpCode = String(t.type === "UNG" && item.erpCode ? item.erpCode : (requestedErpCode || item.erpCode) || "").trim();
      if (!erpCode) return fail("Vui lòng chọn mã vật tư ERP");
      const allowedCodes = item.material.erpCodes.length ? item.material.erpCodes : [item.material.code];
      if (!allowedCodes.includes(erpCode)) return fail("Mã vật tư không thuộc tên vật tư đã chọn");
      const erpMaterial = await prisma.erpMaterial.findUnique({ where: { code: erpCode }, select: { name: true, erpStock: true } });
      if (!erpMaterial) return fail("Không tìm thấy tên vật tư theo mã ERP đã chọn", 404);
      // Số lượng đề xuất Hóa chất không bị ràng buộc bởi tồn ERP. Việc xác nhận
      // số lượng thực lãnh ở bước sau vẫn giữ kiểm tra tồn kho để tránh âm kho.
      if (!isChemicalFlowTicket(t.materialCategory) && erpMaterial.erpStock < item.quantity) {
        return fail(
          `Mã vật tư ERP "${erpCode}" chỉ còn ${erpMaterial.erpStock.toLocaleString("vi-VN")} ${item.material.unit}, không đủ số lượng đề xuất ${item.quantity.toLocaleString("vi-VN")} ${item.material.unit}`
        );
      }
      const itemOverride = { materialCode: erpCode, materialName: erpMaterial.name };
      const proposalDoc = await buildProposalDocument(t, user, itemOverride, sccnRepresentative);
      // Riêng luồng Ứng: BBNT D-Office được xuất cùng Phiếu ĐXVT tại bước này,
      // thay vì xuất sớm ở bước Nghiệm thu.
      const bbntDo = t.type === "UNG" && !t.docUrl && !isGasCylinderTicket(t.materialCategory)
        ? await buildBbntDoDocument(t, {
            pctNumber: t.pctNumber ?? undefined,
            workStartedAt: t.workStartedAt ?? undefined,
            workEndedAt: t.workEndedAt ?? undefined,
            receivedQuantity: t.receivedQuantity ?? t.vhvReceivedQuantity ?? undefined,
            deliveryNoteNumber: await deliveryNoteForDocuments(t),
            itemOverride,
            sccnRepresentative,
          })
        : null;
      const up = await prisma.$transaction(async (tx) => {
        await tx.materialTicketItem.update({ where: { id: item.id }, data: { erpCode, erpName: erpMaterial.name } });
        return tx.materialTicket.update({
          where: { id: t.id },
          data: {
            proposalDocUrl: proposalDoc.url,
            ...(bbntDo ? { docUrl: bbntDo.url } : {}),
            ...(sccnRepresentative
              ? {
                  sccnRepresentativeName: sccnRepresentative.name,
                  sccnRepresentativePosition: sccnRepresentative.position,
                }
              : {}),
          },
          include: ITEM_INCLUDE,
        });
      });
      await audit(user.id, "MT_STATS_EXPORT_PROPOSAL", "MaterialTicket", t.id, `${materialTicketReference(t)}: xác nhận mã ${erpCode}, xuất Phiếu ĐXVT (QLVT.12)${bbntDo ? " và BBNT D-Office" : ""}`);
      return ok(up);
    }

    if (action === "stats") {
      // LUỒNG HÓA CHẤT — bước 2: không có mã ERP, không xuất Phiếu ĐXVT, chỉ chốt
      // LỊCH GIAO HÀNG và KHỐI LƯỢNG GIAO. Thống kê hoặc Kỹ thuật viên đều làm được.
      if (t.type === CHEMICAL_TICKET_TYPE) {
        if (t.status !== "CHO_THONG_KE") return fail("Phiếu không ở bước xác nhận đề xuất vật tư");
        if (!stepAllowedWithMap(await getWorkflowRoleMap(), "stats", user) && !isTechnician(user)) {
          return fail("Bạn không có quyền xác nhận đề xuất vật tư (Thống kê hoặc Kỹ thuật viên)", 403);
        }
        const deliveryQuantity = Math.trunc(Number(body.deliveryQuantity));
        if (!Number.isFinite(deliveryQuantity) || deliveryQuantity <= 0) return fail("Khối lượng giao phải lớn hơn 0");
        const deliveryScheduledAt = body.deliveryScheduledAt ? parseDateInput(body.deliveryScheduledAt) : null;
        if (!deliveryScheduledAt || Number.isNaN(deliveryScheduledAt.getTime())) return fail("Vui lòng chọn lịch giao hàng");
        const updated = await prisma.materialTicket.update({
          where: { id: t.id },
          data: {
            deliveryScheduledAt,
            deliveryQuantity,
            status: "NHAN_VAT_TU",
            statsById: user.id,
            statsByName: user.name ?? "",
            statsByPosition: user.position ?? null,
            statsAt: new Date(),
          },
          include: ITEM_INCLUDE,
        });
        await audit(user.id, "MT_STATS", "MaterialTicket", t.id,
          `${materialTicketReference(t)}: Xác nhận đề xuất hóa chất — giao ${deliveryQuantity} ngày ${deliveryScheduledAt.toLocaleDateString("vi-VN")}`);
        return ok(updated);
      }
      if (!["DE_XUAT", "UNG"].includes(t.type) || !["CHO_THONG_KE", "CHO_PHIEU__XUAT_KHO", "CHO_XAC_NHAN_PHAT"].includes(t.status)) return fail("Phiếu không ở bước Thống Kê xác nhận ĐXVT");
      // Hai pha, hai quyền: nhập mã ERP + số phiếu ĐXVT dùng "stats"; xác nhận VHV
      // nhận / đã trả phiếu (CHO_XAC_NHAN_PHAT) dùng "statsHandover" để giao được cho
      // cương vị khác ngoài Thống kê.
      const statsStep = t.status === "CHO_XAC_NHAN_PHAT" ? "statsHandover" : "stats";
      if (!stepAllowedWithMap(await getWorkflowRoleMap(), statsStep, user))
        return fail(
          t.status === "CHO_XAC_NHAN_PHAT"
            ? "Bạn không có quyền Xác nhận VHV nhận / trả phiếu ĐXVT (Quản trị phân quyền ở mục Phân quyền quy trình)"
            : "Bạn không có quyền Thống Kê xác nhận ĐXVT (Quản trị phân quyền ở mục Phân quyền quy trình)",
          403
        );
      // PHA 2 (Đề xuất): chỉ nhập được số phiếu ĐXVT sau khi đã xuất Phiếu ĐXVT.
      if (t.type === "DE_XUAT" && t.status !== "CHO_XAC_NHAN_PHAT" && !t.proposalDocUrl)
        return fail("Vui lòng xác nhận mã vật tư và xuất Phiếu ĐXVT trước khi nhập số phiếu");
      const num = String(body.proposalNumber || t.proposalNumber || "").trim();
      const proposalReceiverName = String(body.proposalReceiverName || t.proposalReceiverName || "").trim();
      if (!num) return fail("Vui lòng nhập số phiếu đề xuất vật tư");

      if (t.status !== "CHO_XAC_NHAN_PHAT") {
        const item = t.items[0];
        if (!item) return fail("Phiếu chưa có vật tư");
        // Mã ERP đã đóng băng khi xuất Phiếu ĐXVT (pha 1) — pha 2 không cần gửi lại.
        const erpCode = String(body.erpCode || item.erpCode || "").trim();
        let erpName: string | null = null;
        if (t.type === "DE_XUAT") {
          if (!erpCode) return fail("Vui lòng chọn mã vật tư ERP");
          const allowedCodes = item.material.erpCodes.length ? item.material.erpCodes : [item.material.code];
          if (!allowedCodes.includes(erpCode)) return fail("Mã vật tư không thuộc tên vật tư đã chọn");
          const erpMaterial = await prisma.erpMaterial.findUnique({ where: { code: erpCode }, select: { name: true } });
          if (!erpMaterial) return fail("Không tìm thấy tên vật tư theo mã ERP đã chọn", 404);
          erpName = erpMaterial.name;
        }
        const up = await prisma.$transaction(async (tx) => {
          if (t.type === "DE_XUAT") {
            await tx.materialTicketItem.update({ where: { id: item.id }, data: { erpCode, erpName } });
          }
          return tx.materialTicket.update({
            where: { id: t.id },
            data: {
              status: "CHO_XAC_NHAN_PHAT",
              proposalNumber: num,
              statsById: user.id, statsByName: user.name ?? "",
              statsByPosition: user.position ?? null, statsAt: new Date(),
            },
            include: ITEM_INCLUDE,
          });
        });
        await audit(user.id, "MT_STATS", "MaterialTicket", t.id, `${materialTicketReference(t)}: Xác nhận số phiếu ĐXVT: ${num}${erpCode ? `; mã vật tư ${erpCode}` : ""}`);
        return ok(up);
      }

      const up = await prisma.materialTicket.update({
        where: { id: t.id },
        data: {
          status: t.type === "UNG" ? "CHO_QUYET_TOAN" : "NHAN_VAT_TU",
          proposalNumber: num,
          proposalIssuedAt: new Date(),
          proposalReceiverName: t.type === "UNG" ? null : proposalReceiverName || null,
          statsById: user.id, statsByName: user.name ?? "",
          statsByPosition: user.position ?? null, statsAt: new Date(),
        },
        include: ITEM_INCLUDE,
      });
      await audit(user.id, "MT_STATS", "MaterialTicket", t.id, `${materialTicketReference(t)}: Xác nhận ĐXVT: ${num}${t.type === "UNG" ? "; đã xác nhận trả phiếu" : proposalReceiverName ? `; VHV nhận phiếu ${proposalReceiverName}` : ""}`);
      return ok(up);
    }

    // B2' — Đề xuất: xác nhận số phiếu giao hàng trước, sau đó mới nhập số YCSC
    // ở trạng thái CHO_PHIEU_YCSC. Ứng vẫn dùng bước gộp như hiện tại.
    // Ứng: bước gộp "XÁC NHẬN ĐXVT" (chỉ Thống kê): nguồn lãnh + mã ERP + khối lượng
    // + số phiếu giao hàng + số phiếu ĐXVT → chuyển Quyết toán; chưa xuất biên bản tại đây.
    if (action === "receive") {
      // LUỒNG HÓA CHẤT — bước 3 (cuối): VHV điền khối lượng lãnh, ngày lãnh, người lãnh.
      // Xong là HOÀN TẤT, không qua sử dụng — nghiệm thu — quyết toán.
      if (t.type === CHEMICAL_TICKET_TYPE) {
        if (t.status !== "NHAN_VAT_TU") return fail("Phiếu không ở bước xác nhận khối lượng lãnh");
        const assigned = samePosition(user.position, t.assignedPosition);
        if (!assigned && user.role !== "ADMIN") {
          return fail("Chỉ VHV được giao phiếu mới xác nhận khối lượng lãnh", 403);
        }
        const receivedQuantity = Math.trunc(Number(body.receivedQuantity));
        if (!Number.isFinite(receivedQuantity) || receivedQuantity <= 0) return fail("Khối lượng lãnh phải lớn hơn 0");
        const receivedAt = body.receivedAt ? parseDateInput(body.receivedAt) : null;
        if (!receivedAt || Number.isNaN(receivedAt.getTime())) return fail("Vui lòng chọn ngày lãnh");
        const receivedByName = String(body.receivedByName || "").trim();
        if (!receivedByName) return fail("Vui lòng nhập tên VHV lãnh");
        const updated = await prisma.materialTicket.update({
          where: { id: t.id },
          data: {
            receivedQuantity,
            receivedAt,
            receivedById: user.id,
            receivedByName,
            receivedByPosition: user.position ?? null,
            status: "HOAN_TAT",
            completedAt: new Date(),
            completedById: user.id,
            completedByName: receivedByName,
            completedByPosition: user.position ?? null,
          },
          include: ITEM_INCLUDE,
        });
        await audit(user.id, "MT_RECEIVE", "MaterialTicket", t.id,
          `${materialTicketReference(t)}: Xác nhận lãnh hóa chất ${receivedQuantity} ngày ${receivedAt.toLocaleDateString("vi-VN")} — ${receivedByName}; hoàn tất phiếu`);
        return ok(updated);
      }
      if (!["DE_XUAT", "UNG"].includes(t.type) || t.status !== "NHAN_VAT_TU") return fail("Phiếu không ở bước Xác nhận vật tư lãnh");
      const requiredStep = t.type === "UNG" ? "stats" : "receive";
      if (!stepAllowedWithMap(await getWorkflowRoleMap(), requiredStep, user))
        return fail(t.type === "UNG" ? "Bạn không có quyền Thống Kê xác nhận ĐXVT (Quản trị phân quyền ở mục Phân quyền quy trình)" : "Bạn không có quyền ở bước Xác nhận vật tư lãnh (Quản trị phân quyền ở mục Phân quyền quy trình)", 403);
      // Luồng Ứng: bước này là của Thống kê (việc chung cả ca) nên KHÔNG rào theo cương vị phiếu.
      if (t.type !== "UNG") { const err = assignedPositionError(user, t); if (err) return err; }
      const receivedQuantity = Math.trunc(Number(body.receivedQuantity));
      if (!Number.isFinite(receivedQuantity) || receivedQuantity <= 0) return fail("Khối lượng vật tư lãnh phải lớn hơn 0");
      if (t.type === "UNG" && !t.proposalDocUrl)
        return fail("Vui lòng chọn mã vật tư và xác nhận xuất Phiếu ĐXVT trước khi nhập số phiếu");
      const receivedMethod = String(body.deliveryNoteNumber || body.receivedMethod || "").trim();
      const receiptSource = t.type === "UNG" ? normalizeReceiptSource(body.receiptSource) : "ERP";
      if (!receivedMethod) return fail("Vui lòng nhập số phiếu giao hàng");
      const proposalNumber = t.type === "UNG" ? String(body.proposalNumber || t.proposalNumber || "").trim() : "";
      if (t.type === "UNG" && !proposalNumber) return fail("Vui lòng nhập số phiếu đề xuất vật tư");
      const item = t.items[0];
      if (!item) return fail("Phiếu chưa có vật tư");
      const requestedErpCode = String(body.erpCode || "").trim();
      if (t.type === "UNG" && requestedErpCode && requestedErpCode !== item.erpCode)
        return fail("Mã vật tư không khớp với Phiếu ĐXVT đã xuất");
      const erpCode = String(t.type === "UNG" ? item.erpCode : (requestedErpCode || item.erpCode) || "").trim();
      if (!erpCode) return fail("Vui lòng chọn mã vật tư ERP");
      const allowedCodes = item.material.erpCodes.length ? item.material.erpCodes : [item.material.code];
      if (!allowedCodes.includes(erpCode)) return fail("Mã vật tư không thuộc tên vật tư đã chọn");
      const erpMaterial = await prisma.erpMaterial.findUnique({ where: { code: erpCode }, select: { name: true } });
      if (!erpMaterial) return fail("Không tìm thấy tên vật tư theo mã ERP đã chọn", 404);
      const erpRows = await prisma.$queryRaw<Array<{ erpStock: number }>>`
        SELECT "erpStock" FROM "ErpMaterial" WHERE "code" = ${erpCode} LIMIT 1
      `;
      if (erpRows.length === 0) return fail(`Không tìm thấy mã vật tư ERP "${erpCode}"`, 404);
      const before = item.material.quantity;
      const erpBefore = Number(erpRows[0]?.erpStock ?? 0);
      if (receiptSource === "ERP" && receivedQuantity > erpBefore) {
        return fail(
          `Tồn ERP của mã ${erpCode} chỉ còn ${erpBefore} ${item.material.unit}, ` +
          `không đủ để xác nhận lãnh ${receivedQuantity} ${item.material.unit}.`
        );
      }
      const erpAfter = receiptSource === "ERP" ? erpBefore - receivedQuantity : erpBefore;
      // Luồng Ứng đã cộng số VHV lãnh ở bước trước. Bước xác nhận chính thức
      // chỉ bù chênh lệch để không cộng trùng; luồng Đề xuất vẫn cộng toàn bộ.
      const materialIncrement = t.type === "UNG"
        ? receivedQuantity - (t.vhvReceivedQuantity ?? 0)
        : receivedQuantity;
      if (before + materialIncrement < 0) return fail("Số lượng xác nhận làm Hiện có bị âm");
      const up = await prisma.$transaction(async (tx) => {
        const sharedCodes = sharedCodesOf(item.material);
        // Vào lô mang SỐ PHIẾU GIAO HÀNG vừa nhập; luồng Ứng đã tạo lô ở bước VHV lãnh nên
        // ở đây chỉ cộng phần chênh và điền số phiếu vào đúng lô đó.
        await receiveIntoLot(tx, {
          materialCode: item.material.code,
          quantity: materialIncrement,
          ticketId: t.id,
          deliveryNote: receivedMethod,
          erpCode,
        });
        await syncMaterialQuantity(tx, item.material.code, sharedCodes);
        if (receiptSource === "ERP") await tx.$executeRaw`
          UPDATE "ErpMaterial" SET "erpStock" = ${erpAfter}, "updatedAt" = NOW() WHERE "code" = ${erpCode}
        `;
        await tx.materialTicket.update({
          where: { id: t.id },
          data: {
            // Chai khí bỏ cả quyết toán, số yêu cầu sửa chữa lẫn bước Sử dụng vật tư —
            // lãnh xong là tới thẳng bước Xác nhận trả (bước này mới trừ kho).
            status: isGasCylinderTicket(t.materialCategory)
              ? GAS_RETURN_STATUS
              : t.type === "UNG" ? "CHO_QUYET_TOAN" : "CHO_PHIEU_YCSC",
            receivedQuantity, receivedMethod: receivedMethod || null, deliveryNoteNumber: receivedMethod || null, receiptSource,
            // Ứng: bước gộp kiêm luôn Thống kê xác nhận ĐXVT — lưu số phiếu + dấu vết Thống kê.
            ...(t.type === "UNG" ? {
              proposalNumber,
              proposalIssuedAt: new Date(),
              statsById: user.id, statsByName: user.name ?? "",
              statsByPosition: user.position ?? null, statsAt: new Date(),
            } : {}),
            remainingQuantity: receivedQuantity - (t.usedQuantity ?? 0),
            receivedById: user.id, receivedByName: user.name ?? "",
            receivedByPosition: user.position ?? null, receivedAt: new Date(),
          },
          include: ITEM_INCLUDE,
        });
        await tx.materialTicketItem.update({ where: { id: item.id }, data: { erpCode, erpName: erpMaterial.name } });
        return tx.materialTicket.findUnique({ where: { id: t!.id }, include: ITEM_INCLUDE });
      });
      await audit(
        user.id, "MT_RECEIVE", "MaterialTicket", t.id,
        `${materialTicketReference(t)}: ${receiptSourceLabel(receiptSource)} ${receivedQuantity} (${receivedMethod}) — Hiện có ${item.material.code}: ${before} → ${before + materialIncrement}; ERP ${erpCode}: ${erpBefore} → ${erpAfter}${t.type !== "UNG" ? "; chờ nhập số yêu cầu sửa chữa" : `; số phiếu ĐXVT ${proposalNumber}; chuyển Quyết toán`}`
      );
      return ok(up);
    }

    if (action === "repairRequest") {
      if (!["DE_XUAT", "UNG"].includes(t.type) || t.status !== "CHO_PHIEU_YCSC") return fail("Phiếu không ở bước Xác nhận vật tư lãnh");
      if (!stepAllowedWithMap(await getWorkflowRoleMap(), "receive", user)) return fail("Bạn không có quyền ở bước Xác nhận vật tư lãnh", 403);
      { const err = assignedPositionError(user, t); if (err) return err; }
      const value = String(body.repairRequestNumber || "").trim();
      if (!value) return fail("Vui lòng nhập số yêu cầu sửa chữa");
      if (sameTicketNumber(value, t.proposalNumber)) return fail("Số yêu cầu sửa chữa phải nhập mới, không được trùng với số phiếu ĐXVT");
      const up = await prisma.materialTicket.update({ where: { id: t.id }, data: { status: "SU_DUNG_VAT_TU", repairRequestNumber: value }, include: ITEM_INCLUDE });
      await audit(user.id, "MT_REPAIR_REQUEST", "MaterialTicket", t.id, `${materialTicketReference(t)}: xác nhận số yêu cầu sửa chữa ${value}; chuyển Sử dụng vật tư`);
      return ok(up);
    }

    // B2'' — SỬ DỤNG VẬT TƯ: PCT/LCT + chỉ huy + nội dung + khối lượng dùng.
    // Tồn kho đã cộng khối lượng lãnh ở bước Nhận vật tư; bước này trừ khối lượng dùng.
    if (action === "use") {
      if (!["DE_XUAT", "UNG", "SU_DUNG_HIEN_CO"].includes(t.type) || t.status !== "SU_DUNG_VAT_TU") return fail("Phiếu không ở bước Sử dụng vật tư");
      if (!stepAllowedWithMap(await getWorkflowRoleMap(), "use", user))
        return fail("Bạn không có quyền ở bước Sử dụng vật tư (Quản trị phân quyền ở mục Phân quyền quy trình)", 403);
      { const err = assignedPositionError(user, t); if (err) return err; }
      // Cờ thu hồi đã được chụp trên phiếu từ lý do và cấu hình điểm dùng vật tư.
      // và không tin thân yêu cầu — gọi thẳng API cũng không bật/tắt được.
      const recoveryRequired = materialTicketRequiresRecovery(t);
      const recoveryQuantity = recoveryRequired ? Math.trunc(Number(body.recoveryQuantity)) : null;
      const recoveryReturned = recoveryRequired && body.recoveryReturned === true;
      const usedQuantity = Math.trunc(Number(body.usedQuantity));
      const materialUserName = String(body.materialUserName || "").trim();
      if (recoveryRequired && (!recoveryQuantity || recoveryQuantity <= 0)) return fail("Vui lòng nhập số lượng vật tư thu hồi");
      if (!Number.isFinite(usedQuantity) || usedQuantity <= 0) return fail("Khối lượng vật tư sử dụng phải lớn hơn 0");
      if (!materialUserName) return fail("Vui lòng nhập tên VHV sử dụng vật tư");

      const item = t.items[0];
      if (!item) return fail("Phiếu chưa có vật tư");
      const received = t.receivedQuantity ?? (t.type === "UNG" ? t.vhvReceivedQuantity ?? item.quantity : 0);
      const remaining = received - usedQuantity;
      if (t.type === "SU_DUNG_HIEN_CO" && usedQuantity > received) return fail(`Số lượng sử dụng vượt số lượng đã nhận từ Hiện có (${received})`);
      const mat = await prisma.material.findUnique({
        where: { id: item.materialId },
        select: { id: true, code: true, erpCodes: true, name: true, quantity: true },
      });
      if (!mat) return fail("Không tìm thấy vật tư trong Danh mục", 404);
      if (usedQuantity > mat.quantity) {
        return fail(`Số lượng vật tư sử dụng đã nhập vượt số lượng hiện có. ${mat.name} hiện còn ${mat.quantity}; vui lòng nhập lại số lượng.`);
      }
      const newQty = mat.quantity - usedQuantity;
      // Người lập biên bản có thể tự chọn lấy bao nhiêu từ từng phiếu giao hàng; bỏ trống thì
      // chia FIFO — dọn hết lô cũ trước rồi mới ăn sang lô mới.
      const requestedAllocation = Array.isArray(body.lotAllocation)
        ? (body.lotAllocation as Array<{ lotId?: unknown; quantity?: unknown }>)
            .map((row) => ({ lotId: String(row?.lotId ?? ""), quantity: Math.trunc(Number(row?.quantity ?? 0)) }))
            .filter((row) => row.lotId && row.quantity > 0)
        : undefined;
      const up = await prisma.$transaction(async (tx) => {
        try {
          await consumeStock(tx, {
            materialCode: mat.code,
            ticketId: t.id,
            quantity: usedQuantity,
            allocation: requestedAllocation,
          });
        } catch (error) {
          throw fail((error as Error).message);
        }
        await syncMaterialQuantity(tx, mat.code, sharedCodesOf(mat));
        return tx.materialTicket.update({
          where: { id: t.id },
          data: {
            // Chai khí bỏ nghiệm thu và quyết toán — dùng xong là tới bước trả vỏ chai.
            status: isGasCylinderTicket(t.materialCategory) ? GAS_RETURN_STATUS : "CHO_NGHIEM_THU",
            recoveryRequired, recoveryQuantity,
            // VHV xác nhận trực tiếp việc đã trả vật tư thu hồi cho kho tại bước này.
            recoveryReturnedAt: recoveryReturned ? new Date() : null,
            // Không xuất file tại bước xác nhận sử dụng; bước Nghiệm thu sẽ sinh đồng thời
            // BBNT ký tay và Biên bản vật tư thu hồi.
            recoveryDocUrl: null,
            usedQuantity, remainingQuantity: remaining, materialUserName,
            usedById: user.id, usedByName: user.name ?? "",
            usedByPosition: user.position ?? null, usedAt: new Date(),
          },
          include: ITEM_INCLUDE,
        });
      });
      await audit(
        user.id, "MT_USE", "MaterialTicket", t.id,
        `${materialTicketReference(t)}: VHV sử dụng ${materialUserName}; lãnh ${received}, dùng ${usedQuantity}, còn lại ${remaining} — tồn kho ${mat.code}: ${mat.quantity} → ${newQty}`
      );
      return ok(up);
    }

    // BƯỚC CUỐI CỦA LUỒNG CHAI KHÍ — xác nhận đã trả vỏ chai về kho → HOÀN TẤT.
    // Không sinh biên bản: chai khí không có BBNT lẫn BBTHVT, chỉ ghi nhận số vỏ + ngày trả.
    if (action === "returnItems") {
      if (!isGasCylinderTicket(t.materialCategory)) return fail("Bước Xác nhận trả chỉ áp dụng cho phiếu Chai khí");
      if (!["DE_XUAT", "UNG"].includes(t.type) || t.status !== GAS_RETURN_STATUS) return fail("Phiếu không ở bước Xác nhận trả");
      if (!returnStepAllowed(await getWorkflowRoleMap(), user))
        return fail("Bạn không có quyền ở bước Xác nhận trả (Quản trị phân quyền ở mục Phân quyền quy trình)", 403);
      { const err = assignedPositionError(user, t); if (err) return err; }
      const returnedQuantity = Math.trunc(Number(body.returnedQuantity));
      if (!Number.isFinite(returnedQuantity) || returnedQuantity <= 0) return fail("Số lượng vỏ chai trả phải lớn hơn 0");
      const returnedAt = body.returnedAt ? parseDateInput(body.returnedAt) : new Date();
      if (Number.isNaN(returnedAt.getTime())) return fail("Ngày trả không hợp lệ");
      const returnedByName = String(body.returnedByName || "").trim();
      if (!returnedByName) return fail("Vui lòng nhập tên người trả");
      const item = t.items[0];
      if (!item) return fail("Phiếu chưa có vật tư");
      const unitLabel = item.material.unit;
      const received = t.receivedQuantity ?? t.vhvReceivedQuantity ?? 0;
      if (received > 0 && returnedQuantity > received) {
        return fail(`Số chai trả (${returnedQuantity}) vượt số đã lãnh (${received} ${unitLabel})`);
      }
      const mat = await prisma.material.findUnique({
        where: { id: item.materialId },
        select: { id: true, code: true, erpCodes: true, name: true, quantity: true },
      });
      if (!mat) return fail("Không tìm thấy vật tư trong Danh mục", 404);
      // Phiếu cũ đã đi qua bước Sử dụng (bước nay đã bỏ) thì phần nó đang giữ đã bị trừ khỏi
      // Hiện có. `consumeStock` trả phần đó về lô trước khi cấp lại, nên phải cộng lại khi so
      // sánh — không thì phiếu tự chặn chính số nó đang giữ.
      const heldByTicket = (await usedLotsOfTicket(prisma, t.id)).reduce((sum, lot) => sum + lot.used, 0);
      if (returnedQuantity > mat.quantity + heldByTicket) {
        return fail(`Số chai trả vượt số lượng hiện có. ${mat.name} hiện còn ${mat.quantity + heldByTicket} ${unitLabel}.`);
      }
      const up = await prisma.$transaction(async (tx) => {
        // Chai khí không còn bước Sử dụng vật tư, nên chính bước TRẢ là lúc trừ kho: trả vỏ
        // nghĩa là số chai đó đã dùng hết. Không trừ ở đây thì lượng lãnh về nằm lại trong
        // Hiện có vĩnh viễn — đúng loại tồn ảo đã phải đi dọn hôm 17/08.
        try {
          await consumeStock(tx, { materialCode: mat.code, ticketId: t.id, quantity: returnedQuantity });
        } catch (error) {
          throw fail((error as Error).message);
        }
        await syncMaterialQuantity(tx, mat.code, sharedCodesOf(mat));
        return tx.materialTicket.update({
          where: { id: t.id },
          data: {
            status: "HOAN_TAT",
            // Dùng lại đúng hai cột của nghiệp vụ thu hồi: chai khí không có BBTHVT nên hai
            // cột này bỏ trống, và ý nghĩa "vật tư trả về kho" thì trùng khớp.
            recoveryQuantity: returnedQuantity,
            recoveryReturnedAt: returnedAt,
            // Ghi luôn dấu vết sử dụng: bước Sử dụng đã bỏ nhưng số liệu tiêu hao vẫn phải có
            // để các bảng thống kê và lịch sử thay thế đọc được.
            usedQuantity: returnedQuantity,
            remainingQuantity: received - returnedQuantity,
            materialUserName: returnedByName,
            usedById: user.id,
            usedByName: returnedByName,
            usedByPosition: user.position ?? null,
            usedAt: returnedAt,
            completedById: user.id,
            completedByName: returnedByName,
            completedByPosition: user.position ?? null,
            completedAt: new Date(),
          },
          include: ITEM_INCLUDE,
        });
      });
      await audit(user.id, "MT_RETURN", "MaterialTicket", t.id,
        `${materialTicketReference(t)}: Xác nhận trả ${returnedQuantity} ${unitLabel} ngày ${returnedAt.toLocaleDateString("vi-VN")} — ${returnedByName}; Hiện có ${mat.code}: ${mat.quantity} → ${mat.quantity - returnedQuantity}; hoàn tất phiếu`);
      return ok(up);
    }

    // B3 — Trưởng Ca nghiệm thu: nhập PCT/LCT + nội dung + chỉ huy → xuất Word → HOÀN TẤT
    if (action === "accept") {
      if (!["DE_XUAT", "UNG", "SU_DUNG_HIEN_CO"].includes(t.type) || t.status !== "CHO_NGHIEM_THU") return fail("Phiếu không ở bước Nghiệm thu");
      if (!stepAllowedWithMap(await getWorkflowRoleMap(), "accept", user))
        return fail("Bạn không có quyền nghiệm thu (Quản trị phân quyền ở mục Phân quyền quy trình)", 403);
      // PCT/chỉ huy/nội dung đã nhập ở bước SỬ DỤNG VẬT TƯ; phiếu cũ (trước khi có
      // bước này) vẫn nhận từ form nghiệm thu để tương thích.
      const note = String(body.completionNote || "").trim();
      const pct = String(body.pctNumber || "").trim();
      const chiHuy = String(body.chiHuyName || "").trim();
      const workStartedAt = new Date(String(body.workStartedAt || ""));
      const workEndedAt = new Date(String(body.workEndedAt || ""));
      const bbkt = String(body.bbktNumber || "").trim(); // Số BBNT ký tay bổ sung ở bước này (nếu có)
      const recoveryRequired = materialTicketRequiresRecovery(t);
      if (!note) return fail("Vui lòng nhập thông tin xác nhận thay thế xong");
      if (!pct) return fail("Vui lòng nhập số PCT/LCT");
      if (!chiHuy) return fail("Vui lòng nhập tên chỉ huy trực tiếp (SCCN)");
      if (Number.isNaN(workStartedAt.getTime()) || Number.isNaN(workEndedAt.getTime())) return fail("Vui lòng chọn thời gian bắt đầu và kết thúc");
      if (workEndedAt <= workStartedAt) return fail("Thời gian kết thúc nghiệm thu phải sau thời gian bắt đầu nghiệm thu");
      if (recoveryRequired && (!t.recoveryQuantity || t.recoveryQuantity <= 0)) {
        return fail("Phiếu có thu hồi chưa có số lượng vật tư thu hồi. Vui lòng chỉnh sửa bước Sử dụng vật tư trước khi nghiệm thu.");
      }

      const item = t.items[0];
      if (!item) return fail("Phiếu chưa có vật tư");
      const erpCode = String(body.erpCode || item.erpCode || "").trim();
      if (!erpCode) return fail("Vui lòng chọn mã vật tư ERP để xuất các biên bản Word");

      const allowedCodes = item.material.erpCodes.length ? item.material.erpCodes : [item.material.code];
      if (!allowedCodes.includes(erpCode)) return fail("Mã vật tư không thuộc tên vật tư đã chọn");
      const erpMaterial = await prisma.erpMaterial.findUnique({ where: { code: erpCode }, select: { name: true } });
      if (!erpMaterial) return fail("Không tìm thấy tên vật tư theo mã ERP đã chọn", 404);

      // NGƯỜI LẬP BIÊN BẢN CHỌN LẠI LẤY BAO NHIÊU TỪ TỪNG PHIẾU GIAO HÀNG.
      // Mặc định đã chia FIFO từ bước Sử dụng; sửa ở đây là trả hết phần cũ về lô rồi cấp lại
      // theo lựa chọn mới — tổng vẫn phải bằng số đã sử dụng, không để biên bản lệch với kho.
      //
      // ĐẶT SAU MỌI KIỂM TRA ĐẦU VÀO, đừng đôn lên trước: khối này commit ngay một giao dịch
      // riêng, nên nếu một kiểm tra phía sau trả lỗi thì kho đã bị phân bổ lại mà phiếu thì
      // không nhúc nhích — bấm lại vài lần là lô nào cũng sai lệch mà không ai thấy.
      const acceptAllocation = Array.isArray(body.lotAllocation)
        ? (body.lotAllocation as Array<{ lotId?: unknown; quantity?: unknown }>)
            .map((row) => ({ lotId: String(row?.lotId ?? ""), quantity: Math.trunc(Number(row?.quantity ?? 0)) }))
            .filter((row) => row.lotId && row.quantity > 0)
        : null;
      if (acceptAllocation?.length) {
        try {
          await prisma.$transaction(async (tx) => {
            await consumeStock(tx, {
              materialCode: item.material.code,
              ticketId: t.id,
              quantity: t.usedQuantity ?? 0,
              allocation: acceptAllocation,
            });
            await syncMaterialQuantity(tx, item.material.code, sharedCodesOf(item.material));
          });
        } catch (error) {
          return fail((error as Error).message);
        }
      }
      const itemOverride = { materialCode: erpCode, materialName: erpMaterial.name };
      const bbntItems = toBbntItems(t).map((bbntItem, index) => index === 0
        ? { ...bbntItem, materialCode: erpCode, materialName: erpMaterial.name }
        : bbntItem);

      // Một mã/tên ERP duy nhất được áp dụng cho các biên bản.
      //
      // BƯỚC NÀY KHÔNG XUẤT BBNT D-OFFICE — với bất kỳ luồng nào. Biên bản D-Office phải mang
      // tên đại diện SCCN, mà người chọn đại diện là Thống kê ở bước sau chứ không phải người
      // nghiệm thu; xuất sớm tại đây thì hoặc phải hỏi người nghiệm thu một thông tin không
      // thuộc về họ, hoặc phát hành một biên bản rồi ghi đè lại ở bước sau.
      //   - Đề xuất và Sử dụng hiện có: Thống kê xuất ở bước CHO_THONG_KE_XUAT_BIEN_BAN.
      //   - Ứng: Thống kê xuất cùng Phiếu ĐXVT (statsExportProposal).
      const documents = {
        bbkt: await generateBbntDoc({
          fileBaseName: materialTicketFileBase(t), materialCategory: t.materialCategory, soGiaoHang: await deliveryNoteForDocuments(t), lyDo: t.proposalNote, soBBKT: bbkt || t.bbktNumber, soPCT: pct, noiDung: note,
          thoiGianBatDau: workStartedAt, thoiGianKetThuc: workEndedAt,
          tenChiHuy: chiHuy, tenTruongCa: user.name ?? "",
          tenVHV: t.proposedByName, chucVuVHV: t.proposedByPosition,
          unit: t.unit, usedByName: t.materialUserName || t.usedByName, usedByPosition: t.usedByPosition,
          items: bbntItems,
        }),
        // Mọi phiếu đã chốt yêu cầu thu hồi đều xuất BBTHVT đồng thời với BBNT ký tay.
        recovery: recoveryRequired
          ? await buildRecoveryDocument(t, { pctNumber: pct, itemOverride })
          : null,
      };
      const up = await prisma.$transaction(async (tx) => {
        await tx.materialTicketItem.update({
          where: { id: item.id },
          data: { erpCode, erpName: erpMaterial.name },
        });
        return tx.materialTicket.update({
          where: { id: t.id },
          data: {
            status: t.type === "UNG"
              ? "NHAN_VAT_TU"
              : ["DE_XUAT", "SU_DUNG_HIEN_CO"].includes(t.type)
                ? "CHO_THONG_KE_XUAT_BIEN_BAN"
                : "CHO_QUYET_TOAN",
            completionNote: note, pctNumber: pct, chiHuyName: chiHuy,
            bbktDocUrl: documents.bbkt.url,
            ...(documents.recovery ? { recoveryDocUrl: documents.recovery.url } : {}),
            recoveryRequired,
            workStartedAt, workEndedAt,
            ...(bbkt ? { bbktNumber: bbkt } : {}),
            completedById: user.id, completedByName: user.name ?? "",
            completedByPosition: user.position ?? null, completedAt: new Date(),
          },
          include: ITEM_INCLUDE,
        });
      });
      await audit(user.id, "MT_ACCEPT", "MaterialTicket", t.id, `${materialTicketReference(t)}: nghiệm thu với mã ERP ${erpCode}, xuất BBNT ký tay${documents.recovery ? " và Biên bản vật tư thu hồi" : ""}, ${t.type === "UNG" ? "chuyển Thống kê xác nhận ĐXVT" : t.type === "DE_XUAT" ? "chuyển Thống kê xuất BBNT D-Office" : t.type === "SU_DUNG_HIEN_CO" ? "chuyển Thống kê xác nhận mã vật tư" : "chờ Thống kê quyết toán"}`);
      return ok(up);
    }

    if (action === "statsExportDocuments") {
      if (!["DE_XUAT", "SU_DUNG_HIEN_CO"].includes(t.type) || t.status !== "CHO_THONG_KE_XUAT_BIEN_BAN") {
        return fail("Phiếu không ở bước Thống kê xuất biên bản");
      }
      if (!stepAllowedWithMap(await getWorkflowRoleMap(), "stats", user))
        return fail("Bạn không có quyền Thống kê xuất biên bản", 403);
      const item = t.items[0];
      if (!item) return fail("Phiếu chưa có vật tư");
      const recoveryRequired = materialTicketRequiresRecovery(t);
      if (recoveryRequired && (!t.recoveryQuantity || t.recoveryQuantity <= 0)) {
        return fail("Phiếu có thu hồi chưa có số lượng vật tư thu hồi. Vui lòng chỉnh sửa bước Sử dụng vật tư trước khi xuất biên bản.");
      }
      const erpCode = String(body.erpCode || "").trim();
      if (!erpCode) return fail("Vui lòng chọn mã vật tư ERP");
      const allowedCodes = item.material.erpCodes.length ? item.material.erpCodes : [item.material.code];
      if (!allowedCodes.includes(erpCode)) return fail("Mã vật tư không thuộc tên vật tư đã chọn");
      const erpMaterial = await prisma.erpMaterial.findUnique({ where: { code: erpCode }, select: { name: true } });
      if (!erpMaterial) return fail("Không tìm thấy tên vật tư theo mã ERP đã chọn", 404);

      if (t.docUrl && item.erpCode && erpCode !== item.erpCode)
        return fail("Mã vật tư đã được khóa khi xuất BBNT D-Office ở bước Nghiệm thu");

      const itemOverride = { materialCode: erpCode, materialName: erpMaterial.name };
      const sccnRepresentativeName = String(body.sccnRepresentative || "").trim();
      const sccnRepresentativePosition = String(body.sccnPosition || "").trim();
      // CẢ HAI LUỒNG TỚI ĐƯỢC BƯỚC NÀY (Đề xuất, Sử dụng hiện có) đều xuất BBNT D-Office tại
      // đây: đây là nơi duy nhất người dùng chọn đại diện SCCN, mà tên đại diện thì phải nằm
      // trên biên bản. Giữ biến tường minh thay vì bỏ hẳn điều kiện để chỗ này còn đọc ra
      // được ý định khi có thêm luồng khác đi qua.
      const exportsBbntDo = t.type === "DE_XUAT" || t.type === "SU_DUNG_HIEN_CO";
      if (exportsBbntDo && !t.bbktDocUrl) {
        return fail("Chưa xuất BBNT ký tay ở tác vụ nghiệm thu trước đó");
      }
      if (exportsBbntDo && !SCCN_REPRESENTATIVES.includes(sccnRepresentativeName as typeof SCCN_REPRESENTATIVES[number])) {
        return fail("Vui lòng chọn đại diện SCCN hợp lệ");
      }
      if (exportsBbntDo && !SCCN_POSITIONS.includes(sccnRepresentativePosition as typeof SCCN_POSITIONS[number])) {
        return fail("Vui lòng chọn chức vụ đại diện SCCN hợp lệ");
      }

      const documents = exportsBbntDo
        ? {
            bbntDo: await buildBbntDoDocument(t, {
              itemOverride,
              sccnRepresentative: {
                name: sccnRepresentativeName,
                position: sccnRepresentativePosition,
              },
            }),
          }
        : null;

      // BBTHVT đã được xuất đồng thời với BBNT ký tay ở bước Nghiệm thu.
      const up = await prisma.$transaction(async (tx) => {
        await tx.materialTicketItem.update({ where: { id: item.id }, data: { erpCode, erpName: erpMaterial.name } });
        return tx.materialTicket.update({
          where: { id: t.id },
          data: {
            status: "CHO_QUYET_TOAN",
            ...(documents?.bbntDo ? { docUrl: documents.bbntDo.url } : {}),
            recoveryRequired,
            ...(exportsBbntDo
              ? {
                  sccnRepresentativeName,
                  sccnRepresentativePosition,
                }
              : {}),
          },
          include: ITEM_INCLUDE,
        });
      });
      await audit(
        user.id,
        "MT_STATS_EXPORT",
        "MaterialTicket",
        t.id,
        exportsBbntDo
          ? `${materialTicketReference(t)}: xác nhận mã ${erpCode}, xuất BBNT D-Office, chuyển Quyết toán`
          : `${materialTicketReference(t)}: xác nhận mã ${erpCode}, chuyển Quyết toán`,
      );
      return ok(up);
    }

    if (action === "settle") {
      if (!["DE_XUAT", "UNG", "SU_DUNG_HIEN_CO"].includes(t.type) || t.status !== "CHO_QUYET_TOAN") return fail("Phiếu không ở bước quyết toán");
      if (!stepAllowedWithMap(await getWorkflowRoleMap(), "settle", user)) return fail("Bạn không có quyền xác nhận quyết toán", 403);
      const bbntDoNumber = String(body.bbntDoNumber || "").trim();
      if (!bbntDoNumber) return fail("Vui lòng nhập số BBNT DO trước khi xác nhận quyết toán");
      // Các biên bản đã được xuất qua các tác vụ Nghiệm thu; bước này chỉ xác nhận quyết toán.
      const up = await prisma.materialTicket.update({
        where: { id: t.id },
        data: {
          status: "HOAN_TAT",
          bbntDoNumber,
          settledAt: new Date(),
          settledByName: user.name ?? "",
        },
        include: ITEM_INCLUDE,
      });
      await audit(
        user.id,
        "MT_SETTLE",
        "MaterialTicket",
        t.id,
        `${materialTicketReference(t)}: đã xác nhận quyết toán vật tư, số BBNT DO ${bbntDoNumber}`
      );
      return ok(up);
    }

    return fail("Hành động không hợp lệ");
  });
}
