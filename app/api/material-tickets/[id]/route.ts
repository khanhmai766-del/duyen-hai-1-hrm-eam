import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildBbntDoDocument, deliveryNoteForDocuments, getTicket, ITEM_INCLUDE, type FullTicket } from "@/lib/material-ticket-bbnt-do";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { isShiftLeader, isTechnician, getWorkflowRoleMap, isMaterialTicketExtraAssignedPosition, returnStepAllowed, stepAllowedWithMap } from "@/lib/material-workflow";
import { resolveSignatureBuffer } from "@/lib/bbnt-do-doc";
import { generateBbntDoc, type BbntItem } from "@/lib/bbnt-doc";
import { generateBbthvtDoc } from "@/lib/bbthvt-doc";
import { generateDxvtDoc } from "@/lib/dxvt-doc";
import { materialTicketFileBase, materialTicketReference } from "@/lib/material-ticket-sequence";
import { normalizeText } from "@/lib/nav";
import { consumeStock, deliveryNoteSummary, receiveIntoLot, releaseUsage, reverseTicketStock, sharedCodesOf, syncMaterialQuantity, usedLotsOfTicket } from "@/lib/material-stock-lot";
import { parseDateInput } from "@/lib/utils";
import { linkTicketTrucks, unlinkTicketTrucks, type TruckInput } from "@/lib/chemical-inventory/ticket-link";
import { countUsagePhotos, deleteUsagePhotos } from "@/lib/material-usage-photo";
import { deleteDeliveryPhotos, deliveryPhotoLotsOfTicket, loadDeliveryPhotoBuffer, purgeSettledLotPhotos, uploadDeliveryPhoto, MISSING_DELIVERY_PHOTO_MESSAGE } from "@/lib/material-delivery-photo";
import { keyFromPublicUrl } from "@/lib/s3";
import { syncTicketReplacementLinks, type LinkablePoint } from "@/lib/material-ticket-replacement-link";
import { MIN_USAGE_PHOTOS, MISSING_USAGE_PHOTO_MESSAGE, usesHandwrittenBbnt, CHEMICAL_TICKET_TYPE, COMMON_MATERIAL_POSITION, GAS_RETURN_STATUS, isChemicalFlowTicket, isGasCylinderCategory, isGasCylinderTicket, isOtherMaterialAdvanceTicket, isOtherMaterialTicketType, materialTicketRequiresRecovery, OTHER_MATERIAL_ADVANCE_TICKET_TYPE, OTHER_MATERIAL_TICKET_TYPE, recoveryRequiredForReason, ticketReasonAllowed, TICKET_MATERIAL_CATEGORIES, TICKET_TO_MATERIAL_CATEGORY } from "@/lib/constants";
import { positionsMatch } from "@/lib/position-catalog";
import { replacementPointDisplayLabel, replacementPointSelectionKey } from "@/lib/material-replacement-display";
import { receiveOtherMaterial } from "@/lib/other-material-stock";
import { recordSettledTicketReplacements } from "@/lib/material-ticket-replacement-settlement";

export const dynamic = "force-dynamic";

function lotStockUnit(category: string | null | undefined, unit: string | null | undefined) {
  return isGasCylinderCategory(category) && ["S1", "S2", "COMMON"].includes(unit ?? "") ? unit! : "COMMON";
}

function stockSyncOptions(category: string | null | undefined, unit: string | null | undefined) {
  const stockUnit = lotStockUnit(category, unit);
  return isGasCylinderCategory(category) ? { stockUnit, machine: stockUnit } : { stockUnit };
}

/**
 * Phiếu thuộc LUỒNG HÓA CHẤT (hóa chất + NH3 khai một bước)?
 *
 * Luồng này chỉ ghi nhận khối lượng đề xuất và khối lượng nhập: hàng do nhà thầu giao
 * thẳng theo hợp đồng, không qua kho DH1 nên KHÔNG cộng tồn và KHÔNG trừ ERP.
 */
function isChemicalSequenceTicket(type: string | null | undefined) {
  return type === CHEMICAL_TICKET_TYPE || type === "GHI_NHAN";
}

const SCCN_REPRESENTATIVES = ["Võ Văn Chiến", "Lê Văn Khánh", "Nguyễn Thanh Toàn"] as const;
const SCCN_POSITIONS = ["Quản Đốc", "Phó Quản Đốc"] as const;


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
  itemOverride: { materialCode: string; materialName: string } | Map<string, { materialCode: string; materialName: string }>,
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
  const proposalItems = t.items.map((it, index) => {
    const override = itemOverride instanceof Map
      ? itemOverride.get(it.id)
      : index === 0 ? itemOverride : undefined;
    return ({
    deviceName: it.deviceNameManual || it.device?.name || "",
    materialCode: override?.materialCode || it.erpCode || it.material.code,
    materialName: override?.materialName || it.erpName || it.material.name,
    materialUnit: it.material.unit,
    quantity: it.quantity,
    });
  });
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

/**
 * Ảnh phiếu xuất kho liên 3 kèm theo BBTHVT — phụ lục bắt buộc của mẫu QLVT.06 (chú thích số 6).
 *
 * Lô nào được tính thì xem `deliveryPhotoLotsOfTicket`; lô chưa có ảnh thì bỏ qua tấm đó, không
 * chặn xuất biên bản.
 */
async function loadTicketDeliveryPhotos(t: FullTicket) {
  const unit = t.items[0]?.material.unit ?? "";
  const lots = await deliveryPhotoLotsOfTicket(prisma, t.id, await usedLotsOfTicket(prisma, t.id));

  const photos = await Promise.all(
    lots.map(async (lot) => {
      const buffer = await loadDeliveryPhotoBuffer(lot.deliveryPhotoKey);
      return buffer ? { deliveryNote: lot.deliveryNote, used: lot.used, unit, buffer } : null;
    })
  );
  return photos.filter((photo): photo is NonNullable<typeof photo> => photo !== null);
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
  const deliveryPhotos = await loadTicketDeliveryPhotos(t);
  return generateBbthvtDoc({
    deliveryPhotos,
    // Bổ sung ảnh liên 3 cho phiếu cũ rồi xuất lại phải GHI ĐÈ đúng tệp đang treo trên phiếu,
    // không đẻ tệp mới ở thư mục ngày hôm nay.
    existingKey: keyFromPublicUrl(t.recoveryDocUrl),
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

  // BBNT ký tay chỉ còn cho bi nghiền. Phiếu loại khác đã xuất file trước 2026 thì
  // GIỮ NGUYÊN bản cũ — mẫu chung đã gỡ khỏi máy chủ nên có muốn dựng lại cũng không
  // còn gì để dựng.
  if (previous.bbktDocUrl && !skip.has("bbktDocUrl") && usesHandwrittenBbnt(updated.materialCategory)) {
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
    // Phiếu hoàn tất là hồ sơ lịch sử: có thể xóa khỏi website nhưng phải giữ
    // nguyên dòng đã đồng bộ trên Sheet. Phiếu dang dở mới được xóa khỏi Sheet.
    const preserveCompletedSheetRow = t.status === "HOAN_TAT";
    const deletedMaterials = [...new Map(t.items.map((item) => [item.material.code, item.material])).values()];
    await prisma.$transaction(async (tx) => {
      // Chặn thao tác tạo/xóa đồng thời trong lúc dồn STT để không phát sinh
      // số trùng hoặc khoảng trống giữa các phiếu.
      await tx.$executeRaw`LOCK TABLE "MaterialTicket" IN EXCLUSIVE MODE`;
      // HOÀN KHO TRƯỚC KHI XÓA: gỡ lô phiếu mang vào và trả lại phần nó đã dùng. Không làm
      // thì phiếu tạo thử rồi xóa vẫn để lại số ma trong kho — đã gặp trên production: một phiếu
      // lãnh 27 dùng 18 rồi bị xóa, kho dôi ra 9 không ai truy được vì phiếu không còn.
      for (const deletedMaterial of deletedMaterials) {
        const stockUnit = lotStockUnit(deletedMaterial.category, t.unit);
        await reverseTicketStock(tx, { materialCode: deletedMaterial.code, stockUnit, ticketId: t.id });
        await syncMaterialQuantity(tx, deletedMaterial.code, sharedCodesOf(deletedMaterial), stockSyncOptions(deletedMaterial.category, t.unit));
      }
      if (isOtherMaterialTicketType(t.type)) {
        // Phiếu Vật tư khác đã lãnh từng trừ ERP ở đúng bước nhập kho. Khi xóa phiếu,
        // hoàn cả hai vế (ERP + Hiện có), nếu không ERP sẽ hụt vĩnh viễn dù chứng từ mất.
        const shouldRestoreErp = !isOtherMaterialAdvanceTicket(t.type) || normalizeReceiptSource(t.receiptSource) === "ERP";
        if (shouldRestoreErp && t.receivedAt) {
          const restoreByCode = new Map<string, number>();
          for (const item of t.items) {
            if (!item.erpCode || !item.receivedQuantity) continue;
            restoreByCode.set(item.erpCode, (restoreByCode.get(item.erpCode) ?? 0) + item.receivedQuantity);
          }
          for (const [code, quantity] of restoreByCode) {
            await tx.erpMaterial.updateMany({ where: { code }, data: { erpStock: { increment: quantity } } });
          }
        }
        await tx.materialStockMovement.deleteMany({ where: { ticketId: t.id } });
      }
      // Gỡ các chuyến xe hóa chất phiếu này đã ghi sang sổ tồn kho. Bỏ qua bước này
      // thì sổ hóa chất còn lại những chuyến trỏ vào một phiếu không còn tồn tại —
      // đúng loại "số ma" mà đoạn hoàn kho phía trên sinh ra để tránh.
      // Chuyến vốn có từ nhật ký ngày chỉ bị THÁO liên kết, không bị xóa.
      if (t.chemicalReceiptIds.length > 0) {
        await unlinkTicketTrucks(tx, t.id, t.chemicalReceiptIds);
      }
      // Chỉ phiếu chưa hoàn tất mới phát lệnh xóa Sheet. Phiếu hoàn tất không
      // tạo tombstone nên dòng đã đồng bộ tiếp tục được giữ làm hồ sơ lịch sử.
      if (!preserveCompletedSheetRow && t.items.length > 0) {
        await tx.materialTicketSyncDeletion.createMany({
          data: t.items.map((item) => ({
            ticketId: t.id,
            syncKey: `${t.id}:${item.id}`,
          })),
          skipDuplicates: true,
        });
      }
      await tx.materialTicket.delete({ where: { id: t.id } });

      if (!preserveCompletedSheetRow) {
        // Chỉ dồn STT khi xóa phiếu dang dở. Khi xóa phiếu hoàn tất, giữ nguyên
        // STT của các phiếu còn lại để hồ sơ Sheet không bị thay đổi dây chuyền.
        await tx.$executeRaw`
          UPDATE "MaterialTicket"
          SET "sequenceNumber" = -"sequenceNumber"
          WHERE "sequenceMonth" = ${t.sequenceMonth} AND "sequenceScope" = ${t.sequenceScope}
        `;
        await tx.$executeRaw`
          WITH ranked AS (
            SELECT
              id,
              ROW_NUMBER() OVER (
                ORDER BY "sequenceNumber" DESC, "createdAt" ASC, id ASC
              )::INTEGER AS "nextSequenceNumber"
            FROM "MaterialTicket"
            WHERE "sequenceMonth" = ${t.sequenceMonth} AND "sequenceScope" = ${t.sequenceScope}
          )
          UPDATE "MaterialTicket" AS ticket
          SET
            "sequenceNumber" = ranked."nextSequenceNumber",
            "updatedAt" = CURRENT_TIMESTAMP
          FROM ranked
          WHERE ticket.id = ranked.id
        `;
      }
    });
    // Sau giao dịch, không phải trong: xóa tệp trên kho không hoàn tác được, mà giao
    // dịch thì có thể rollback — làm bên trong là có lúc phiếu còn nguyên nhưng ảnh mất.
    await deleteUsagePhotos([t.usagePhotoBeforeKey, t.usagePhotoAfterKey, t.usagePhotoSpecKey]);
    await audit(
      user.id,
      "MT_DELETE",
      "MaterialTicket",
      t.id,
      `${materialTicketReference(t)}: xóa phiếu${preserveCompletedSheetRow ? "; giữ hồ sơ trên Sheet" : ""}`,
    );
    return ok({
      id: t.id,
      sequenceNumber: t.sequenceNumber,
      sequenceMonth: t.sequenceMonth,
      sheetRowPreserved: preserveCompletedSheetRow,
    });
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
    // Từ Giai đoạn 2, số SYC không được nhập tay. Client cũ gọi action này phải bị chặn
    // rõ ràng thay vì lưu một số không có Defect/defectId đứng sau.
    if (action === "repairRequest") {
      return fail("Không còn hỗ trợ nhập tay số yêu cầu sửa chữa. Hãy dùng nút Ra SYC sửa chữa để tạo phiếu chính thức.", 409);
    }

    // Vật tư khác — luồng Ứng: lãnh trước khi có số ĐXVT. Đây là bước DUY NHẤT
    // được phép trừ ERP và cộng Hiện có; bước Thống kê phía sau chỉ hoàn thiện hồ sơ.
    if (action === "otherAdvanceReceive") {
      if (t.type !== OTHER_MATERIAL_ADVANCE_TICKET_TYPE || t.status !== "NHAN_VAT_TU") return fail("Phiếu không ở bước lãnh ứng Vật tư khác");
      if (!stepAllowedWithMap(await getWorkflowRoleMap(), "receive", user)) return fail("Bạn không có quyền xác nhận lãnh vật tư", 403);
      const receiptSource = normalizeReceiptSource(body.receiptSource);
      const deliveryNoteNumber = String(body.deliveryNoteNumber || "").trim() || null;
      const receivedAt = body.receivedAt ? parseDateInput(body.receivedAt) : new Date();
      if (Number.isNaN(receivedAt.getTime())) return fail("Ngày lãnh không hợp lệ");
      const rawItems = Array.isArray(body.items) ? body.items : [];
      const rowByItemId = new Map<string, { quantity: number; erpCode: string }>(rawItems.map((row: Record<string, unknown>) => [
        String(row.itemId || ""),
        { quantity: Math.trunc(Number(row.receivedQuantity || 0)), erpCode: String(row.erpCode || "").trim() },
      ]));
      if (t.items.some((item) => !Number.isFinite(rowByItemId.get(item.id)?.quantity) || (rowByItemId.get(item.id)?.quantity ?? 0) <= 0)) {
        return fail("Số lượng thực lãnh của mỗi vật tư phải lớn hơn 0");
      }

      const selectedCodeByItemId = new Map<string, string>();
      for (const item of t.items) {
        const allowedCodes = item.material.erpCodes.length ? item.material.erpCodes : [item.material.code];
        const requestedCode = rowByItemId.get(item.id)?.erpCode || (allowedCodes.length === 1 ? allowedCodes[0] : "");
        if (receiptSource === "ERP" && !requestedCode) return fail(`Vui lòng chọn mã ERP cho vật tư "${item.material.name}"`);
        if (requestedCode && !allowedCodes.includes(requestedCode)) return fail(`Mã ERP "${requestedCode}" không thuộc vật tư "${item.material.name}"`);
        if (requestedCode) selectedCodeByItemId.set(item.id, requestedCode);
      }

      const selectedCodes = [...new Set(selectedCodeByItemId.values())];
      const erpRows = selectedCodes.length
        ? await prisma.erpMaterial.findMany({ where: { code: { in: selectedCodes }, isActive: true }, select: { code: true, name: true } })
        : [];
      const erpByCode = new Map(erpRows.map((row) => [row.code, row]));
      for (const code of selectedCodes) if (!erpByCode.has(code)) return fail(`Không tìm thấy mã ERP "${code}"`, 404);
      const requestedByCode = new Map<string, number>();
      if (receiptSource === "ERP") {
        for (const item of t.items) {
          const code = selectedCodeByItemId.get(item.id)!;
          requestedByCode.set(code, (requestedByCode.get(code) ?? 0) + rowByItemId.get(item.id)!.quantity);
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "MaterialTicket" WHERE "id" = ${t.id} FOR UPDATE`;
        const current = await tx.materialTicket.findUnique({ where: { id: t.id }, select: { status: true } });
        if (current?.status !== "NHAN_VAT_TU") throw fail("Phiếu đã được người khác xác nhận lãnh trước đó", 409);

        for (const [code, quantity] of requestedByCode) {
          const result = await tx.erpMaterial.updateMany({
            where: { code, isActive: true, erpStock: { gte: quantity } },
            data: { erpStock: { decrement: quantity } },
          });
          if (result.count !== 1) throw fail(`Mã ERP "${code}" không đủ số lượng để lãnh ${quantity.toLocaleString("vi-VN")}`);
        }

        for (const item of t.items) {
          const row = rowByItemId.get(item.id)!;
          const erpCode = selectedCodeByItemId.get(item.id) || null;
          await receiveOtherMaterial(tx, {
            material: item.material,
            ticketId: t.id,
            ticketItemId: item.id,
            quantity: row.quantity,
            deliveryNote: deliveryNoteNumber,
            erpCode,
            occurredAt: receivedAt,
            assignedPosition: t.assignedPosition,
            unit: t.unit,
            deviceSeq: item.deviceSeq,
            actor: user,
            note: t.proposalNote,
          });
          await tx.materialTicketItem.update({
            where: { id: item.id },
            data: {
              quantity: row.quantity,
              receivedQuantity: row.quantity,
              erpCode,
              erpName: erpCode ? erpByCode.get(erpCode)?.name ?? null : null,
            },
          });
        }

        return tx.materialTicket.update({
          where: { id: t.id },
          data: {
            receiptSource,
            deliveryNoteNumber,
            receivedAt,
            receivedById: user.id,
            receivedByName: user.name ?? "",
            receivedByPosition: user.position ?? null,
            status: "CHO_THONG_KE",
          },
          include: ITEM_INCLUDE,
        });
      });
      await audit(user.id, "MT_OTHER_ADVANCE_RECEIVE", "MaterialTicket", t.id,
        `${materialTicketReference(t)}: lãnh ứng ${t.items.length} vật tư từ ${receiptSourceLabel(receiptSource)}; đã cộng Hiện có`);
      return ok(updated);
    }

    // Vật tư khác — luồng Ứng: Thống kê bổ sung ĐXVT/chứng từ sau khi hàng đã vào kho.
    // Tuyệt đối không gọi receiveOtherMaterial và không trừ ERP ở bước này.
    if (action === "otherAdvanceApprove") {
      if (t.type !== OTHER_MATERIAL_ADVANCE_TICKET_TYPE || t.status !== "CHO_THONG_KE" || !t.receivedAt) return fail("Phiếu không ở bước hoàn thiện ĐXVT cho vật tư ứng");
      if (!stepAllowedWithMap(await getWorkflowRoleMap(), "stats", user)) return fail("Bạn không có quyền Thống kê hoàn thiện đề xuất vật tư", 403);
      const proposalNumber = String(body.proposalNumber || "").trim();
      const deliveryNoteNumber = String(body.deliveryNoteNumber || t.deliveryNoteNumber || "").trim();
      if (!proposalNumber) return fail("Vui lòng nhập số phiếu đề xuất vật tư");
      if (!deliveryNoteNumber) return fail("Vui lòng nhập số phiếu giao hàng");
      const rawItems = Array.isArray(body.items) ? body.items : [];
      const requestedCodeByItemId = new Map<string, string>(rawItems.map((row: Record<string, unknown>) => [String(row.itemId || ""), String(row.erpCode || "").trim()]));
      const codeByItemId = new Map<string, string>();
      for (const item of t.items) {
        const allowedCodes = item.material.erpCodes.length ? item.material.erpCodes : [item.material.code];
        const code = requestedCodeByItemId.get(item.id) || item.erpCode || (allowedCodes.length === 1 ? allowedCodes[0] : "");
        if (!code) return fail(`Vui lòng chọn mã ERP cho vật tư "${item.material.name}"`);
        if (!allowedCodes.includes(code)) return fail(`Mã ERP "${code}" không thuộc vật tư "${item.material.name}"`);
        if (normalizeReceiptSource(t.receiptSource) === "ERP" && item.erpCode && code !== item.erpCode) {
          return fail(`Không thể đổi mã ERP của vật tư "${item.material.name}" vì mã này đã được trừ khi lãnh ứng`);
        }
        codeByItemId.set(item.id, code);
      }
      const codes = [...new Set(codeByItemId.values())];
      const erpRows = await prisma.erpMaterial.findMany({ where: { code: { in: codes }, isActive: true }, select: { code: true, name: true } });
      const erpByCode = new Map(erpRows.map((row) => [row.code, row]));
      for (const code of codes) if (!erpByCode.has(code)) return fail(`Không tìm thấy mã ERP "${code}"`, 404);
      const overrides = new Map(t.items.map((item) => {
        const code = codeByItemId.get(item.id)!;
        return [item.id, { materialCode: code, materialName: erpByCode.get(code)!.name }] as const;
      }));
      const proposalDoc = await buildProposalDocument(t, user, overrides);
      const completedAt = new Date();
      const updated = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "MaterialTicket" WHERE "id" = ${t.id} FOR UPDATE`;
        const current = await tx.materialTicket.findUnique({ where: { id: t.id }, select: { status: true } });
        if (current?.status !== "CHO_THONG_KE") throw fail("Phiếu đã được người khác hoàn thiện trước đó", 409);
        for (const item of t.items) {
          const code = codeByItemId.get(item.id)!;
          const erpName = erpByCode.get(code)!.name;
          await tx.materialTicketItem.update({ where: { id: item.id }, data: { erpCode: code, erpName } });
          await tx.materialStockLot.updateMany({ where: { ticketId: t.id, materialCode: item.material.code }, data: { erpCode: code, deliveryNote: deliveryNoteNumber } });
          await tx.materialStockMovement.updateMany({ where: { ticketId: t.id, ticketItemId: item.id, type: "RECEIPT" }, data: { erpCodes: [code] } });
        }
        return tx.materialTicket.update({
          where: { id: t.id },
          data: {
            proposalNumber,
            proposalDocUrl: proposalDoc.url,
            proposalIssuedAt: completedAt,
            deliveryNoteNumber,
            statsById: user.id,
            statsByName: user.name ?? "",
            statsByPosition: user.position ?? null,
            statsAt: completedAt,
            completedAt,
            completedById: user.id,
            completedByName: user.name ?? "",
            completedByPosition: user.position ?? null,
            status: "HOAN_TAT",
          },
          include: ITEM_INCLUDE,
        });
      });
      await audit(user.id, "MT_OTHER_ADVANCE_APPROVE", "MaterialTicket", t.id,
        `${materialTicketReference(t)}: hoàn thiện ĐXVT ${proposalNumber}, phiếu giao hàng ${deliveryNoteNumber}; không thay đổi tồn kho`);
      return ok(updated);
    }

    // Phiếu Vật tư khác: Thống kê đối chiếu mã ERP cho từng dòng và cấp số ĐXVT.
    // Đây là luồng riêng để phiếu cũ (kể cả Chai khí) giữ nguyên trạng thái/lịch sử.
    if (action === "otherApprove") {
      if (t.type !== OTHER_MATERIAL_TICKET_TYPE || t.status !== "CHO_THONG_KE") return fail("Phiếu không ở bước xác nhận đề xuất Vật tư khác");
      if (!stepAllowedWithMap(await getWorkflowRoleMap(), "stats", user)) return fail("Bạn không có quyền Thống kê xác nhận đề xuất vật tư", 403);
      const proposalNumber = String(body.proposalNumber || "").trim();
      if (!proposalNumber) return fail("Vui lòng nhập số phiếu đề xuất vật tư");
      const rawItems = Array.isArray(body.items) ? body.items : [];
      const codeByItemId = new Map<string, string>(rawItems.map((row: Record<string, unknown>) => [String(row.itemId || ""), String(row.erpCode || "").trim()] as [string, string]));
      for (const item of t.items) {
        const allowedCodes = item.material.erpCodes.length ? item.material.erpCodes : [item.material.code];
        if (!codeByItemId.get(item.id) && allowedCodes.length === 1) codeByItemId.set(item.id, allowedCodes[0]);
      }
      if (t.items.some((item) => !codeByItemId.get(item.id))) return fail("Vui lòng chọn mã ERP cho vật tư có nhiều mã");
      const requestedCodes = [...new Set(t.items.map((item) => codeByItemId.get(item.id)!))];
      const erpRows = await prisma.erpMaterial.findMany({ where: { code: { in: requestedCodes }, isActive: true }, select: { code: true, name: true, erpStock: true } });
      const erpByCode = new Map(erpRows.map((row) => [row.code, row]));
      const overrides = new Map<string, { materialCode: string; materialName: string }>();
      const proposedByCode = new Map<string, number>();
      for (const item of t.items) {
        const code = codeByItemId.get(item.id)!;
        const allowedCodes = item.material.erpCodes.length ? item.material.erpCodes : [item.material.code];
        if (!allowedCodes.includes(code)) return fail(`Mã ERP "${code}" không thuộc vật tư "${item.material.name}"`);
        const erp = erpByCode.get(code);
        if (!erp) return fail(`Không tìm thấy mã ERP "${code}"`, 404);
        proposedByCode.set(code, (proposedByCode.get(code) ?? 0) + item.quantity);
        overrides.set(item.id, { materialCode: code, materialName: erp.name });
      }
      for (const [code, quantity] of proposedByCode) {
        const stock = erpByCode.get(code)!.erpStock;
        if (stock < quantity) return fail(`Mã ERP "${code}" chỉ còn ${stock.toLocaleString("vi-VN")}, không đủ tổng số lượng đề xuất ${quantity.toLocaleString("vi-VN")}`);
      }
      const proposalDoc = await buildProposalDocument(t, user, overrides);
      const updated = await prisma.$transaction(async (tx) => {
        for (const item of t.items) {
          const override = overrides.get(item.id)!;
          await tx.materialTicketItem.update({ where: { id: item.id }, data: { erpCode: override.materialCode, erpName: override.materialName } });
        }
        return tx.materialTicket.update({
          where: { id: t.id },
          data: {
            proposalNumber,
            proposalDocUrl: proposalDoc.url,
            proposalIssuedAt: new Date(),
            statsById: user.id,
            statsByName: user.name ?? "",
            statsByPosition: user.position ?? null,
            statsAt: new Date(),
            status: "NHAN_VAT_TU",
          },
          include: ITEM_INCLUDE,
        });
      });
      await audit(user.id, "MT_OTHER_APPROVE", "MaterialTicket", t.id, `${materialTicketReference(t)}: xác nhận ${t.items.length} mã ERP, số phiếu ${proposalNumber}`);
      return ok(updated);
    }

    // Khi đi lãnh về: nhập số thực lãnh của từng dòng, trừ ERP, cộng Hiện có và
    // ghi sổ nhập kho trong cùng một transaction; hoàn tất phiếu ngay sau bước này.
    if (action === "otherReceive") {
      if (t.type !== OTHER_MATERIAL_TICKET_TYPE || t.status !== "NHAN_VAT_TU") return fail("Phiếu không ở bước lãnh Vật tư khác");
      if (!stepAllowedWithMap(await getWorkflowRoleMap(), "receive", user)) return fail("Bạn không có quyền xác nhận lãnh vật tư", 403);
      const deliveryNoteNumber = String(body.deliveryNoteNumber || "").trim();
      if (!deliveryNoteNumber) return fail("Vui lòng nhập số phiếu giao hàng");
      const receivedAt = body.receivedAt ? parseDateInput(body.receivedAt) : new Date();
      if (Number.isNaN(receivedAt.getTime())) return fail("Ngày lãnh không hợp lệ");
      const rawItems = Array.isArray(body.items) ? body.items : [];
      const quantityByItemId = new Map<string, number>(rawItems.map((row: Record<string, unknown>) => [String(row.itemId || ""), Math.trunc(Number(row.receivedQuantity || 0))] as [string, number]));
      if (t.items.some((item) => !Number.isFinite(quantityByItemId.get(item.id)) || (quantityByItemId.get(item.id) ?? 0) <= 0)) {
        return fail("Số lượng thực lãnh của mỗi vật tư phải lớn hơn 0");
      }
      const requestedByCode = new Map<string, number>();
      for (const item of t.items) {
        if (!item.erpCode) return fail(`Vật tư "${item.material.name}" chưa được xác nhận mã ERP`);
        requestedByCode.set(item.erpCode, (requestedByCode.get(item.erpCode) ?? 0) + quantityByItemId.get(item.id)!);
      }
      const erpRows = await prisma.erpMaterial.findMany({ where: { code: { in: [...requestedByCode.keys()] } }, select: { code: true, erpStock: true } });
      const erpStockByCode = new Map(erpRows.map((row) => [row.code, row.erpStock]));
      for (const [code, quantity] of requestedByCode) {
        const stock = erpStockByCode.get(code);
        if (stock == null) return fail(`Không tìm thấy mã ERP "${code}"`, 404);
        if (quantity > stock) return fail(`Mã ERP "${code}" chỉ còn ${stock.toLocaleString("vi-VN")}, không đủ số lượng thực lãnh ${quantity.toLocaleString("vi-VN")}`);
      }
      const updated = await prisma.$transaction(async (tx) => {
        for (const [code, quantity] of requestedByCode) {
          await tx.erpMaterial.update({ where: { code }, data: { erpStock: { decrement: quantity } } });
        }
        for (const item of t.items) {
          const quantity = quantityByItemId.get(item.id)!;
          await receiveOtherMaterial(tx, {
            material: item.material,
            ticketId: t.id,
            ticketItemId: item.id,
            quantity,
            deliveryNote: deliveryNoteNumber,
            erpCode: item.erpCode,
            occurredAt: receivedAt,
            assignedPosition: t.assignedPosition,
            unit: t.unit,
            deviceSeq: item.deviceSeq,
            actor: user,
            note: t.proposalNote,
          });
          await tx.materialTicketItem.update({ where: { id: item.id }, data: { receivedQuantity: quantity } });
        }
        return tx.materialTicket.update({
          where: { id: t.id },
          data: {
            deliveryNoteNumber,
            receivedAt,
            receivedById: user.id,
            receivedByName: user.name ?? "",
            receivedByPosition: user.position ?? null,
            completedAt: new Date(),
            completedById: user.id,
            completedByName: user.name ?? "",
            completedByPosition: user.position ?? null,
            status: "HOAN_TAT",
          },
          include: ITEM_INCLUDE,
        });
      });
      await audit(user.id, "MT_OTHER_RECEIVE", "MaterialTicket", t.id, `${materialTicketReference(t)}: lãnh ${t.items.length} vật tư, phiếu giao hàng ${deliveryNoteNumber}; đã cộng Hiện có`);
      return ok(updated);
    }

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
      if (assignedPosition !== COMMON_MATERIAL_POSITION && totalScopeCount > 0 && scopeCount === 0 && !isMaterialTicketExtraAssignedPosition(assignedPosition)) {
        return fail(`Cương vị "${assignedPosition}" chưa được phân giao hệ thống thiết bị`);
      }
      const materialCategory = String(body.materialCategory || "").trim();
      if (!(TICKET_MATERIAL_CATEGORIES as readonly string[]).includes(materialCategory)) return fail("Vui lòng chọn loại vật tư");
      // KHÔNG đụng tới `bbktNumber` ở đây. Số BBKT nhập một lần ở bước chọn luồng và chỉ
      // sửa qua "Xem lại" bước đó. Nếu vẫn ghi tại đây, mỗi lần Sửa phiếu mà thân yêu cầu
      // không mang số cũ là cột bị đặt về null — xóa mất số đã nhập mà không ai hay.
      const data: {
        unit: string;
        assignedPosition: string;
        materialCategory: string;
        proposalNote?: string | null;
        recoveryRequired?: boolean;
        recoveryQuantity?: number | null;
        recoveryReturnedAt?: Date | null;
      } = { unit, assignedPosition, materialCategory };
      let editedItemData: {
        materialId: string;
        erpCode: string | null;
        quantity: number;
        deviceSeq: string | null;
        replacementPointKeys: string[];
        deviceNameManual: string | null;
      } | null = null;
      // Điểm thay thế sau khi sửa — dùng để đặt lại bảng nối. Đổi danh sách thiết bị ở đây thì
      // liên kết cũ phải biến mất chứ không cộng dồn.
      let editedReplacementPoints: LinkablePoint[] = [];

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
          select: { id: true, deviceSeq: true, location: true, system: true, managingPosition: true, recoveryOnSupplement: true, quantity: true, deviceCount: true, device: { select: { name: true } } },
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
        editedReplacementPoints = validReplacementPoints;
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
          await syncTicketReplacementLinks(tx, t.id, editedReplacementPoints);
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
      } else if (step === "stats" && t.type === CHEMICAL_TICKET_TYPE) {
        // Bước cùng tên nhưng KHÁC NỘI DUNG ở luồng hóa chất: chốt lịch giao hàng và
        // khối lượng giao, không có phiếu ĐXVT nào để nhập số. Trước đây dùng chung
        // nhánh dưới nên hộp Xem lại của hóa chất hỏi số phiếu ĐXVT và tên VHV nhận
        // phiếu — hai ô không tồn tại trong luồng này.
        if (!t.statsAt) return fail("Bước xác nhận đề xuất chưa hoàn thành");
        const ngay = new Date(String(body.deliveryScheduledAt || ""));
        if (Number.isNaN(ngay.getTime())) return fail("Lịch giao hàng không hợp lệ");
        const khoiLuong = Math.trunc(Number(body.deliveryQuantity));
        if (!Number.isFinite(khoiLuong) || khoiLuong <= 0) return fail("Khối lượng giao phải lớn hơn 0");
        const dvt = t.items[0]?.material.unit ?? "";
        const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");
        before = `Lịch giao: ${fmt(t.deliveryScheduledAt)}; Khối lượng giao: ${t.deliveryQuantity ?? "—"} ${dvt}`.trim();
        after = `Lịch giao: ${fmt(ngay)}; Khối lượng giao: ${khoiLuong} ${dvt}`.trim();
        up = await prisma.materialTicket.update({
          where: { id: t.id },
          data: { deliveryScheduledAt: ngay, deliveryQuantity: khoiLuong },
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
      } else if (step === "receive" && isChemicalSequenceTicket(t.type)) {
        /*
         * HÓA CHẤT — sửa lại khối lượng lãnh mà KHÔNG đụng tồn kho lẫn ERP.
         *
         * Hóa chất do nhà thầu giao thẳng theo hợp đồng, không đi qua kho DH1: phiếu chỉ
         * GHI NHẬN khối lượng đề xuất và khối lượng nhập. Bước xác nhận lãnh (action
         * "receive") đã đúng như vậy từ đầu, nhưng hộp Xem lại của chính bước đó lại rơi
         * vào nhánh chung bên dưới — sửa số một lần là cộng khống vào tồn kho phân xưởng
         * và trừ khống tồn ERP của một mã chưa từng xuất kho.
         *
         * Cũng không đòi số phiếu giao hàng: luồng này không phát sinh phiếu nào.
         */
        if (!t.receivedAt || t.receivedQuantity == null) return fail("Bước xác nhận khối lượng lãnh chưa hoàn thành");
        const value = Math.trunc(Number(body.receivedQuantity));
        if (!Number.isFinite(value) || value <= 0) return fail("Khối lượng lãnh phải lớn hơn 0");
        const dvt = t.items[0]?.material.unit ?? "";
        before = `Khối lượng lãnh: ${t.receivedQuantity} ${dvt}`.trim();
        after = `Khối lượng lãnh: ${value} ${dvt}`.trim();
        up = await prisma.materialTicket.update({
          where: { id: t.id },
          data: { receivedQuantity: value },
          include: ITEM_INCLUDE,
        });
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
        // Sửa lại bước nhận cũng là chỗ chụp lại tờ liên 3 khi ảnh cũ mờ hoặc nhầm phiếu.
        // Không gửi ảnh mới thì giữ nguyên ảnh cũ — bắt buộc đã chặn từ lúc xác nhận.
        const replacementPhotoDataUrl = String(body.deliveryPhotoDataUrl || "").trim();
        const editedLot = await prisma.materialStockLot.findFirst({
          where: { ticketId: t.id },
          select: { id: true, deliveryPhotoKey: true },
        });
        const replacementPhoto = replacementPhotoDataUrl
          ? await uploadDeliveryPhoto(t.id, replacementPhotoDataUrl)
          : null;
        up = await prisma.$transaction(async (tx) => {
          if (delta || method !== (t.deliveryNoteNumber ?? "")) {
            try {
              await receiveIntoLot(tx, {
                materialCode: item.material.code, stockUnit: lotStockUnit(item.material.category, t.unit), quantity: delta, ticketId: t.id,
                deliveryNote: method, erpCode,
              });
            } catch (error) {
              throw fail((error as Error).message);
            }
            await syncMaterialQuantity(tx, item.material.code, sharedCodesOf(item.material), stockSyncOptions(item.material.category, t.unit));
          }
          if (replacementPhoto) {
            const lotId = editedLot?.id
              ?? (await tx.materialStockLot.findFirst({ where: { ticketId: t.id }, select: { id: true } }))?.id;
            if (lotId) {
              await tx.materialStockLot.update({
                where: { id: lotId },
                data: {
                  deliveryPhotoKey: replacementPhoto.key,
                  deliveryPhotoAt: new Date(),
                  deliveryPhotoByName: user.name ?? "",
                },
              });
            }
          }
          if (erpDelta) await tx.$executeRaw`UPDATE "ErpMaterial" SET "erpStock" = "erpStock" + ${erpDelta}, "updatedAt" = NOW() WHERE "code" = ${erpCode}`;
          return tx.materialTicket.update({ where: { id: t.id }, data: { receivedQuantity: value, receivedMethod: method || null, deliveryNoteNumber: method || null, receiptSource, remainingQuantity: value - (t.usedQuantity ?? 0) }, include: ITEM_INCLUDE });
        });
        if (replacementPhoto && editedLot?.deliveryPhotoKey) await deleteDeliveryPhotos([editedLot.deliveryPhotoKey]);
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
        // Sửa lại bước này cũng phải giữ đủ ảnh — gỡ bớt còn 1 ảnh rồi lưu là lách rào.
        if (countUsagePhotos(t) < MIN_USAGE_PHOTOS) return fail(MISSING_USAGE_PHOTO_MESSAGE);
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
              await consumeStock(tx, { materialCode: item.material.code, stockUnit: lotStockUnit(item.material.category, t.unit), ticketId: t.id, quantity: value });
            } catch (error) {
              throw fail((error as Error).message);
            }
            await syncMaterialQuantity(tx, item.material.code, sharedCodesOf(item.material), stockSyncOptions(item.material.category, t.unit));
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
              // Biên bản thu hồi chỉ được sinh ở bước Nghiệm thu.
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
        const pctNoiDung = String(body.pctContent ?? t.pctContent ?? "").trim();
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
        // BBNT ký tay chỉ còn cho bi nghiền; loại khác sửa bước này không sinh file nào.
        const bbktDoc = usesHandwrittenBbnt(t.materialCategory)
          ? await generateBbntDoc({
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
            })
          : null;
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
            pctContent: pctNoiDung || null,
            pctNumber: pct,
            chiHuyName: chiHuy,
            completionNote: note,
            workStartedAt,
            workEndedAt,
            ...(bbktDoc ? { bbktDocUrl: bbktDoc.url } : {}),
            ...(bbntDo ? { docUrl: bbntDo.url } : {}),
            ...(recoveryDoc ? { recoveryDocUrl: recoveryDoc.url } : {}),
          },
          include: ITEM_INCLUDE,
        });
      }
      if (!up) return fail("Không thể cập nhật bước");
      // Bước accept đã tự xuất lại BBNT D-Office và biên bản thu hồi ở trên.
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

    // Ghi chuyến xe hóa chất là ngoại lệ DUY NHẤT được thao tác trên phiếu đã hoàn tất:
    // xe về rải rác vài ngày sau khi lãnh, và phiếu cũ (trước khi có bước này) đã ở
    // trạng thái HOÀN TẤT sẵn — chặn ở đây thì không bao giờ bổ sung được chuyến xe.
    if (["HOAN_TAT", "TU_CHOI"].includes(t.status) && action !== "chemicalTrucks") {
      return fail("Phiếu đã khóa, không thể thao tác");
    }

    /**
     * Neo SYC vừa ra vào phiếu vật tư.
     *
     * Phiếu khiếm khuyết do chính DefectForm tạo (dùng lại nguyên đường của màn Khiếm khuyết,
     * kể cả việc đẩy Google Sheet); ở đây chỉ ghi lại mối liên hệ. `repairRequestNumber` giữ
     * làm SNAPSHOT số hiệu vì phiếu khiếm khuyết có thể bị xoá, còn số đã in trên chứng từ
     * thì không được biến mất theo.
     */
    if (action === "linkDefect") {
      const defectId = String(body.defectId || "").trim();
      if (!defectId) return fail("Thiếu số yêu cầu cần gắn");

      if (!["DE_XUAT", "UNG", "SU_DUNG_HIEN_CO"].includes(t.type)) {
        return fail("Loại phiếu này không hỗ trợ ra SYC thay thế vật tư", 409);
      }
      if (isGasCylinderTicket(t.materialCategory)) {
        return fail("Phiếu Chai khí không phát sinh SYC sửa chữa", 409);
      }

      // Quyền phải khớp đúng cửa xác nhận vật tư lãnh của từng luồng. Đây là bước tạo
      // hồ sơ sửa chữa thật, không thể chỉ dựa vào việc người dùng nhìn thấy phiếu.
      const wfMap = await getWorkflowRoleMap();
      if (t.type === "UNG") {
        if (wfMap.vhvReceive.length > 0) {
          if (!stepAllowedWithMap(wfMap, "vhvReceive", user)) {
            return fail("Bạn không có quyền ra SYC tại bước VHV lãnh vật tư", 403);
          }
        } else {
          const err = assignedPositionError(user, t);
          if (err) return err;
        }
      } else {
        if (!stepAllowedWithMap(wfMap, "receive", user)) {
          return fail("Bạn không có quyền ra SYC tại bước xác nhận vật tư lãnh", 403);
        }
        const err = assignedPositionError(user, t);
        if (err) return err;
      }

      if (!t.receivedAt && !t.vhvReceivedAt) {
        return fail("Chỉ được ra SYC sau khi vật tư lãnh đã được xác nhận", 409);
      }

      const [defect, ticketLinks] = await Promise.all([
        prisma.defect.findUnique({
          where: { id: defectId },
          select: {
            id: true,
            requestNumber: true,
            isMaterialRequest: true,
            cancelledAt: true,
            materialRequests: { select: { replacementId: true } },
          },
        }),
        prisma.materialTicketReplacement.findMany({
          where: { ticketId: t.id },
          select: { replacementId: true },
        }),
      ]);
      if (!defect) return fail("Không tìm thấy số yêu cầu", 404);
      if (defect.cancelledAt) return fail("Số yêu cầu này đã bị hủy, không thể gắn vào phiếu", 409);
      if (!defect.isMaterialRequest) {
        return fail("Số yêu cầu không phải hồ sơ thay thế vật tư của phiếu", 409);
      }
      if (!defect.requestNumber?.trim()) {
        return fail("Số yêu cầu chưa được cấp số, chưa thể gắn vào phiếu", 409);
      }
      if (ticketLinks.length === 0) {
        return fail("Phiếu chưa gắn điểm thay thế nên không thể neo SYC", 409);
      }

      // Một SYC có thể gom nhiều phiếu, nhưng phải chứa ĐỦ mọi điểm của từng phiếu được
      // neo vào nó. Không so chuỗi thiết bị vì hai kỳ thay trên cùng thiết bị là hai hồ sơ khác.
      const defectPointIds = new Set(
        defect.materialRequests
          .map((row) => row.replacementId)
          .filter((id): id is string => Boolean(id))
      );
      const missingPoint = ticketLinks.find((link) => !defectPointIds.has(link.replacementId));
      if (missingPoint) {
        return fail("Số yêu cầu không chứa đầy đủ các điểm thay thế của phiếu vật tư", 409);
      }

      if (t.defectId && t.defectId !== defect.id) {
        return fail(`Phiếu đã gắn SYC ${t.repairRequestNumber || t.defectId}; không được ghi đè liên kết cũ`, 409);
      }
      if (!t.defectId && t.repairRequestNumber) {
        return fail(`Phiếu đang giữ số SYC cũ ${t.repairRequestNumber} nhưng thiếu liên kết Defect; cần quản trị rà soát trước khi gắn lại`, 409);
      }

      const transitionAfterLink = t.type === "DE_XUAT" && t.status === "CHO_PHIEU_YCSC"
        ? { status: "SU_DUNG_VAT_TU" }
        : {};

      // Gọi lại cùng Defect là idempotent (Defect POST có thể đã tự neo trước callback của
      // client). Trường hợp này vẫn chữa luôn phiếu Đề xuất cũ còn mắc ở CHO_PHIEU_YCSC.
      if (t.defectId === defect.id) {
        const up = await prisma.materialTicket.update({
          where: { id: t.id },
          data: {
            repairRequestNumber: t.repairRequestNumber ?? defect.requestNumber,
            ...transitionAfterLink,
          },
          include: ITEM_INCLUDE,
        });
        return ok(up);
      }

      // Điều kiện trong UPDATE là hàng rào chống hai yêu cầu đồng thời ghi đè nhau sau khi
      // các bước kiểm tra phía trên đã chạy.
      const claimed = await prisma.materialTicket.updateMany({
        where: { id: t.id, defectId: null, repairRequestNumber: null },
        data: {
          defectId: defect.id,
          repairRequestNumber: defect.requestNumber,
          ...transitionAfterLink,
        },
      });
      if (claimed.count === 0) {
        const current = await prisma.materialTicket.findUnique({ where: { id: t.id }, include: ITEM_INCLUDE });
        if (current?.defectId === defect.id) return ok(current);
        return fail("Phiếu vừa được gắn với một SYC khác; dữ liệu mới không được ghi đè", 409);
      }
      const up = await prisma.materialTicket.findUnique({ where: { id: t.id }, include: ITEM_INCLUDE });
      if (!up) return fail("Không tìm thấy phiếu sau khi gắn SYC", 404);
      await audit(user.id, "MT_LINK_DEFECT", "MaterialTicket", t.id,
        `${materialTicketReference(t)}: gắn số yêu cầu sửa chữa ${defect.requestNumber}`);
      return ok(up);
    }

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
    // Mã vật tư nhập tay (nếu có) được bổ sung tại bước Nghiệm thu.
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
      if (String(body.repairRequestNumber || "").trim()) {
        return fail("Không nhập số yêu cầu sửa chữa tại bước VHV lãnh vật tư. Hãy dùng nút Ra SYC sửa chữa để tạo phiếu chính thức.", 409);
      }
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
            vhvReceivedByName: vhvReceivedByName || user.name || "",
            vhvReceivedByPosition: user.position ?? null,
            vhvReceivedAt: new Date(),
          },
        });
        if (claimed.count === 0) return null;
        // Lô của phiếu Ứng: tạo trước, số phiếu giao hàng điền sau ở bước Thống kê xác nhận.
        await receiveIntoLot(tx, {
          materialCode: item.material.code,
          stockUnit: lotStockUnit(item.material.category, t.unit),
          quantity,
          ticketId: t.id,
          erpCode: item.erpCode,
        });
        await syncMaterialQuantity(tx, item.material.code, sharedCodes, stockSyncOptions(item.material.category, t.unit));
        return tx.materialTicket.findUnique({ where: { id: t.id }, include: ITEM_INCLUDE });
      });
      if (!up) return fail("Bước VHV lãnh vật tư đã được xác nhận trước đó");
      await audit(user.id, "MT_VHV_RECEIVE", "MaterialTicket", t.id, `${materialTicketReference(t)}: VHV lãnh ${quantity}${vhvReceivedByName ? ` — ${vhvReceivedByName}` : ""}; Hiện có ${item.material.quantity} → ${item.material.quantity + quantity}; ERP không đổi`);
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
    /**
     * Ghi các chuyến xe hóa chất cho một phiếu ĐÃ HOÀN TẤT.
     *
     * Dành cho phiếu NH3 (khai một bước — tạo xong là HOÀN TẤT) và cho việc bổ sung
     * / sửa lại danh sách xe của phiếu hóa chất sau khi đã lãnh. Xe về rải rác vài
     * ngày sau khi đề xuất nên không thể bắt phiếu chờ mới cho ghi.
     *
     * Lượng đề xuất trên phiếu chỉ là số tham khảo — CỐ Ý không so với lượng nhập.
     */
    if (action === "chemicalTrucks") {
      if (!isChemicalSequenceTicket(t.type)) {
        return fail("Chỉ phiếu hóa chất mới ghi được chuyến xe nhập");
      }
      const assigned = samePosition(user.position, t.assignedPosition);
      if (!assigned && user.role !== "ADMIN") {
        return fail("Chỉ VHV được giao phiếu mới ghi được chuyến xe nhập", 403);
      }

      /**
       * Lưu xong là CHỐT, KHÓA HẲN — kể cả quản trị.
       *
       * Số liệu đã chạy sang sổ Tồn kho hóa chất, và sổ mới là nơi duy nhất được sửa
       * (nhật ký NH3 và tab Phiếu nhập). Để hai cửa cùng sửa được một con số là mời
       * hai người ghi đè lẫn nhau, mà sổ mới là bên có ràng buộc kỳ, chống trùng và
       * tính lại tồn cuối tháng.
       *
       * Rào ở đây chứ không chỉ ở giao diện: bảng xe gọi thẳng API này, ẩn nút mà để
       * ngỏ máy chủ thì chưa gọi là khóa.
       */
      if (t.chemicalReceiptIds.length > 0) {
        return fail(
          "Chuyến xe của phiếu này đã chốt. Sửa hoặc xóa tại Tịnh kho hóa chất — nhật ký NH3 hoặc tab Phiếu nhập.",
          409
        );
      }

      const trucks = Array.isArray(body.trucks) ? (body.trucks as TruckInput[]) : [];

      // Gửi mảng rỗng = gỡ hết chuyến xe của phiếu.
      if (trucks.length === 0) {
        const removed = await prisma.$transaction((tx) => unlinkTicketTrucks(tx, t.id, t.chemicalReceiptIds));
        await audit(user.id, "MT_CHEMICAL_TRUCKS", "MaterialTicket", t.id,
          `${materialTicketReference(t)}: gỡ toàn bộ chuyến xe khỏi sổ hóa chất (${removed} dòng bị xóa)`);
        return ok(await getTicket(t.id));
      }

      const linkResult = await prisma.$transaction(async (tx) =>
        linkTicketTrucks(
          tx,
          { id: t.id, assignedPosition: t.assignedPosition, chemicalReceiptIds: t.chemicalReceiptIds, items: t.items },
          trucks,
          { userId: user.id, chemicalItemId: String(body.chemicalItemId || "") || null }
        )
      );

      // Ngày nhập của phiếu = ngày muộn nhất trong các chuyến xe.
      const latestTruckDate = trucks
        .map((truck) => parseDateInput(truck.receivedAt))
        .filter((d): d is Date => Boolean(d) && !Number.isNaN(d.getTime()))
        .sort((a, b) => b.getTime() - a.getTime())[0];

      // Phiếu NH3: đề xuất chỉ hoàn tất KHI ĐÃ ghi khối lượng nhập, biển số và ngày nhập.
      // Trước đây phiếu hoàn tất ngay lúc lập, nên không có chỗ nào ghi lại hàng thực về.
      const completesNow = t.type === "GHI_NHAN" && t.status !== "HOAN_TAT";

      // Cột receivedQuantity là Int và chỉ để hiển thị nhanh trên phiếu; con số chính
      // xác tới 4 số lẻ nằm ở ChemicalReceipt.
      await prisma.materialTicket.update({
        where: { id: t.id },
        data: {
          receivedQuantity: Math.round(linkResult.totalAccepted),
          receivedAt: latestTruckDate ?? t.receivedAt,
          ...(completesNow
            ? {
                status: "HOAN_TAT",
                receivedById: user.id,
                receivedByName: user.name ?? null,
                receivedByPosition: user.position ?? null,
                completedAt: new Date(),
                completedById: user.id,
                completedByName: user.name ?? null,
                completedByPosition: user.position ?? null,
              }
            : {}),
        },
      });

      await audit(user.id, "MT_CHEMICAL_TRUCKS", "MaterialTicket", t.id,
        `${materialTicketReference(t)}: ghi ${linkResult.receiptIds.length} chuyến xe, tổng ${linkResult.totalAccepted} ` +
        `(${linkResult.created} mới, ${linkResult.linked} gắn vào bản ghi có sẵn)` +
        (completesNow ? "; hoàn tất phiếu" : ""));

      return ok({ ...(await getTicket(t.id)), chemicalLink: linkResult });
    }

    if (action === "receive") {
      // LUỒNG HÓA CHẤT — bước 3 (cuối): VHV điền khối lượng lãnh, ngày lãnh, người lãnh.
      // Xong là HOÀN TẤT, không qua sử dụng — nghiệm thu — quyết toán.
      if (t.type === CHEMICAL_TICKET_TYPE) {
        if (t.status !== "NHAN_VAT_TU") return fail("Phiếu không ở bước xác nhận khối lượng lãnh");
        const assigned = samePosition(user.position, t.assignedPosition);
        if (!assigned && user.role !== "ADMIN") {
          return fail("Chỉ VHV được giao phiếu mới xác nhận khối lượng lãnh", 403);
        }
        const receivedByName = String(body.receivedByName || "").trim();
        if (!receivedByName) return fail("Vui lòng nhập tên VHV lãnh");

        // Hóa chất về theo ĐỢT NHIỀU XE (đề xuất định kỳ 2–3 ngày một lần), nên bước
        // này nhận một BẢNG chuyến xe chứ không phải ba ô đơn. Mỗi chuyến có ngày,
        // biển số và hai số cân riêng; khối lượng lãnh của phiếu là TỔNG các chuyến.
        //
        // KHÔNG so lượng đề xuất với lượng nhập: lượng đề xuất chỉ là số tham khảo.
        const trucks = Array.isArray(body.trucks) ? (body.trucks as TruckInput[]) : null;

        if (trucks && trucks.length > 0) {
          const linkResult = await prisma.$transaction(async (tx) =>
            linkTicketTrucks(
              tx,
              { id: t.id, assignedPosition: t.assignedPosition, chemicalReceiptIds: t.chemicalReceiptIds, items: t.items },
              trucks,
              { userId: user.id, chemicalItemId: String(body.chemicalItemId || "") || null }
            )
          );

          const receivedAtFromTrucks = trucks
            .map((truck) => parseDateInput(truck.receivedAt))
            .filter((d): d is Date => Boolean(d) && !Number.isNaN(d.getTime()))
            .sort((a, b) => b.getTime() - a.getTime())[0];

          const updated = await prisma.materialTicket.update({
            where: { id: t.id },
            data: {
              // Cột cũ là Int; khối lượng chính xác tới 4 số lẻ nằm ở ChemicalReceipt.
              receivedQuantity: Math.round(linkResult.totalAccepted),
              receivedAt: receivedAtFromTrucks ?? new Date(),
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
            `${materialTicketReference(t)}: Xác nhận lãnh hóa chất ${linkResult.receiptIds.length} chuyến xe, ` +
            `tổng ${linkResult.totalAccepted} — ${receivedByName}; ` +
            `${linkResult.created} chuyến ghi mới, ${linkResult.linked} chuyến gắn vào bản ghi có sẵn; hoàn tất phiếu`);

          return ok({ ...updated, chemicalLink: linkResult });
        }

        // Không gửi bảng xe: giữ nguyên đường cũ để phiếu đang dở không bị kẹt.
        const receivedQuantity = Math.trunc(Number(body.receivedQuantity));
        if (!Number.isFinite(receivedQuantity) || receivedQuantity <= 0) return fail("Khối lượng lãnh phải lớn hơn 0");
        const receivedAt = body.receivedAt ? parseDateInput(body.receivedAt) : null;
        if (!receivedAt || Number.isNaN(receivedAt.getTime())) return fail("Vui lòng chọn ngày lãnh");
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
      // Ảnh liên 3 đi liền với số phiếu giao hàng vừa nhập, vì đây là lúc DUY NHẤT tờ liên 3
      // còn trong tay người lãnh. Bắt buộc cho mọi phiếu chứ không chỉ phiếu có thu hồi: phần
      // lãnh về chưa dùng hết nằm lại thành tồn, phiếu sau rút tiếp từ đúng lô đó và vẫn phải
      // nộp kèm đúng tờ này — lúc ấy mới đi xin lại thì đã muộn.
      const deliveryPhotoDataUrl = String(body.deliveryPhotoDataUrl || "").trim();
      const lotBefore = await prisma.materialStockLot.findFirst({
        where: { ticketId: t.id },
        select: { id: true, deliveryPhotoKey: true },
      });
      if (!deliveryPhotoDataUrl && !lotBefore?.deliveryPhotoKey) return fail(MISSING_DELIVERY_PHOTO_MESSAGE);
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
      // Đưa ảnh lên S3 TRƯỚC giao dịch: gọi mạng bên trong transaction là giữ khoá hàng kho
      // suốt thời gian chờ. Giao dịch hỏng thì tệp thừa nằm lại S3, chấp nhận được.
      const uploadedPhoto = deliveryPhotoDataUrl ? await uploadDeliveryPhoto(t.id, deliveryPhotoDataUrl) : null;
      const up = await prisma.$transaction(async (tx) => {
        const sharedCodes = sharedCodesOf(item.material);
        // Vào lô mang SỐ PHIẾU GIAO HÀNG vừa nhập; luồng Ứng đã tạo lô ở bước VHV lãnh nên
        // ở đây chỉ cộng phần chênh và điền số phiếu vào đúng lô đó.
        const lot = await receiveIntoLot(tx, {
          materialCode: item.material.code,
          stockUnit: lotStockUnit(item.material.category, t.unit),
          quantity: materialIncrement,
          ticketId: t.id,
          deliveryNote: receivedMethod,
          erpCode,
        });
        // `receiveIntoLot` trả null khi phần chênh bằng 0 và lô chưa tồn tại; lô đã có từ
        // bước trước thì dùng lại đúng lô đó.
        const lotId = lot?.id ?? lotBefore?.id ?? null;
        if (uploadedPhoto && lotId) {
          await tx.materialStockLot.update({
            where: { id: lotId },
            data: {
              deliveryPhotoKey: uploadedPhoto.key,
              deliveryPhotoAt: new Date(),
              deliveryPhotoByName: user.name ?? "",
            },
          });
        }
        await syncMaterialQuantity(tx, item.material.code, sharedCodes, stockSyncOptions(item.material.category, t.unit));
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
      // Ảnh cũ chỉ được xoá SAU khi giao dịch đã ghi khoá ảnh mới: đổi thứ tự là có lúc phiếu
      // trỏ vào tệp vừa bị xoá.
      if (uploadedPhoto && lotBefore?.deliveryPhotoKey) await deleteDeliveryPhotos([lotBefore.deliveryPhotoKey]);

      // Luồng Ứng xuất BBTHVT ngay từ bước Nghiệm thu, trong khi ảnh liên 3 chỉ
      // được gắn vào lô ở bước Thống kê xác nhận ĐXVT này. Vì vậy phải dựng lại
      // biên bản SAU KHI giao dịch lô đã commit; dựng trước transaction thì
      // `loadTicketDeliveryPhotos` chưa thấy deliveryPhotoKey vừa lưu. `existingKey` trong
      // `buildRecoveryDocument` bảo đảm ghi đè đúng tệp cũ, không sinh file mồ côi.
      let responseTicket = up;
      if (up?.recoveryDocUrl) {
        const recoveryDoc = await buildRecoveryDocument(up, {
          deliveryNoteNumber: receivedMethod,
        });
        responseTicket = await prisma.materialTicket.update({
          where: { id: up.id },
          data: { recoveryDocUrl: recoveryDoc.url },
          include: ITEM_INCLUDE,
        });
      }
      await audit(
        user.id, "MT_RECEIVE", "MaterialTicket", t.id,
        `${materialTicketReference(t)}: ${receiptSourceLabel(receiptSource)} ${receivedQuantity} (${receivedMethod}) — Hiện có ${item.material.code}: ${before} → ${before + materialIncrement}; ERP ${erpCode}: ${erpBefore} → ${erpAfter}${uploadedPhoto ? "; đính kèm ảnh phiếu xuất kho liên 3" : ""}${t.type !== "UNG" ? "; chờ ra SYC sửa chữa" : `; số phiếu ĐXVT ${proposalNumber}; chuyển Quyết toán`}`
      );
      return ok(responseTicket);
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
      // Ảnh hiện trường là bằng chứng đi kèm biên bản — thiếu thì không cho qua bước.
      if (countUsagePhotos(t) < MIN_USAGE_PHOTOS) return fail(MISSING_USAGE_PHOTO_MESSAGE);

      const item = t.items[0];
      if (!item) return fail("Phiếu chưa có vật tư");
      const received = t.receivedQuantity ?? (t.type === "UNG" ? t.vhvReceivedQuantity ?? item.quantity : 0);
      const remaining = received - usedQuantity;
      if (t.type === "SU_DUNG_HIEN_CO" && usedQuantity > received) return fail(`Số lượng sử dụng vượt số lượng đã nhận từ Hiện có (${received})`);
      const mat = await prisma.material.findUnique({
        where: { id: item.materialId },
        select: { id: true, code: true, erpCodes: true, name: true, quantity: true, category: true, machine: true },
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
            stockUnit: lotStockUnit(mat.category, t.unit),
            ticketId: t.id,
            quantity: usedQuantity,
            allocation: requestedAllocation,
          });
        } catch (error) {
          throw fail((error as Error).message);
        }
        await syncMaterialQuantity(tx, mat.code, sharedCodesOf(mat), stockSyncOptions(mat.category, t.unit));
        return tx.materialTicket.update({
          where: { id: t.id },
          data: {
            // Chai khí bỏ nghiệm thu và quyết toán — dùng xong là tới bước trả vỏ chai.
            status: isGasCylinderTicket(t.materialCategory) ? GAS_RETURN_STATUS : "CHO_NGHIEM_THU",
            recoveryRequired, recoveryQuantity,
            // VHV xác nhận trực tiếp việc đã trả vật tư thu hồi cho kho tại bước này.
            recoveryReturnedAt: recoveryReturned ? new Date() : null,
            // Không xuất file tại bước xác nhận sử dụng; bước Nghiệm thu sẽ sinh đồng thời
            // Biên bản vật tư thu hồi.
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
        select: { id: true, code: true, erpCodes: true, name: true, quantity: true, category: true, machine: true },
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
          await consumeStock(tx, { materialCode: mat.code, stockUnit: lotStockUnit(mat.category, t.unit), ticketId: t.id, quantity: returnedQuantity });
        } catch (error) {
          throw fail((error as Error).message);
        }
        await syncMaterialQuantity(tx, mat.code, sharedCodesOf(mat), stockSyncOptions(mat.category, t.unit));
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
      // Nội dung PCT không bắt buộc: nhiều công việc nhỏ không có PCT riêng, bắt nhập
      // sẽ khiến người ta gõ bừa cho qua — số PCT/LCT mới là thứ buộc phải có.
      const pctNoiDung = String(body.pctContent || "").trim();
      const pct = String(body.pctNumber || "").trim();
      const chiHuy = String(body.chiHuyName || "").trim();
      const workStartedAt = new Date(String(body.workStartedAt || ""));
      const workEndedAt = new Date(String(body.workEndedAt || ""));
      // Số BBKT nhập MỘT LẦN ở bước chọn luồng; bước này chỉ đọc, không ghi đè.
      // Sửa về sau đi qua đường có phân quyền (editInfo / editStep "confirm").
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
              stockUnit: lotStockUnit(item.material.category, t.unit),
              ticketId: t.id,
              quantity: t.usedQuantity ?? 0,
              allocation: acceptAllocation,
            });
            await syncMaterialQuantity(tx, item.material.code, sharedCodesOf(item.material), stockSyncOptions(item.material.category, t.unit));
          });
        } catch (error) {
          return fail((error as Error).message);
        }
      }
      const itemOverride = { materialCode: erpCode, materialName: erpMaterial.name };

      // Một mã/tên ERP duy nhất được áp dụng cho các biên bản.
      //
      // BƯỚC NÀY KHÔNG XUẤT BBNT D-OFFICE — với bất kỳ luồng nào. Biên bản D-Office phải mang
      // tên đại diện SCCN, mà người chọn đại diện là Thống kê ở bước sau chứ không phải người
      // nghiệm thu; xuất sớm tại đây thì hoặc phải hỏi người nghiệm thu một thông tin không
      // thuộc về họ, hoặc phát hành một biên bản rồi ghi đè lại ở bước sau.
      //   - Đề xuất và Sử dụng hiện có: Thống kê xuất ở bước CHO_THONG_KE_XUAT_BIEN_BAN.
      //   - Ứng: Thống kê xuất cùng Phiếu ĐXVT (statsExportProposal).
      // Từ 2026 BBNT ký tay chỉ còn cho bi nghiền; loại khác chỉ xuất BBTHVT.
      const bbntItems = toBbntItems(t).map((bbntItem, index) => index === 0
        ? { ...bbntItem, materialCode: erpCode, materialName: erpMaterial.name }
        : bbntItem);
      const documents = {
        bbkt: usesHandwrittenBbnt(t.materialCategory)
          ? await generateBbntDoc({
              fileBaseName: materialTicketFileBase(t), materialCategory: t.materialCategory, soGiaoHang: await deliveryNoteForDocuments(t), lyDo: t.proposalNote, soBBKT: t.bbktNumber, soPCT: pct, noiDung: note,
              thoiGianBatDau: workStartedAt, thoiGianKetThuc: workEndedAt,
              tenChiHuy: chiHuy, tenTruongCa: user.name ?? "",
              tenVHV: t.proposedByName, chucVuVHV: t.proposedByPosition,
              unit: t.unit, usedByName: t.materialUserName || t.usedByName, usedByPosition: t.usedByPosition,
              items: bbntItems,
            })
          : null,
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
            completionNote: note, pctContent: pctNoiDung || null, pctNumber: pct, chiHuyName: chiHuy,
            ...(documents.bbkt ? { bbktDocUrl: documents.bbkt.url } : {}),
            ...(documents.recovery ? { recoveryDocUrl: documents.recovery.url } : {}),
            recoveryRequired,
            workStartedAt, workEndedAt,
            completedById: user.id, completedByName: user.name ?? "",
            completedByPosition: user.position ?? null, completedAt: new Date(),
          },
          include: ITEM_INCLUDE,
        });
      });
      await audit(user.id, "MT_ACCEPT", "MaterialTicket", t.id, `${materialTicketReference(t)}: nghiệm thu với mã ERP ${erpCode}${documents.bbkt ? ", xuất BBNT ký tay" : ""}${documents.recovery ? ", xuất Biên bản vật tư thu hồi" : ""}, ${t.type === "UNG" ? "chuyển Thống kê xác nhận ĐXVT" : t.type === "DE_XUAT" ? "chuyển Thống kê xuất BBNT D-Office" : t.type === "SU_DUNG_HIEN_CO" ? "chuyển Thống kê xác nhận mã vật tư" : "chờ Thống kê quyết toán"}`);
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

      // BBTHVT đã được xuất ở bước Nghiệm thu.
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
      const settledAt = new Date();
      // Chốt trạng thái, lịch sử thực dùng và chu kỳ kế tiếp trong MỘT transaction. Khóa theo
      // ticket bảo đảm hai lần bấm đồng thời không thể sinh hai dòng lịch sử hoặc gia hạn hai lần.
      const { up, replacementResult } = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtext(${`material-ticket-settle:${t.id}`}))::text AS lock_result
        `;
        const current = await tx.materialTicket.findUnique({
          where: { id: t.id },
          select: { status: true, settledAt: true },
        });
        if (!current || current.status !== "CHO_QUYET_TOAN" || current.settledAt) {
          throw fail("Phiếu đã được quyết toán hoặc không còn ở bước quyết toán", 409);
        }

        const replacementResult = await recordSettledTicketReplacements(tx, {
          ticketId: t.id,
          doneById: user.id,
          bbntDoNumber,
          settledAt,
        });
        const up = await tx.materialTicket.update({
          where: { id: t.id },
          data: {
            status: "HOAN_TAT",
            bbntDoNumber,
            settledAt,
            settledByName: user.name ?? "",
            // Ảnh hiện trường hết vai trò: BBNT D-Office đã nhúng sẵn ba ảnh bên trong,
            // giữ thêm bản rời chỉ tốn chỗ. Gỡ khóa trước, xóa tệp sau.
            usagePhotoBeforeKey: null,
            usagePhotoAfterKey: null,
            usagePhotoSpecKey: null,
          },
          include: ITEM_INCLUDE,
        });
        return { up, replacementResult };
      });
      const removedPhotos = await deleteUsagePhotos([
        t.usagePhotoBeforeKey,
        t.usagePhotoAfterKey,
        t.usagePhotoSpecKey,
      ]);
      // Ảnh liên 3 thì theo LÔ chứ không theo phiếu, nên chỉ dọn được những lô mà phiếu này
      // vừa là mảnh ghép cuối: lô đã hết hàng và mọi phiếu từng rút lô đó đều đã quyết toán.
      // Lô còn hàng vẫn giữ ảnh để phiếu sau in vào biên bản của nó.
      const touchedLotIds = [...new Set((await usedLotsOfTicket(prisma, t.id)).map((lot) => lot.id))];
      const removedDeliveryPhotos = await purgeSettledLotPhotos(prisma, touchedLotIds).catch(() => 0);
      await audit(
        user.id,
        "MT_SETTLE",
        "MaterialTicket",
        t.id,
        `${materialTicketReference(t)}: đã xác nhận quyết toán vật tư, số BBNT DO ${bbntDoNumber}; ` +
          `ghi ${replacementResult.logged} dòng lịch sử, gia hạn ${replacementResult.renewed} điểm` +
          (removedPhotos ? `; xóa ${removedPhotos} ảnh hiện trường khỏi kho tệp` : "") +
          (removedDeliveryPhotos ? `; xóa ${removedDeliveryPhotos} ảnh phiếu xuất kho liên 3 của lô đã dùng hết` : "")
      );
      return ok(up);
    }

    return fail("Hành động không hợp lệ");
  });
}
