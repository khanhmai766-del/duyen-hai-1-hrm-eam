import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { isShiftLeader, getWorkflowRoleMap, stepAllowedWithMap } from "@/lib/material-workflow";
import { generateBbntDoc, type BbntItem } from "@/lib/bbnt-doc";
import { generateBlankDocx } from "@/lib/blank-doc";

export const dynamic = "force-dynamic";

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

/** Sửa/Xoá phiếu: ADMIN, cương vị được cấu hình bước "manage"; khi CHƯA cấu hình → người tạo phiếu (mặc định cũ). */
function samePosition(a?: string | null, b?: string | null) {
  const left = (a ?? "").trim().toLocaleLowerCase("vi");
  const right = (b ?? "").trim().toLocaleLowerCase("vi");
  return !!left && left === right;
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
  if (!isAssignedPosition(user, t)) return false;
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
    if (!(await canManageTicket(user, t)))
      return fail("Bạn không có quyền xóa phiếu (Quản trị phân quyền ở mục Phân quyền quy trình)", 403);
    await prisma.materialTicket.delete({ where: { id: t.id } });
    await audit(user.id, "MT_DELETE", "MaterialTicket", t.id, `${t.code}: xóa phiếu`);
    return ok({ id: t.id });
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
      const CATEGORIES = ["Dầu bôi trơn", "Lọc dầu", "Hóa chất", "Bi nghiền"];
      const unit = String(body.unit || "").trim();
      if (!["S1", "S2", "COMMON"].includes(unit)) return fail("Tổ máy không hợp lệ");
      const assignedPosition = String(body.assignedPosition || "").trim();
      if (!assignedPosition) return fail("Vui lòng chọn cương vị được giao");
      const totalScopeCount = await prisma.positionSystemScope.count();
      const scopeCount = await prisma.positionSystemScope.count({ where: { position: assignedPosition } });
      if (totalScopeCount > 0 && scopeCount === 0) return fail(`Cương vị "${assignedPosition}" chưa được phân giao hệ thống thiết bị`);
      const materialCategory = String(body.materialCategory || "").trim();
      if (!CATEGORIES.includes(materialCategory)) return fail("Vui lòng chọn loại vật tư");
      const bbkt = String(body.bbktNumber || "").trim(); // BBKT giờ là tuỳ chọn (bổ sung ở bước Nghiệm thu)
      const data: {
        unit: string;
        assignedPosition: string;
        materialCategory: string;
        bbktNumber: string | null;
        proposalNote?: string | null;
      } = { unit, assignedPosition, materialCategory, bbktNumber: bbkt || null };
      let editedItemData: {
        materialId: string;
        erpCode: string;
        quantity: number;
        deviceSeq: string | null;
        deviceNameManual: string | null;
      } | null = null;

      if (["DE_XUAT", "UNG", "SU_DUNG_HIEN_CO"].includes(t.type)) {
        const proposalNote = String(body.note || "").trim();
        const materialId = String(body.materialId || "").trim();
        const erpCode = String(body.erpCode || "").trim();
        const proposedQuantity = Math.trunc(Number(body.proposedQuantity || body.quantity || 0));
        const replacementDeviceSeq = String(body.replacementDeviceSeq || "").trim();
        if (!proposalNote) return fail("Vui lòng nhập Ghi chú cho phiếu đề xuất");
        if (!materialId) return fail("Vui lòng chọn tên vật tư đề xuất");
        if (!erpCode) return fail("Vui lòng chọn mã vật tư");
        if (!Number.isFinite(proposedQuantity) || proposedQuantity <= 0) return fail("Số lượng đề xuất phải lớn hơn 0");
        if (!replacementDeviceSeq) return fail("Vui lòng chọn thiết bị thay thế");
        const material = await prisma.material.findUnique({
          where: { id: materialId },
          select: { id: true, code: true, erpCodes: true, machine: true },
        });
        if (!material) return fail("Không tìm thấy vật tư đề xuất", 404);
        if (material.machine !== unit) return fail("Vật tư không thuộc tổ máy đã chọn");
        const allowedCodes = material.erpCodes.length ? material.erpCodes : [material.code];
        if (!allowedCodes.includes(erpCode)) return fail("Mã vật tư không thuộc tên vật tư đã chọn");
        const manualDeviceId = replacementDeviceSeq.startsWith("manual:") ? replacementDeviceSeq.slice("manual:".length) : "";
        const replacementPoint = await prisma.materialReplacement.findFirst({
          where: manualDeviceId
            ? { id: manualDeviceId, materialId, isActive: false }
            : { materialId, deviceSeq: replacementDeviceSeq, isActive: false },
          select: { id: true, deviceSeq: true, location: true, system: true, device: { select: { name: true } } },
        });
        if (!replacementPoint) return fail("Thiết bị chưa được khai báo trong Chi tiết điểm thay thế của vật tư");
        if (!manualDeviceId && (!replacementPoint.deviceSeq || !replacementPoint.device)) {
          return fail("Thiết bị đã chọn không còn tồn tại trong cây thiết bị");
        }
        const replacementDeviceLabel = replacementPoint.location || replacementPoint.device?.name || replacementPoint.system || replacementPoint.deviceSeq || "Thiết bị nhập tay";
        editedItemData = {
          materialId,
          erpCode,
          quantity: proposedQuantity,
          deviceSeq: manualDeviceId ? null : replacementPoint.deviceSeq,
          deviceNameManual: replacementDeviceLabel,
        };
        data.proposalNote = proposalNote;
      }

      const up = await prisma.$transaction(async (tx) => {
        await tx.materialTicket.update({
          where: { id: t.id },
          data,
        });
        if (["DE_XUAT", "UNG", "SU_DUNG_HIEN_CO"].includes(t.type)) {
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
      await audit(user.id, "MT_EDIT_INFO", "MaterialTicket", t.id, `${t.code}: sửa thông tin phiếu`);
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
      if (["receive", "use", "accept"].includes(step)) {
        const assignedError = assignedPositionError(user, t);
        if (assignedError) return assignedError;
      }

      let before = "";
      let after = "";
      let up: FullTicket | null = null;

      if (step === "confirm") {
        if (!t.confirmedAt) return fail("Bước Trưởng ca/Trưởng kíp xác nhận chưa hoàn thành");
        const value = String(body.bbktNumber || "").trim();
        before = `Số BBKT: ${t.bbktNumber ?? "—"}`; after = `Số BBKT: ${value || "—"}`;
        up = await prisma.materialTicket.update({
          where: { id: t.id },
          data: { bbktNumber: value || null },
          include: ITEM_INCLUDE,
        });
      } else if (step === "stats") {
        if (!t.statsAt) return fail("Bước nhập số phiếu chưa hoàn thành");
        const value = String(body.proposalNumber || "").trim();
        if (!value) return fail("Vui lòng nhập số phiếu ĐXVT");
        before = `Số phiếu ĐXVT: ${t.proposalNumber ?? "—"}`; after = `Số phiếu ĐXVT: ${value}`;
        up = await prisma.materialTicket.update({ where: { id: t.id }, data: { proposalNumber: value }, include: ITEM_INCLUDE });
      } else if (step === "receive") {
        if (!t.receivedAt || t.receivedQuantity == null) return fail("Bước xác nhận vật tư lãnh chưa hoàn thành");
        const value = Math.trunc(Number(body.receivedQuantity));
        const method = String(body.deliveryNoteNumber || body.receivedMethod || "").trim();
        const receiptSource = body.receiptSource === "OUTSIDE" ? "OUTSIDE" : "ERP";
        if (value <= 0 || !method) return fail("Khối lượng lãnh hoặc số phiếu giao hàng không hợp lệ");
        const item = t.items[0]; if (!item) return fail("Phiếu chưa có vật tư");
        const delta = value - t.receivedQuantity;
        const erpCode = item.erpCode || item.material.code;
        const erpRows = await prisma.$queryRaw<Array<{ erpStock: number }>>`SELECT "erpStock" FROM "ErpMaterial" WHERE "code" = ${erpCode} LIMIT 1`;
        if (!erpRows.length) return fail(`Không tìm thấy mã vật tư ERP "${erpCode}"`, 404);
        const oldSource = t.receiptSource === "OUTSIDE" ? "OUTSIDE" : "ERP";
        const erpDelta = (oldSource === "ERP" ? t.receivedQuantity : 0) - (receiptSource === "ERP" ? value : 0);
        if (item.material.quantity + delta < 0 || erpRows[0].erpStock + erpDelta < 0) return fail("Không thể điều chỉnh vì số lượng hiện có hoặc ERP sẽ âm");
        before = `Nhận ${t.receivedQuantity}, phiếu giao hàng ${t.deliveryNoteNumber ?? t.receivedMethod ?? "—"}`; after = `Nhận ${value}, phiếu giao hàng ${method}`;
        up = await prisma.$transaction(async (tx) => {
          if (delta) await tx.material.update({ where: { id: item.materialId }, data: { quantity: { increment: delta } } });
          if (erpDelta) await tx.$executeRaw`UPDATE "ErpMaterial" SET "erpStock" = "erpStock" + ${erpDelta}, "updatedAt" = NOW() WHERE "code" = ${erpCode}`;
          return tx.materialTicket.update({ where: { id: t.id }, data: { receivedQuantity: value, receivedMethod: method || null, deliveryNoteNumber: method || null, receiptSource, remainingQuantity: value - (t.usedQuantity ?? 0) }, include: ITEM_INCLUDE });
        });
      } else if (step === "use") {
        if (!t.usedAt || t.usedQuantity == null) return fail("Bước sử dụng vật tư chưa hoàn thành");
        const value = Math.trunc(Number(body.usedQuantity));
        const recoveryRequired = body.recoveryRequired === true;
        const recoveryQuantity = recoveryRequired ? Math.trunc(Number(body.recoveryQuantity)) : null;
        const recoveryReturned = recoveryRequired && body.recoveryReturned === true;
        if (value <= 0) return fail("Số lượng sử dụng phải lớn hơn 0");
        if (recoveryRequired && (!recoveryQuantity || recoveryQuantity <= 0)) return fail("Vui lòng nhập số lượng vật tư thu hồi");
        const item = t.items[0]; if (!item) return fail("Phiếu chưa có vật tư");
        const delta = value - t.usedQuantity;
        if (item.material.quantity - delta < 0) return fail("Không đủ số lượng hiện có để tăng số lượng sử dụng");
        const recoveryDocument = recoveryRequired && !t.recoveryDocUrl
          ? await generateBlankDocx(t.code, "BIEN-BAN-VAT-TU-THU-HOI")
          : null;
        before = `Dùng ${t.usedQuantity}; thu hồi ${t.recoveryRequired ? `${t.recoveryQuantity ?? 0}${t.recoveryReturnedAt ? " (đã trả)" : " (chưa trả)"}` : "không"}`;
        after = `Dùng ${value}; thu hồi ${recoveryRequired ? `${recoveryQuantity}${recoveryReturned ? " (đã trả)" : " (chưa trả)"}` : "không"}`;
        up = await prisma.$transaction(async (tx) => {
          if (delta) await tx.material.update({ where: { id: item.materialId }, data: { quantity: { decrement: delta } } });
          return tx.materialTicket.update({
            where: { id: t.id },
            data: {
              usedQuantity: value,
              remainingQuantity: (t.receivedQuantity ?? 0) - value,
              recoveryRequired,
              recoveryQuantity,
              recoveryReturnedAt: recoveryReturned ? (t.recoveryReturnedAt ?? new Date()) : null,
              recoveryDocUrl: recoveryRequired ? (t.recoveryDocUrl ?? recoveryDocument?.url ?? null) : null,
            },
            include: ITEM_INCLUDE,
          });
        });
      } else if (step === "accept") {
        if (!t.completedAt) return fail("Bước xác nhận/nghiệm thu chưa hoàn thành");
        const pct = String(body.pctNumber || "").trim(); const chiHuy = String(body.chiHuyName || "").trim();
        const note = String(body.completionNote ?? t.completionNote ?? "").trim();
        if (!pct || !chiHuy) return fail("Vui lòng nhập số PCT/LCT và tên chỉ huy");
        before = `${t.pctNumber ?? "—"}; ${t.chiHuyName ?? "—"}`; after = `${pct}; ${chiHuy}`;
        const { url } = await generateBbntDoc({ code: t.code, soBBKT: t.bbktNumber, soPCT: pct, noiDung: note, tenChiHuy: chiHuy, tenTruongCa: t.completedByName ?? "", tenVHV: t.proposedByName, chucVuVHV: t.proposedByPosition, items: toBbntItems(t) });
        up = await prisma.materialTicket.update({ where: { id: t.id }, data: { pctNumber: pct, chiHuyName: chiHuy, completionNote: note, bbktDocUrl: url }, include: ITEM_INCLUDE });
      }
      if (!up) return fail("Không thể cập nhật bước");
      await audit(user.id, "MT_EDIT_STEP", "MaterialTicket", t.id, `${t.code}: chỉnh sửa bước ${step} — ${before} → ${after}`, { actorName: user.name, beforeData: { summary: before }, afterData: { summary: after }, changedFields: [step] });
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
        select: { id: true, code: true, erpCodes: true, machine: true },
      });
      const materialCodeMap = new Map(materials.map((material) => [material.id, material.erpCodes.length ? material.erpCodes : [material.code]]));
      const materialMachineMap = new Map(materials.map((material) => [material.id, material.machine]));
      for (const it of items) {
        if (materialMachineMap.get(it.materialId) !== t!.unit) return "Vật tư không thuộc tổ máy của phiếu";
        if (!materialCodeMap.get(it.materialId)?.includes(it.erpCode || "")) return "Mã vật tư không thuộc tên vật tư đã chọn";
      }
      // Mỗi cặp (vật tư, thiết bị) phải là điểm đã KHAI BÁO trong Danh mục vật tư
      // (dropdown thiết bị lấy từ chính danh sách này).
      const matIds = [...new Set(items.map((i) => i.materialId))];
      const decls = await prisma.materialReplacement.findMany({
        where: { materialId: { in: matIds }, isActive: false, deviceSeq: { not: null } },
        select: { id: true, materialId: true, deviceSeq: true, location: true, system: true, device: { select: { name: true } } },
      });
      const declSet = new Set(decls.map((d) => `${d.materialId}::${d.deviceSeq}`));
      const replacementLabelMap = new Map(
        decls.map((d) => [`${d.materialId}::${d.deviceSeq}`, d.location || d.device?.name || d.system || d.deviceSeq || "Thiết bị thay thế"])
      );
      const manualDeclMap = new Map(
        decls.map((d) => [`${d.materialId}::manual:${d.id}`, d.location || d.device?.name || d.system || "Thiết bị nhập tay"])
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
      await audit(user.id, "MT_PROPOSE", "MaterialTicket", t.id, `${t.code}: gửi đề xuất`);
      return ok(up);
    }

    // B1 — Trưởng Ca/Trưởng Kíp chọn luồng xử lý.
    if (action === "confirm") {
      if (!["DE_XUAT", "CHUA_CHON"].includes(t.type) || t.status !== "CHO_XAC_NHAN") return fail("Phiếu không ở bước Trưởng ca/Trưởng kíp xử lý");
      if (!stepAllowedWithMap(await getWorkflowRoleMap(), "confirm", user))
        return fail("Bạn không có quyền xác nhận (Quản trị phân quyền ở mục Phân quyền quy trình)", 403);
      const workflowType = body.workflowType === "UNG" ? "UNG" : body.workflowType === "SU_DUNG_HIEN_CO" ? "SU_DUNG_HIEN_CO" : body.workflowType === "DE_XUAT" ? "DE_XUAT" : t.type;
      const item = t.items[0];
      if (!item) return fail("Phiếu chưa có vật tư");
      const erpCode = String(body.erpCode || item.erpCode || "").trim();
      const quantity = Math.trunc(Number(body.proposedQuantity || item.quantity));
      const bbktNumber = String(body.bbktNumber || "").trim();
      if (workflowType !== "UNG" && !erpCode) return fail("Vui lòng chọn mã vật tư");
      if (!Number.isFinite(quantity) || quantity <= 0) return fail("Số lượng xác nhận phải lớn hơn 0");
      const allowedCodes = item.material.erpCodes.length ? item.material.erpCodes : [item.material.code];
      if (workflowType !== "UNG" && !allowedCodes.includes(erpCode)) return fail("Mã vật tư không thuộc tên vật tư đã chọn");
      const erpMaterial = workflowType !== "UNG"
        ? await prisma.erpMaterial.findUnique({ where: { code: erpCode }, select: { name: true, erpStock: true } })
        : null;
      if (workflowType !== "UNG" && !erpMaterial) return fail("Không tìm thấy tên vật tư theo mã ERP đã chọn", 404);
      if (workflowType === "DE_XUAT" && quantity > (erpMaterial?.erpStock ?? 0)) {
        return fail(
          `Tồn ERP của mã ${erpCode} chỉ còn ${erpMaterial?.erpStock ?? 0} ${item.material.unit}, ` +
          `không đủ số lượng đề xuất ${quantity} ${item.material.unit}. Vui lòng chọn luồng Ứng.`
        );
      }
      const short = t.items.filter((it) => it.quantity > it.material.quantity);
      if (workflowType === "SU_DUNG_HIEN_CO" && short.length > 0) {
        return fail(
          "Số lượng hiện có không đủ: " +
          short.map((s) => `${s.material.name} (cần ${s.quantity}, tồn ${s.material.quantity})`).join("; ") +
          " — không thể chọn luồng Sử dụng hiện có. Vui lòng chọn Đề xuất hoặc Ứng."
        );
      }
      const up = await prisma.$transaction(async (tx) => {
        // Lưu mã/tên ERP và chuyển trạng thái trong cùng transaction: nếu một
        // phần lỗi thì toàn bộ rollback, không để phiếu đứng sai bước.
        await tx.materialTicketItem.update({
          where: { id: item.id },
          data: { erpCode: workflowType !== "UNG" ? erpCode : null, erpName: workflowType !== "UNG" ? erpMaterial?.name : null, quantity },
        });
        return tx.materialTicket.update({
          where: { id: t.id },
          data: {
            type: workflowType,
            status: workflowType === "UNG" ? "VHV_LANH_VAT_TU" : workflowType === "SU_DUNG_HIEN_CO" ? "NHAN_TU_HIEN_CO" : "CHO_THONG_KE",
            bbktNumber: bbktNumber || null,
            confirmedById: user.id, confirmedByName: user.name ?? "",
            confirmedByPosition: user.position ?? null, confirmedAt: new Date(),
          },
          include: ITEM_INCLUDE,
        });
      });
      await audit(user.id, "MT_CONFIRM", "MaterialTicket", t.id, `${t.code}: chọn luồng ${workflowType}`);
      return ok(up);
    }

    if (action === "receiveExisting") {
      if (t.type !== "SU_DUNG_HIEN_CO" || t.status !== "NHAN_TU_HIEN_CO") return fail("Phiếu không ở bước Nhận vật tư từ Hiện có");
      const assignedError = assignedPositionError(user, t);
      if (assignedError) return assignedError;
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
      await audit(user.id, "MT_RECEIVE_EXISTING", "MaterialTicket", t.id, `${t.code}: nhận ${quantity} từ Hiện có, chưa trừ tồn`);
      return ok(up);
    }

    // Luồng Ứng — VHV ghi nhận số lượng thực tế đã lãnh; mã vật tư nhập tay và không bắt buộc.
    // Số đã lãnh được cộng vào Hiện có để bước Sử dụng có thể trừ sau đó; ERP không thay đổi.
    if (action === "vhvReceive") {
      if (t.type !== "UNG" || t.status !== "VHV_LANH_VAT_TU") return fail("Phiếu không ở bước VHV lãnh vật tư");
      const assignedError = assignedPositionError(user, t);
      if (assignedError) return assignedError;
      const quantity = Math.trunc(Number(body.quantity));
      if (!Number.isFinite(quantity) || quantity <= 0) return fail("Số lượng vật tư đã lãnh phải lớn hơn 0");
      const materialCode = String(body.materialCode || "").trim();
      const item = t.items[0];
      if (!item) return fail("Phiếu chưa có vật tư");
      const sharedCodes = item.material.erpCodes.length ? item.material.erpCodes : [item.material.code];
      const up = await prisma.$transaction(async (tx) => {
        const claimed = await tx.materialTicket.updateMany({
          where: { id: t.id, status: "VHV_LANH_VAT_TU", vhvReceivedAt: null },
          data: {
            status: "SU_DUNG_VAT_TU",
            vhvReceivedQuantity: quantity,
            vhvMaterialCode: materialCode || null,
            vhvReceivedByName: user.name ?? "",
            vhvReceivedByPosition: user.position ?? null,
            vhvReceivedAt: new Date(),
          },
        });
        if (claimed.count === 0) return null;
        await tx.$executeRaw`
          UPDATE "Material"
          SET "quantity" = "quantity" + ${quantity}
          WHERE "code" = ANY(${sharedCodes}::text[]) OR "erpCodes" && ${sharedCodes}::text[]
        `;
        return tx.materialTicket.findUnique({ where: { id: t.id }, include: ITEM_INCLUDE });
      });
      if (!up) return fail("Bước VHV lãnh vật tư đã được xác nhận trước đó");
      await audit(user.id, "MT_VHV_RECEIVE", "MaterialTicket", t.id, `${t.code}: VHV lãnh ${quantity}${materialCode ? `, mã ${materialCode}` : ", không có mã"}; Hiện có ${item.material.quantity} → ${item.material.quantity + quantity}; ERP không đổi`);
      return ok(up);
    }

    // B1' — Từ chối khi vật tư không có/không đủ hoặc lý do khác. Phiếu đóng vĩnh viễn.
    if (action === "reject") {
      if (!["DE_XUAT", "UNG"].includes(t.type) || !["CHO_XAC_NHAN", "VAT_TU_KHONG_CO"].includes(t.status)) return fail("Phiếu không ở bước có thể từ chối");
      const assignedError = assignedPositionError(user, t);
      if (assignedError) return assignedError;
      const canReject = isShiftLeader(user.position) || user.role === "ADMIN" || t.createdById === user.id;
      if (!canReject) return fail("Chỉ người tạo phiếu, Quản trị hoặc Trưởng Ca / Trưởng Kíp được từ chối", 403);
      const reason = String(body.reason || "").trim();
      if (!reason) return fail("Vui lòng nhập lý do từ chối");
      const up = await prisma.materialTicket.update({
        where: { id: t.id },
        data: { status: "TU_CHOI", rejectedReason: reason },
        include: ITEM_INCLUDE,
      });
      await audit(user.id, "MT_REJECT", "MaterialTicket", t.id, `${t.code}: từ chối — ${reason}`);
      return ok(up);
    }

    // B2 — Thống kê nhập số phiếu ĐXVT (CHỈ cương vị Thống kê; không còn khóa 2 ngày)
    if (action === "stats") {
      if (!["DE_XUAT", "UNG"].includes(t.type) || !["CHO_THONG_KE", "CHO_PHIEU__XUAT_KHO"].includes(t.status)) return fail("Phiếu không ở bước Thống kê");
      if (!stepAllowedWithMap(await getWorkflowRoleMap(), "stats", user))
        return fail("Bạn không có quyền nhập số phiếu ĐXVT (Quản trị phân quyền ở mục Phân quyền quy trình)", 403);
      const num = String(body.proposalNumber || "").trim();
      if (!num) return fail("Vui lòng nhập số phiếu đề xuất vật tư");
      const up = await prisma.materialTicket.update({
        where: { id: t.id },
        data: {
          status: "CHO_XAC_NHAN_PHAT", proposalNumber: num,
          statsById: user.id, statsByName: user.name ?? "",
          statsByPosition: user.position ?? null, statsAt: new Date(),
        },
        include: ITEM_INCLUDE,
      });
      await audit(user.id, "MT_STATS", "MaterialTicket", t.id, `${t.code}: số phiếu ${num}`);
      return ok(up);
    }

    if (action === "issueProposal") {
      if (!["DE_XUAT", "UNG"].includes(t.type) || t.status !== "CHO_XAC_NHAN_PHAT") return fail("Phiếu không ở bước xác nhận giao phiếu ĐXVT");
      if (!stepAllowedWithMap(await getWorkflowRoleMap(), "stats", user)) return fail("Bạn không có quyền xác nhận giao phiếu ĐXVT", 403);
      const proposalReceiverName = String(body.proposalReceiverName || "").trim();
      if (!proposalReceiverName) return fail("Vui lòng nhập tên VHV nhận phiếu ĐXVT");
      const up = await prisma.materialTicket.update({
        where: { id: t.id },
        data: {
          status: t.type === "UNG" ? "CHO_QUYET_TOAN" : "NHAN_VAT_TU",
          proposalIssuedAt: new Date(),
          proposalReceiverName,
        },
        include: ITEM_INCLUDE,
      });
      await audit(user.id, "MT_ISSUE_PROPOSAL", "MaterialTicket", t.id, `${t.code}: giao phiếu ĐXVT cho ${proposalReceiverName}`);
      return ok(up);
    }

    // B2' — NHẬN VẬT TƯ: khối lượng lãnh + hình thức lãnh → chuyển Sử dụng vật tư
    if (action === "receive") {
      if (!["DE_XUAT", "UNG"].includes(t.type) || t.status !== "NHAN_VAT_TU") return fail("Phiếu không ở bước Xác nhận vật tư lãnh");
      const assignedError = assignedPositionError(user, t);
      if (assignedError) return assignedError;
      if (!stepAllowedWithMap(await getWorkflowRoleMap(), "receive", user))
        return fail("Bạn không có quyền ở bước Xác nhận vật tư lãnh (Quản trị phân quyền ở mục Phân quyền quy trình)", 403);
      const receivedQuantity = Math.trunc(Number(body.receivedQuantity));
      if (!Number.isFinite(receivedQuantity) || receivedQuantity <= 0) return fail("Khối lượng vật tư lãnh phải lớn hơn 0");
      const receivedMethod = String(body.deliveryNoteNumber || body.receivedMethod || "").trim();
      const receiptSource = body.receiptSource === "OUTSIDE" ? "OUTSIDE" : "ERP";
      if (!receivedMethod) return fail("Vui lòng nhập số phiếu giao hàng");
      const repairRequestNumber = t.type === "UNG" ? "" : String(body.repairRequestNumber || "").trim();
      if (t.type !== "UNG" && !repairRequestNumber) return fail("Vui lòng nhập số phiếu yêu cầu sửa chữa");
      const item = t.items[0];
      if (!item) return fail("Phiếu chưa có vật tư");
      const erpCode = String(body.erpCode || item.erpCode || "").trim();
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
      const documents = t.type === "UNG" ? {
        bbkt: await generateBbntDoc({
          code: t.code,
          soBBKT: t.bbktNumber,
          soPCT: t.pctNumber,
          noiDung: t.completionNote ?? "",
          thoiGianBatDau: t.workStartedAt,
          thoiGianKetThuc: t.workEndedAt,
          tenChiHuy: t.chiHuyName ?? "",
          tenTruongCa: t.completedByName ?? "",
          tenVHV: t.proposedByName,
          chucVuVHV: t.proposedByPosition,
          items: toBbntItems(t).map((row, index) => index === 0
            ? { ...row, materialCode: erpCode, materialName: erpMaterial.name, quantity: receivedQuantity }
            : row),
        }),
        bbnt: await generateBlankDocx(t.code, "BBNT-DO"),
        recovery: t.recoveryRequired
          ? await generateBlankDocx(t.code, "BIEN-BAN-VAT-TU-THU-HOI")
          : null,
      } : null;
      const up = await prisma.$transaction(async (tx) => {
        const sharedCodes = item.material.erpCodes.length ? item.material.erpCodes : [item.material.code];
        const sharedQuantity = before + materialIncrement;
        await tx.$executeRaw`
          UPDATE "Material"
          SET "quantity" = ${sharedQuantity}
          WHERE "code" = ANY(${sharedCodes}::text[]) OR "erpCodes" && ${sharedCodes}::text[]
        `;
        if (receiptSource === "ERP") await tx.$executeRaw`
          UPDATE "ErpMaterial" SET "erpStock" = ${erpAfter}, "updatedAt" = NOW() WHERE "code" = ${erpCode}
        `;
        await tx.materialTicket.update({
          where: { id: t.id },
          data: {
            status: t.type === "UNG" ? "CHO_THONG_KE" : "SU_DUNG_VAT_TU",
            receivedQuantity, receivedMethod: receivedMethod || null, deliveryNoteNumber: receivedMethod || null, receiptSource,
            ...(t.type !== "UNG" ? { repairRequestNumber } : {}),
            remainingQuantity: receivedQuantity - (t.usedQuantity ?? 0),
            ...(documents ? {
              docUrl: documents.bbnt.url,
              bbktDocUrl: documents.bbkt.url,
              recoveryDocUrl: documents.recovery?.url ?? null,
            } : {}),
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
        `${t.code}: ${receiptSource === "ERP" ? "lãnh kho ERP" : "lãnh ngoài kho"} ${receivedQuantity} (${receivedMethod}) — Hiện có ${item.material.code}: ${before} → ${before + materialIncrement}; ERP ${erpCode}: ${erpBefore} → ${erpAfter}${t.type !== "UNG" ? `; phiếu yêu cầu sửa chữa ${repairRequestNumber}` : ""}${documents ? `; đã xuất BBKT, BBNT DO${documents.recovery ? " và Biên bản vật tư thu hồi" : ""}` : ""}`
      );
      return ok(up);
    }

    if (action === "repairRequest") {
      if (!["DE_XUAT", "UNG"].includes(t.type) || t.status !== "CHO_PHIEU_YCSC") return fail("Phiếu không ở bước Xác nhận vật tư lãnh");
      const assignedError = assignedPositionError(user, t); if (assignedError) return assignedError;
      if (!stepAllowedWithMap(await getWorkflowRoleMap(), "receive", user)) return fail("Bạn không có quyền ở bước Xác nhận vật tư lãnh", 403);
      const value = String(body.repairRequestNumber || "").trim();
      if (!value) return fail("Vui lòng nhập số phiếu yêu cầu sửa chữa");
      const up = await prisma.materialTicket.update({ where: { id: t.id }, data: { status: "SU_DUNG_VAT_TU", repairRequestNumber: value }, include: ITEM_INCLUDE });
      await audit(user.id, "MT_REPAIR_REQUEST", "MaterialTicket", t.id, `${t.code}: xác nhận vật tư lãnh, phiếu yêu cầu sửa chữa ${value}`);
      return ok(up);
    }

    // B2'' — SỬ DỤNG VẬT TƯ: PCT/LCT + chỉ huy + nội dung + khối lượng dùng.
    // Tồn kho đã cộng khối lượng lãnh ở bước Nhận vật tư; bước này trừ khối lượng dùng.
    if (action === "use") {
      if (!["DE_XUAT", "UNG", "SU_DUNG_HIEN_CO"].includes(t.type) || t.status !== "SU_DUNG_VAT_TU") return fail("Phiếu không ở bước Sử dụng vật tư");
      const assignedError = assignedPositionError(user, t);
      if (assignedError) return assignedError;
      if (!stepAllowedWithMap(await getWorkflowRoleMap(), "use", user))
        return fail("Bạn không có quyền ở bước Sử dụng vật tư (Quản trị phân quyền ở mục Phân quyền quy trình)", 403);
      const recoveryRequired = body.recoveryRequired === true;
      const recoveryQuantity = recoveryRequired ? Math.trunc(Number(body.recoveryQuantity)) : null;
      const recoveryReturned = body.recoveryReturned === true;
      const usedQuantity = Math.trunc(Number(body.usedQuantity));
      if (recoveryRequired && (!recoveryQuantity || recoveryQuantity <= 0)) return fail("Vui lòng nhập số lượng vật tư thu hồi");
      if (!Number.isFinite(usedQuantity) || usedQuantity <= 0) return fail("Khối lượng vật tư sử dụng phải lớn hơn 0");

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
      const recoveryDocument = recoveryRequired && t.type !== "UNG"
        ? await generateBlankDocx(t.code, "BIEN-BAN-VAT-TU-THU-HOI")
        : null;

      const up = await prisma.$transaction(async (tx) => {
        if (newQty !== mat.quantity) {
          const sharedCodes = mat.erpCodes.length ? mat.erpCodes : [mat.code];
          await tx.$executeRaw`
            UPDATE "Material"
            SET "quantity" = ${newQty}
            WHERE "code" = ANY(${sharedCodes}::text[]) OR "erpCodes" && ${sharedCodes}::text[]
          `;
        }
        return tx.materialTicket.update({
          where: { id: t.id },
          data: {
            status: "CHO_NGHIEM_THU",
            recoveryRequired, recoveryQuantity,
            recoveryReturnedAt: recoveryRequired && recoveryReturned ? new Date() : null,
            recoveryDocUrl: recoveryDocument?.url ?? null,
            usedQuantity, remainingQuantity: remaining,
            usedById: user.id, usedByName: user.name ?? "",
            usedByPosition: user.position ?? null, usedAt: new Date(),
          },
          include: ITEM_INCLUDE,
        });
      });
      await audit(
        user.id, "MT_USE", "MaterialTicket", t.id,
        `${t.code}: lãnh ${received}, dùng ${usedQuantity}, còn lại ${remaining} — tồn kho ${mat.code}: ${mat.quantity} → ${newQty}`
      );
      return ok(up);
    }

    // B3 — Trưởng Ca nghiệm thu: nhập PCT/LCT + nội dung + chỉ huy → xuất Word → HOÀN TẤT
    if (action === "accept") {
      if (!["DE_XUAT", "UNG", "SU_DUNG_HIEN_CO"].includes(t.type) || t.status !== "CHO_NGHIEM_THU") return fail("Phiếu không ở bước Nghiệm thu");
      const assignedError = assignedPositionError(user, t);
      if (assignedError) return assignedError;
      if (!stepAllowedWithMap(await getWorkflowRoleMap(), "accept", user))
        return fail("Bạn không có quyền nghiệm thu (Quản trị phân quyền ở mục Phân quyền quy trình)", 403);
      // PCT/chỉ huy/nội dung đã nhập ở bước SỬ DỤNG VẬT TƯ; phiếu cũ (trước khi có
      // bước này) vẫn nhận từ form nghiệm thu để tương thích.
      const note = String(body.completionNote || "").trim();
      const pct = String(body.pctNumber || "").trim();
      const chiHuy = String(body.chiHuyName || "").trim();
      const workStartedAt = new Date(String(body.workStartedAt || ""));
      const workEndedAt = new Date(String(body.workEndedAt || ""));
      const bbkt = String(body.bbktNumber || "").trim(); // Số BBKT bổ sung ở bước này (nếu có)
      if (!note) return fail("Vui lòng nhập thông tin xác nhận thay thế xong");
      if (!pct) return fail("Vui lòng nhập số PCT/LCT");
      if (!chiHuy) return fail("Vui lòng nhập tên chỉ huy trực tiếp (SCCN)");
      if (Number.isNaN(workStartedAt.getTime()) || Number.isNaN(workEndedAt.getTime())) return fail("Vui lòng chọn thời gian bắt đầu và kết thúc");
      if (workEndedAt <= workStartedAt) return fail("Thời gian kết thúc nghiệm thu phải sau thời gian bắt đầu nghiệm thu");

      const documents = t.type !== "UNG" ? {
        bbkt: await generateBbntDoc({
          code: t.code, soBBKT: bbkt || t.bbktNumber, soPCT: pct, noiDung: note,
          thoiGianBatDau: workStartedAt, thoiGianKetThuc: workEndedAt,
          tenChiHuy: chiHuy, tenTruongCa: user.name ?? "",
          tenVHV: t.proposedByName, chucVuVHV: t.proposedByPosition,
          items: toBbntItems(t),
        }),
        bbnt: await generateBlankDocx(t.code, "BBNT-DO"),
      } : null;
      const up = await prisma.materialTicket.update({
        where: { id: t.id },
        data: {
          status: t.type === "UNG" ? "NHAN_VAT_TU" : "CHO_QUYET_TOAN", completionNote: note, pctNumber: pct, chiHuyName: chiHuy,
          ...(documents ? { docUrl: documents.bbnt.url, bbktDocUrl: documents.bbkt.url } : {}),
          workStartedAt, workEndedAt,
          ...(bbkt ? { bbktNumber: bbkt } : {}),
          completedById: user.id, completedByName: user.name ?? "",
          completedByPosition: user.position ?? null, completedAt: new Date(),
        },
        include: ITEM_INCLUDE,
      });
      await audit(user.id, "MT_ACCEPT", "MaterialTicket", t.id, t.type === "UNG" ? `${t.code}: đã nghiệm thu, chờ xác nhận vật tư lãnh để xuất biên bản` : `${t.code}: nghiệm thu, xuất biên bản`);
      return ok(up);
    }

    if (action === "settle") {
      if (!["DE_XUAT", "UNG", "SU_DUNG_HIEN_CO"].includes(t.type) || t.status !== "CHO_QUYET_TOAN") return fail("Phiếu không ở bước quyết toán");
      if (!stepAllowedWithMap(await getWorkflowRoleMap(), "stats", user)) return fail("Bạn không có quyền xác nhận quyết toán", 403);
      const up = await prisma.materialTicket.update({ where: { id: t.id }, data: { status: "HOAN_TAT", settledAt: new Date(), settledByName: user.name ?? "" }, include: ITEM_INCLUDE });
      await audit(user.id, "MT_SETTLE", "MaterialTicket", t.id, `${t.code}: đã quyết toán vật tư`);
      return ok(up);
    }

    return fail("Hành động không hợp lệ");
  });
}
