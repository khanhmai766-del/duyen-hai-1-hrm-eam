import { prisma } from "@/lib/prisma";
import { generateBbntDoDoc, resolveSignatureBuffer, type BbntDoItem } from "@/lib/bbnt-do-doc";
import { materialTicketFileBase } from "@/lib/material-ticket-sequence";
import { normalizeText } from "@/lib/nav";
import { deliveryNoteSummary, usedLotsOfTicket } from "@/lib/material-stock-lot";
import { loadUsagePhotoBuffer } from "@/lib/material-usage-photo";
import { keyFromPublicUrl } from "@/lib/s3";

/**
 * Dựng BBNT D-Office cho một phiếu vật tư.
 *
 * Tách khỏi route để hai cửa cùng gọi được: tác vụ nghiệm thu/quyết toán trên phiếu,
 * và điểm tải ảnh hiện trường (`/api/material-tickets/[id]/usage-photos`) — đổi ảnh
 * phải cập nhật ngay vào biên bản đã phát hành chứ không đợi ai bấm lưu.
 */

export const ITEM_INCLUDE = {
  items: {
    include: {
      material: { select: { id: true, code: true, erpCodes: true, name: true, unit: true, quantity: true, category: true, machine: true } },
      device: { select: { seq: true, name: true, kks: true } },
    },
  },
} as const;

export async function getTicket(id: string) {
  return prisma.materialTicket.findUnique({ where: { id }, include: ITEM_INCLUDE });
}

export type FullTicket = NonNullable<Awaited<ReturnType<typeof getTicket>>>;

export async function deliveryNoteForDocuments(t: FullTicket) {
  const used = await usedLotsOfTicket(prisma, t.id);
  const unit = t.items[0]?.material.unit ?? null;
  return deliveryNoteSummary(used, unit) || t.deliveryNoteNumber || t.receivedMethod || undefined;
}

export async function buildBbntDoDocument(
  t: FullTicket,
  overrides?: {
    pctNumber?: string;
    pctContent?: string;
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
  const [chuKyNguoiLap, chuKyQuanDoc, anhTruoc, anhSau, anhThongSo] = await Promise.all([
    resolveSignatureBuffer(signer),
    resolveSignatureBuffer(defaultQuanDoc),
    loadUsagePhotoBuffer(t.usagePhotoBeforeKey),
    loadUsagePhotoBuffer(t.usagePhotoAfterKey),
    loadUsagePhotoBuffer(t.usagePhotoSpecKey),
  ]);
  return generateBbntDoDoc({
    fileBaseName: materialTicketFileBase(t),
    // Đã phát hành thì ghi đè đúng tệp đó, đừng đẻ tệp mới mỗi lần sửa phiếu.
    existingKey: keyFromPublicUrl(t.docUrl),
    unit: t.unit,
    materialCategory: t.materialCategory,
    heThongThietBi,
    bbktNumber: t.bbktNumber,
    pctNumber: overrides?.pctNumber ?? t.pctNumber,
    pctContent: overrides?.pctContent ?? t.pctContent,
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
    anhTruoc,
    anhSau,
    anhThongSo,
  });
}
