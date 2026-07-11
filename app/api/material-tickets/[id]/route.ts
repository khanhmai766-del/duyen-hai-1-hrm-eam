import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { isShiftLeader, isStats, getWorkflowRoleMap, stepAllowedWithMap } from "@/lib/material-workflow";
import { generateBbntDoc, type BbntItem } from "@/lib/bbnt-doc";

export const dynamic = "force-dynamic";

const ITEM_INCLUDE = {
  items: {
    include: {
      material: { select: { id: true, code: true, name: true, unit: true, quantity: true } },
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
    materialName: it.material.name,
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

      if (t.type === "DE_XUAT") {
        const proposalNote = String(body.note || "").trim();
        const materialId = String(body.materialId || "").trim();
        const erpCode = String(body.erpCode || "").trim();
        const proposedQuantity = Math.trunc(Number(body.proposedQuantity || body.quantity || 0));
        const replacementDeviceName = String(body.replacementDeviceName || "").trim();
        if (!proposalNote) return fail("Vui lòng nhập Ghi chú cho phiếu đề xuất");
        if (!materialId) return fail("Vui lòng chọn tên vật tư đề xuất");
        if (!erpCode) return fail("Vui lòng chọn mã vật tư");
        if (!Number.isFinite(proposedQuantity) || proposedQuantity <= 0) return fail("Số lượng đề xuất phải lớn hơn 0");
        if (!replacementDeviceName) return fail("Vui lòng nhập tên thiết bị thay thế");
        const material = await prisma.material.findUnique({
          where: { id: materialId },
          select: { id: true, code: true, erpCodes: true, machine: true },
        });
        if (!material) return fail("Không tìm thấy vật tư đề xuất", 404);
        if (material.machine !== unit) return fail("Vật tư không thuộc tổ máy đã chọn");
        const allowedCodes = material.erpCodes.length ? material.erpCodes : [material.code];
        if (!allowedCodes.includes(erpCode)) return fail("Mã vật tư không thuộc tên vật tư đã chọn");
        data.proposalNote = proposalNote;
      }

      const up = await prisma.$transaction(async (tx) => {
        await tx.materialTicket.update({
          where: { id: t.id },
          data,
        });
        if (t.type === "DE_XUAT") {
          const materialId = String(body.materialId || "").trim();
          const erpCode = String(body.erpCode || "").trim();
          const proposedQuantity = Math.trunc(Number(body.proposedQuantity || body.quantity || 0));
          const replacementDeviceName = String(body.replacementDeviceName || "").trim();
          await tx.materialTicketItem.deleteMany({ where: { ticketId: t.id } });
          await tx.materialTicketItem.create({
            data: {
              ticketId: t.id,
              materialId,
              erpCode,
              quantity: proposedQuantity,
              deviceNameManual: replacementDeviceName,
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

    if (["HOAN_TAT", "TU_CHOI"].includes(t.status)) return fail("Phiếu đã khóa, không thể thao tác");

    /* ---------- helper kiểm tra items (dùng cho propose & ungEntry) ---------- */
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
        return {
          ticketId: t!.id,
          materialId: i.materialId,
          erpCode: i.erpCode || null,
          deviceSeq: manualName ? null : i.deviceSeq,
          deviceNameManual: manualName ?? null,
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
        return tx.materialTicket.update({
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

    // B1' — Trưởng Ca xác nhận (luồng cũ; giữ để tương thích phiếu cũ còn dang dở)
    if (action === "confirm") {
      if (t.type !== "DE_XUAT" || t.status !== "CHO_XAC_NHAN") return fail("Phiếu không ở bước Xác nhận");
      const assignedError = assignedPositionError(user, t);
      if (assignedError) return assignedError;
      if (!stepAllowedWithMap(await getWorkflowRoleMap(), "confirm", user))
        return fail("Bạn không có quyền xác nhận (Quản trị phân quyền ở mục Phân quyền quy trình)", 403);
      const short = t.items.filter((it) => it.quantity > it.material.quantity);
      if (short.length > 0) {
        return fail(
          "Tồn kho không đủ: " +
          short.map((s) => `${s.material.name} (cần ${s.quantity}, tồn ${s.material.quantity})`).join("; ") +
          " — chỉ có thể Từ chối phiếu."
        );
      }
      const up = await prisma.materialTicket.update({
        where: { id: t.id },
        data: {
          status: "CHO_THONG_KE",
          confirmedById: user.id, confirmedByName: user.name ?? "",
          confirmedByPosition: user.position ?? null, confirmedAt: new Date(),
        },
        include: ITEM_INCLUDE,
      });
      await audit(user.id, "MT_CONFIRM", "MaterialTicket", t.id, `${t.code}: xác nhận — kho đủ`);
      return ok(up);
    }

    // B1' — Từ chối khi vật tư không có/không đủ hoặc lý do khác. Phiếu đóng vĩnh viễn.
    if (action === "reject") {
      if (t.type !== "DE_XUAT" || !["CHO_XAC_NHAN", "VAT_TU_KHONG_CO"].includes(t.status)) return fail("Phiếu không ở bước có thể từ chối");
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
      if (t.type !== "DE_XUAT" || !["CHO_THONG_KE", "CHO_PHIEU__XUAT_KHO"].includes(t.status)) return fail("Phiếu không ở bước Thống kê");
      if (!isStats(user.position)) return fail("Chỉ cương vị Thống kê được thao tác bước này", 403);
      const num = String(body.proposalNumber || "").trim();
      if (!num) return fail("Vui lòng nhập số phiếu đề xuất vật tư");
      const up = await prisma.materialTicket.update({
        where: { id: t.id },
        data: {
          status: "NHAN_VAT_TU", proposalNumber: num,
          statsById: user.id, statsByName: user.name ?? "",
          statsByPosition: user.position ?? null, statsAt: new Date(),
        },
        include: ITEM_INCLUDE,
      });
      await audit(user.id, "MT_STATS", "MaterialTicket", t.id, `${t.code}: số phiếu ${num}`);
      return ok(up);
    }

    // B2' — NHẬN VẬT TƯ: khối lượng lãnh + hình thức lãnh → chuyển Sử dụng vật tư
    if (action === "receive") {
      if (t.type !== "DE_XUAT" || t.status !== "NHAN_VAT_TU") return fail("Phiếu không ở bước Nhận vật tư");
      const assignedError = assignedPositionError(user, t);
      if (assignedError) return assignedError;
      if (!stepAllowedWithMap(await getWorkflowRoleMap(), "receive", user))
        return fail("Bạn không có quyền ở bước Nhận vật tư (Quản trị phân quyền ở mục Phân quyền quy trình)", 403);
      const receivedQuantity = Math.trunc(Number(body.receivedQuantity));
      if (!Number.isFinite(receivedQuantity) || receivedQuantity <= 0) return fail("Khối lượng vật tư lãnh phải lớn hơn 0");
      const receivedMethod = String(body.receivedMethod || "").trim();
      if (!receivedMethod) return fail("Vui lòng nhập hình thức lãnh");
      const item = t.items[0];
      if (!item) return fail("Phiếu chưa có vật tư");
      const erpCode = item.erpCode || item.material.code;
      const erpRows = await prisma.$queryRaw<Array<{ erpStock: number }>>`
        SELECT "erpStock" FROM "ErpMaterial" WHERE "code" = ${erpCode} LIMIT 1
      `;
      if (erpRows.length === 0) return fail(`Không tìm thấy mã vật tư ERP "${erpCode}"`, 404);
      const before = item.material.quantity;
      const erpBefore = Number(erpRows[0]?.erpStock ?? 0);
      const erpAfter = Math.max(0, erpBefore - receivedQuantity);
      const up = await prisma.$transaction(async (tx) => {
        await tx.material.update({
          where: { id: item.materialId },
          data: { quantity: { increment: receivedQuantity } },
        });
        await tx.$executeRaw`
          UPDATE "ErpMaterial"
          SET "erpStock" = ${erpAfter}, "updatedAt" = NOW()
          WHERE "code" = ${erpCode}
        `;
        return tx.materialTicket.update({
          where: { id: t.id },
          data: {
            status: "SU_DUNG_VAT_TU",
            receivedQuantity, receivedMethod,
            receivedById: user.id, receivedByName: user.name ?? "",
            receivedByPosition: user.position ?? null, receivedAt: new Date(),
          },
          include: ITEM_INCLUDE,
        });
      });
      await audit(
        user.id, "MT_RECEIVE", "MaterialTicket", t.id,
        `${t.code}: lãnh ${receivedQuantity} (${receivedMethod}) — Hiện có ${item.material.code}: ${before} → ${before + receivedQuantity}; ERP ${erpCode}: ${erpBefore} → ${erpAfter}`
      );
      return ok(up);
    }

    // B2'' — SỬ DỤNG VẬT TƯ: PCT/LCT + chỉ huy + nội dung + khối lượng dùng.
    // Tồn kho đã cộng khối lượng lãnh ở bước Nhận vật tư; bước này trừ khối lượng dùng.
    if (action === "use") {
      if (t.type !== "DE_XUAT" || t.status !== "SU_DUNG_VAT_TU") return fail("Phiếu không ở bước Sử dụng vật tư");
      const assignedError = assignedPositionError(user, t);
      if (assignedError) return assignedError;
      if (!stepAllowedWithMap(await getWorkflowRoleMap(), "use", user))
        return fail("Bạn không có quyền ở bước Sử dụng vật tư (Quản trị phân quyền ở mục Phân quyền quy trình)", 403);
      const note = String(body.completionNote || "").trim();
      const pct = String(body.pctNumber || "").trim();
      const chiHuy = String(body.chiHuyName || "").trim();
      const usedQuantity = Math.trunc(Number(body.usedQuantity));
      if (!pct) return fail("Vui lòng nhập số PCT/LCT");
      if (!chiHuy) return fail("Vui lòng nhập tên chỉ huy trực tiếp (SCCN)");
      if (!note) return fail("Vui lòng nhập thông tin xác nhận thay thế xong");
      if (!Number.isFinite(usedQuantity) || usedQuantity <= 0) return fail("Khối lượng vật tư sử dụng phải lớn hơn 0");

      const item = t.items[0];
      if (!item) return fail("Phiếu chưa có vật tư");
      const received = t.receivedQuantity ?? 0;
      const remaining = received - usedQuantity;
      const mat = await prisma.material.findUnique({
        where: { id: item.materialId },
        select: { id: true, code: true, name: true, quantity: true },
      });
      if (!mat) return fail("Không tìm thấy vật tư trong Danh mục", 404);
      if (usedQuantity > mat.quantity) {
        return fail(`Số lượng vật tư sử dụng đã nhập vượt tồn kho. ${mat.name} hiện còn ${mat.quantity}; vui lòng nhập lại số lượng.`);
      }
      const newQty = mat.quantity - usedQuantity;

      const up = await prisma.$transaction(async (tx) => {
        if (newQty !== mat.quantity) {
          await tx.material.update({ where: { id: mat.id }, data: { quantity: newQty } });
        }
        return tx.materialTicket.update({
          where: { id: t.id },
          data: {
            status: "CHO_NGHIEM_THU",
            completionNote: note, pctNumber: pct, chiHuyName: chiHuy,
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
      if (t.type !== "DE_XUAT" || t.status !== "CHO_NGHIEM_THU") return fail("Phiếu không ở bước Nghiệm thu");
      const assignedError = assignedPositionError(user, t);
      if (assignedError) return assignedError;
      if (!stepAllowedWithMap(await getWorkflowRoleMap(), "accept", user))
        return fail("Bạn không có quyền nghiệm thu (Quản trị phân quyền ở mục Phân quyền quy trình)", 403);
      // PCT/chỉ huy/nội dung đã nhập ở bước SỬ DỤNG VẬT TƯ; phiếu cũ (trước khi có
      // bước này) vẫn nhận từ form nghiệm thu để tương thích.
      const note = String(body.completionNote || "").trim() || t.completionNote || "";
      const pct = String(body.pctNumber || "").trim() || t.pctNumber || "";
      const chiHuy = String(body.chiHuyName || "").trim() || t.chiHuyName || "";
      const bbkt = String(body.bbktNumber || "").trim(); // Số BBKT bổ sung ở bước này (nếu có)
      if (!note) return fail("Vui lòng nhập thông tin xác nhận thay thế xong");
      if (!pct) return fail("Vui lòng nhập số PCT/LCT");
      if (!chiHuy) return fail("Vui lòng nhập tên chỉ huy trực tiếp (SCCN)");

      const { url } = await generateBbntDoc({
        code: t.code, soBBKT: bbkt || t.bbktNumber, soPCT: pct, noiDung: note,
        tenChiHuy: chiHuy, tenTruongCa: user.name ?? "",
        tenVHV: t.proposedByName, chucVuVHV: t.proposedByPosition,
        items: toBbntItems(t),
      });
      const up = await prisma.materialTicket.update({
        where: { id: t.id },
        data: {
          status: "HOAN_TAT", completionNote: note, pctNumber: pct, chiHuyName: chiHuy, docUrl: url,
          ...(bbkt ? { bbktNumber: bbkt } : {}),
          completedById: user.id, completedByName: user.name ?? "",
          completedByPosition: user.position ?? null, completedAt: new Date(),
        },
        include: ITEM_INCLUDE,
      });
      await audit(user.id, "MT_ACCEPT", "MaterialTicket", t.id, `${t.code}: nghiệm thu, xuất BBNT`);
      return ok(up);
    }

    /* =================== LUỒNG ỨNG (xử lý gấp) =================== */

    // Ư1 — cương vị nhập số lượng vật tư ứng; số lượng này được cộng vào tồn kho.
    if (action === "ungAdvance") {
      if (t.type !== "UNG" || t.status !== "CHO_NHAP_LIEU") return fail("Phiếu không ở bước Nhập số lượng ứng");
      if (!isAssignedPosition(user, t))
        return fail(`Phiếu này được giao cho cương vị "${t.assignedPosition}" — bạn không có quyền nhập liệu`, 403);

      const submitted: Array<{ materialId: string; erpCode?: string; quantity: number }> = Array.isArray(body.items)
        ? body.items
        : [];
      if (submitted.length === 0) return fail("Phiếu phải có ít nhất 1 vật tư");
      const materials = await prisma.material.findMany({
        where: { id: { in: [...new Set(submitted.map((item) => item.materialId))] } },
        select: { id: true, code: true, erpCodes: true, machine: true },
      });
      const materialMap = new Map(materials.map((material) => [material.id, material]));
      const itemData: Array<{
        ticketId: string;
        materialId: string;
        erpCode: string;
        quantity: number;
        replacementQuantity: null;
        deviceSeq: null;
        deviceNameManual: null;
      }> = [];
      const itemKeys = new Set<string>();
      for (const item of submitted) {
        const quantity = Math.trunc(Number(item.quantity));
        const erpCode = String(item.erpCode || "").trim();
        const material = materialMap.get(item.materialId);
        if (!material || !erpCode || !Number.isFinite(quantity) || quantity <= 0) {
          return fail("Dòng vật tư ứng thiếu thông tin");
        }
        if (material.machine !== t.unit) return fail("Vật tư không thuộc tổ máy của phiếu");
        const allowedCodes = material.erpCodes.length ? material.erpCodes : [material.code];
        if (!allowedCodes.includes(erpCode)) return fail("Mã vật tư không thuộc tên vật tư đã chọn");
        const key = `${item.materialId}::${erpCode}`;
        if (itemKeys.has(key)) return fail("Mỗi mã vật tư chỉ nhập một lần trong phần số lượng ứng");
        itemKeys.add(key);
        itemData.push({
          ticketId: t.id,
          materialId: item.materialId,
          erpCode,
          quantity,
          replacementQuantity: null,
          deviceSeq: null,
          deviceNameManual: null,
        });
      }
      const quantityByMaterial = new Map<string, number>();
      for (const item of itemData) {
        quantityByMaterial.set(
          item.materialId,
          (quantityByMaterial.get(item.materialId) ?? 0) + item.quantity
        );
      }
      const stocksBefore = await prisma.material.findMany({
        where: { id: { in: [...quantityByMaterial.keys()] } },
        select: { id: true, code: true, quantity: true },
      });
      const up = await prisma.$transaction(async (tx) => {
        const claimed = await tx.materialTicket.updateMany({
          where: { id: t.id, status: "CHO_NHAP_LIEU" },
          data: { status: "CHO_NHAP_LIEU_THAY_THE" },
        });
        if (claimed.count === 0) return null;
        await tx.materialTicketItem.deleteMany({ where: { ticketId: t.id } });
        await tx.materialTicketItem.createMany({ data: itemData });
        for (const [materialId, quantity] of quantityByMaterial) {
          await tx.material.update({
            where: { id: materialId },
            data: { quantity: { increment: quantity } },
          });
        }
        return tx.materialTicket.update({
          where: { id: t.id },
          data: { status: "CHO_NHAP_LIEU_THAY_THE" },
          include: ITEM_INCLUDE,
        });
      });
      if (!up) return fail("Số lượng ứng đã được xác nhận trước đó, tồn kho không bị cộng lại");
      const stockDetail = stocksBefore.map((material) => {
        const added = quantityByMaterial.get(material.id) ?? 0;
        return `${material.code}: ${material.quantity} → ${material.quantity + added}`;
      }).join("; ");
      await audit(
        user.id,
        "MT_UNG_ADVANCE",
        "MaterialTicket",
        t.id,
        `${t.code}: xác nhận số lượng ứng — cộng tồn kho ${stockDetail}`
      );
      return ok(up);
    }

    // Ư2 — cương vị nhập liệu thay thế; số lượng thay thế được trừ khỏi tồn kho.
    if (action === "ungEntry") {
      if (t.type !== "UNG" || t.status !== "CHO_NHAP_LIEU_THAY_THE") return fail("Phiếu không ở bước Nhập liệu thay thế");
      if (!isAssignedPosition(user, t))
        return fail(`Phiếu này được giao cho cương vị "${t.assignedPosition}" — bạn không có quyền nhập liệu`, 403);
      const note = String(body.completionNote || "").trim();
      if (!note) return fail("Vui lòng nhập thông tin thay thế");

      const submitted: Array<{ itemId: string; deviceSeq: string; quantity: number }> = Array.isArray(body.replacementItems)
        ? body.replacementItems
        : [];
      const replacementRows: Array<{ itemId: string; deviceSeq: string; quantity: number }> = [];
      const rowKeys = new Set<string>();
      for (const item of submitted) {
        const quantity = Math.trunc(Number(item.quantity));
        const deviceSeq = String(item.deviceSeq || "").trim();
        if (!item.itemId || !deviceSeq || !Number.isFinite(quantity) || quantity <= 0) {
          return fail("Dòng nhập liệu thay thế thiếu thông tin");
        }
        const rowKey = `${item.itemId}::${deviceSeq}`;
        if (rowKeys.has(rowKey)) return fail("Mỗi thiết bị chỉ được chọn một lần cho cùng vật tư");
        rowKeys.add(rowKey);
        replacementRows.push({ itemId: item.itemId, deviceSeq, quantity });
      }
      const sourceItemMap = new Map(t.items.map((item) => [item.id, item]));
      if (t.items.length === 0 || t.items.some((item) => !replacementRows.some((row) => row.itemId === item.id))) {
        return fail("Vui lòng nhập đầy đủ thiết bị và số lượng thay thế cho từng vật tư");
      }
      if (replacementRows.some((row) => !sourceItemMap.has(row.itemId))) {
        return fail("Danh sách vật tư thay thế không hợp lệ");
      }

      const decls = await prisma.materialReplacement.findMany({
        where: { materialId: { in: [...new Set(t.items.map((item) => item.materialId))] }, isActive: false, deviceSeq: { not: null } },
        select: { id: true, materialId: true, deviceSeq: true, location: true, system: true, device: { select: { name: true } } },
      });
      const declSet = new Set(decls.filter((decl) => decl.device).map((decl) => `${decl.materialId}::${decl.deviceSeq}`));
      const manualDeclMap = new Map(
        decls.map((decl) => [`${decl.materialId}::manual:${decl.id}`, decl.location || decl.device?.name || decl.system || "Thiết bị nhập tay"])
      );
      for (const row of replacementRows) {
        const item = sourceItemMap.get(row.itemId)!;
        const key = `${item.materialId}::${row.deviceSeq}`;
        if (!declSet.has(key) && !manualDeclMap.has(key)) {
          return fail("Vật tư và thiết bị đã chọn không khớp danh mục vật tư");
        }
      }

      const replacementByMaterial = new Map<string, number>();
      const stocksBefore = new Map<string, { code: string; name: string; quantity: number }>();
      for (const row of replacementRows) {
        const item = sourceItemMap.get(row.itemId)!;
        replacementByMaterial.set(item.materialId, (replacementByMaterial.get(item.materialId) ?? 0) + row.quantity);
        stocksBefore.set(item.materialId, { code: item.material.code, name: item.material.name, quantity: item.material.quantity });
      }
      const insufficient = [...replacementByMaterial].filter(
        ([materialId, quantity]) => (stocksBefore.get(materialId)?.quantity ?? 0) < quantity
      );
      if (insufficient.length > 0) {
        return fail("Tồn kho không đủ: " + insufficient.map(([materialId, quantity]) => {
          const stock = stocksBefore.get(materialId);
          return `${stock?.name ?? "Vật tư"} (thay ${quantity}, tồn ${stock?.quantity ?? 0})`;
        }).join("; "));
      }

      const up = await prisma.$transaction(async (tx) => {
        const claimed = await tx.materialTicket.updateMany({
          where: { id: t.id, status: "CHO_NHAP_LIEU_THAY_THE" },
          data: { status: "CHO_XAC_NHAN_PDF" },
        });
        if (claimed.count === 0) return null;
        const replacementItemData = replacementRows.map((row) => {
          const sourceItem = sourceItemMap.get(row.itemId)!;
          const sourceRows = replacementRows.filter((candidate) => candidate.itemId === row.itemId);
          const sourceRowIndex = sourceRows.findIndex((candidate) => candidate === row);
          const manualName = manualDeclMap.get(`${sourceItem.materialId}::${row.deviceSeq}`);
          return {
            ticketId: t.id,
            materialId: sourceItem.materialId,
            erpCode: sourceItem.erpCode,
            quantity: sourceRowIndex === 0 ? sourceItem.quantity : 0,
            replacementQuantity: row.quantity,
            deviceSeq: manualName ? null : row.deviceSeq,
            deviceNameManual: manualName ?? null,
          };
        });
        await tx.materialTicketItem.deleteMany({ where: { ticketId: t.id } });
        await tx.materialTicketItem.createMany({ data: replacementItemData });
        for (const [materialId, quantity] of replacementByMaterial) {
          await tx.material.update({ where: { id: materialId }, data: { quantity: { decrement: quantity } } });
        }
        return tx.materialTicket.update({
          where: { id: t.id },
          data: {
            status: "CHO_XAC_NHAN_PDF", completionNote: note,
            proposedById: user.id, proposedByName: user.name ?? "",
            proposedByPosition: user.position ?? null, proposedAt: new Date(),
          },
          include: ITEM_INCLUDE,
        });
      });
      if (!up) return fail("Thông tin thay thế đã được xác nhận trước đó, tồn kho không bị trừ lại");
      const stockDetail = [...replacementByMaterial].map(([materialId, quantity]) => {
        const stock = stocksBefore.get(materialId)!;
        return `${stock.code}: ${stock.quantity} → ${stock.quantity - quantity}`;
      }).join("; ");
      await audit(user.id, "MT_UNG_ENTRY", "MaterialTicket", t.id, `${t.code}: nhập liệu thay thế — trừ tồn kho ${stockDetail}`);
      return ok(up);
    }

    // Ư3 — Trưởng Ca xác nhận & xuất Word (không nhập lại số lượng thay thế).
    if (action === "ungConfirmDoc") {
      if (t.type !== "UNG" || t.status !== "CHO_XAC_NHAN_PDF") return fail("Phiếu không ở bước Xác nhận xuất file");
      const assignedError = assignedPositionError(user, t);
      if (assignedError) return assignedError;
      if (!isShiftLeader(user.position)) return fail("Chỉ Trưởng Ca / Trưởng Kíp được xác nhận", 403);
      const pct = String(body.pctNumber || "").trim();
      const chiHuy = String(body.chiHuyName || "").trim();
      if (!pct) return fail("Vui lòng nhập số PCT/LCT");
      if (!chiHuy) return fail("Vui lòng nhập tên chỉ huy trực tiếp (SCCN)");

      const { url } = await generateBbntDoc({
        code: t.code, soBBKT: t.bbktNumber, soPCT: pct, noiDung: t.completionNote ?? "",
        tenChiHuy: chiHuy, tenTruongCa: user.name ?? "",
        tenVHV: t.proposedByName, chucVuVHV: t.proposedByPosition,
        items: toBbntItems(t),
      });
      const up = await prisma.$transaction(async (tx) => {
        const claimed = await tx.materialTicket.updateMany({
          where: { id: t.id, status: "CHO_XAC_NHAN_PDF" },
          data: { status: "CHO_HOAN_THIEN" },
        });
        if (claimed.count === 0) return null;
        return tx.materialTicket.update({
          where: { id: t.id },
          data: {
            status: "CHO_HOAN_THIEN", pctNumber: pct, chiHuyName: chiHuy, docUrl: url,
            completedById: user.id, completedByName: user.name ?? "",
            completedByPosition: user.position ?? null, completedAt: new Date(),
          },
          include: ITEM_INCLUDE,
        });
      });
      if (!up) return fail("Phiếu đã được xác nhận trước đó");
      await audit(user.id, "MT_UNG_DOC", "MaterialTicket", t.id, `${t.code}: xác nhận, xuất BBNT (chờ BBKT + thống kê)`);
      return ok(up);
    }

    // Ư3 song song — Trưởng Ca bổ sung số BBKT (tự sinh lại file Word với số thật)
    if (action === "ungBbkt") {
      if (t.type !== "UNG" || t.status !== "CHO_HOAN_THIEN") return fail("Phiếu không ở bước Hoàn thiện");
      const assignedError = assignedPositionError(user, t);
      if (assignedError) return assignedError;
      if (!isShiftLeader(user.position)) return fail("Chỉ Trưởng Ca / Trưởng Kíp được bổ sung BBKT", 403);
      if (t.bbktNumber) return fail("Số BBKT đã được bổ sung trước đó");
      const bbkt = String(body.bbktNumber || "").trim();
      if (!bbkt) return fail("Vui lòng nhập số BBKT");

      // Sinh lại file Word với số BBKT thật (ghi đè cùng key trên MinIO)
      const { url } = await generateBbntDoc({
        code: t.code, soBBKT: bbkt, soPCT: t.pctNumber, noiDung: t.completionNote ?? "",
        tenChiHuy: t.chiHuyName ?? "", tenTruongCa: t.completedByName ?? "",
        tenVHV: t.proposedByName, chucVuVHV: t.proposedByPosition,
        items: toBbntItems(t),
      });
      const done = !!t.proposalNumber;
      const up = await prisma.materialTicket.update({
        where: { id: t.id },
        data: { bbktNumber: bbkt, docUrl: url, ...(done ? { status: "HOAN_TAT" } : {}) },
        include: ITEM_INCLUDE,
      });
      await audit(user.id, "MT_UNG_BBKT", "MaterialTicket", t.id, `${t.code}: bổ sung ${bbkt}${done ? " — hoàn tất" : ""}`);
      return ok(up);
    }

    // Ư3 song song — Thống kê nhập số phiếu ĐXVT (KHÔNG khóa 2 ngày)
    if (action === "ungStats") {
      if (t.type !== "UNG" || t.status !== "CHO_HOAN_THIEN") return fail("Phiếu không ở bước Hoàn thiện");
      if (!isStats(user.position)) return fail("Chỉ cương vị Thống kê được thao tác bước này", 403);
      if (t.proposalNumber) return fail("Số phiếu ĐXVT đã được nhập trước đó");
      const num = String(body.proposalNumber || "").trim();
      if (!num) return fail("Vui lòng nhập số phiếu đề xuất vật tư");
      const done = !!t.bbktNumber;
      const up = await prisma.materialTicket.update({
        where: { id: t.id },
        data: {
          proposalNumber: num, statsById: user.id, statsByName: user.name ?? "", statsAt: new Date(),
          ...(done ? { status: "HOAN_TAT" } : {}),
        },
        include: ITEM_INCLUDE,
      });
      await audit(user.id, "MT_UNG_STATS", "MaterialTicket", t.id, `${t.code}: số phiếu ${num}${done ? " — hoàn tất" : ""}`);
      return ok(up);
    }

    return fail("Hành động không hợp lệ");
  });
}
