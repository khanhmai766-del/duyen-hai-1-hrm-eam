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
async function canManageTicket(
  user: { id: string; role?: string | null; position?: string | null },
  t: { createdById: string }
) {
  if (user.role === "ADMIN") return true;
  const map = await getWorkflowRoleMap();
  if (map.manage.length > 0) return stepAllowedWithMap(map, "manage", user);
  return t.createdById === user.id;
}

function toBbntItems(t: FullTicket): BbntItem[] {
  return t.items.map((it) => ({
    materialName: it.material.name,
    materialCode: it.material.code,
    materialUnit: it.material.unit,
    quantity: it.quantity,
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

    // Sửa THÔNG TIN CƠ BẢN của phiếu (Tổ máy, số BBKT, cương vị giao, loại vật tư).
    // Quản trị / cương vị được phân quyền "Sửa/Xoá phiếu" (chưa cấu hình: người tạo).
    if (action === "editInfo") {
      if (!(await canManageTicket(user, t)))
        return fail("Bạn không có quyền sửa phiếu (Quản trị phân quyền ở mục Phân quyền quy trình)", 403);
      const CATEGORIES = ["Dầu bôi trơn", "Lọc dầu", "Hóa chất", "Bi nghiền"];
      const unit = String(body.unit || "").trim();
      if (!["S1", "S2", "COMMON"].includes(unit)) return fail("Tổ máy không hợp lệ");
      const assignedPosition = String(body.assignedPosition || "").trim();
      if (!assignedPosition) return fail("Vui lòng chọn cương vị được giao");
      const scopeCount = await prisma.positionSystemScope.count({ where: { position: assignedPosition } });
      if (scopeCount === 0) return fail(`Cương vị "${assignedPosition}" chưa được phân giao hệ thống thiết bị`);
      const materialCategory = String(body.materialCategory || "").trim();
      if (!CATEGORIES.includes(materialCategory)) return fail("Vui lòng chọn loại vật tư");
      const bbkt = String(body.bbktNumber || "").trim(); // BBKT giờ là tuỳ chọn (bổ sung ở bước Nghiệm thu)
      const up = await prisma.materialTicket.update({
        where: { id: t.id },
        data: { unit, assignedPosition, materialCategory, bbktNumber: bbkt || t.bbktNumber },
        include: ITEM_INCLUDE,
      });
      await audit(user.id, "MT_EDIT_INFO", "MaterialTicket", t.id, `${t.code}: sửa thông tin phiếu`);
      return ok(up);
    }

    if (["HOAN_TAT", "TU_CHOI"].includes(t.status)) return fail("Phiếu đã khóa, không thể thao tác");

    /* ---------- helper ghi items (dùng cho propose & ungEntry) ---------- */
    async function validateAndWriteItems(): Promise<string | null> {
      const items: Array<{ materialId: string; deviceSeq: string; quantity: number }> =
        Array.isArray(body.items) ? body.items : [];
      if (items.length === 0) return "Phiếu phải có ít nhất 1 vật tư";

      for (const it of items) {
        if (!it.materialId || !it.deviceSeq || !(it.quantity >= 1)) return "Dòng vật tư thiếu thông tin";
      }
      // Mỗi cặp (vật tư, thiết bị) phải là điểm đã KHAI BÁO trong Danh mục vật tư
      // (dropdown thiết bị lấy từ chính danh sách này).
      const matIds = [...new Set(items.map((i) => i.materialId))];
      const decls = await prisma.materialReplacement.findMany({
        where: { materialId: { in: matIds }, isActive: false, deviceSeq: { not: null } },
        select: { materialId: true, deviceSeq: true },
      });
      const declSet = new Set(decls.map((d) => `${d.materialId}::${d.deviceSeq}`));
      for (const it of items) {
        if (!declSet.has(`${it.materialId}::${it.deviceSeq}`)) {
          return "Vật tư và thiết bị đã chọn không khớp danh mục vật tư";
        }
      }

      await prisma.materialTicketItem.deleteMany({ where: { ticketId: t!.id } });
      await prisma.materialTicketItem.createMany({
        data: items.map((i) => ({
          ticketId: t!.id, materialId: i.materialId, deviceSeq: i.deviceSeq, quantity: i.quantity,
        })),
      });
      return null;
    }

    /* =================== LUỒNG ĐỀ XUẤT =================== */

    // B1 — cương vị phân giao gửi đề xuất (luồng cũ; giữ để tương thích phiếu cũ còn dang dở)
    if (action === "propose") {
      if (t.type !== "DE_XUAT" || t.status !== "CHO_DE_XUAT") return fail("Phiếu không ở bước Đề xuất");
      if ((user.position ?? "") !== t.assignedPosition)
        return fail(`Phiếu này được giao cho cương vị "${t.assignedPosition}" — bạn không có quyền đề xuất`, 403);
      const err = await validateAndWriteItems();
      if (err) return fail(err);
      const up = await prisma.materialTicket.update({
        where: { id: t.id },
        data: {
          status: "CHO_XAC_NHAN",
          proposedById: user.id, proposedByName: user.name ?? "",
          proposedByPosition: user.position ?? null, proposedAt: new Date(),
        },
        include: ITEM_INCLUDE,
      });
      await audit(user.id, "MT_PROPOSE", "MaterialTicket", t.id, `${t.code}: gửi đề xuất`);
      return ok(up);
    }

    // B1' — Trưởng Ca xác nhận (luồng cũ; giữ để tương thích phiếu cũ còn dang dở)
    if (action === "confirm") {
      if (t.type !== "DE_XUAT" || t.status !== "CHO_XAC_NHAN") return fail("Phiếu không ở bước Xác nhận");
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
      if (!stepAllowedWithMap(await getWorkflowRoleMap(), "receive", user))
        return fail("Bạn không có quyền ở bước Nhận vật tư (Quản trị phân quyền ở mục Phân quyền quy trình)", 403);
      const receivedQuantity = Math.trunc(Number(body.receivedQuantity));
      if (!Number.isFinite(receivedQuantity) || receivedQuantity <= 0) return fail("Khối lượng vật tư lãnh phải lớn hơn 0");
      const receivedMethod = String(body.receivedMethod || "").trim();
      if (!receivedMethod) return fail("Vui lòng nhập hình thức lãnh");
      const up = await prisma.materialTicket.update({
        where: { id: t.id },
        data: {
          status: "SU_DUNG_VAT_TU",
          receivedQuantity, receivedMethod,
          receivedById: user.id, receivedByName: user.name ?? "",
          receivedByPosition: user.position ?? null, receivedAt: new Date(),
        },
        include: ITEM_INCLUDE,
      });
      await audit(user.id, "MT_RECEIVE", "MaterialTicket", t.id, `${t.code}: lãnh ${receivedQuantity} (${receivedMethod})`);
      return ok(up);
    }

    // B2'' — SỬ DỤNG VẬT TƯ: PCT/LCT + chỉ huy + nội dung + khối lượng dùng.
    // Còn lại = lãnh − dùng: dư (>0) cộng dồn vào tồn kho cùng mã vật tư;
    // đúng bằng (=0) tồn kho giữ nguyên (dùng hết phần lãnh); dùng vượt (<0)
    // phần vượt trừ vào tồn kho, không cho âm.
    if (action === "use") {
      if (t.type !== "DE_XUAT" || t.status !== "SU_DUNG_VAT_TU") return fail("Phiếu không ở bước Sử dụng vật tư");
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
      const newQty = remaining >= 0 ? mat.quantity + remaining : Math.max(0, mat.quantity + remaining);
      if (newQty !== mat.quantity) {
        await prisma.material.update({ where: { id: mat.id }, data: { quantity: newQty } });
      }

      const up = await prisma.materialTicket.update({
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
      await audit(
        user.id, "MT_USE", "MaterialTicket", t.id,
        `${t.code}: lãnh ${received}, dùng ${usedQuantity}, còn lại ${remaining} — tồn kho ${mat.code}: ${mat.quantity} → ${newQty}`
      );
      return ok(up);
    }

    // B3 — Trưởng Ca nghiệm thu: nhập PCT/LCT + nội dung + chỉ huy → xuất Word → HOÀN TẤT
    if (action === "accept") {
      if (t.type !== "DE_XUAT" || t.status !== "CHO_NGHIEM_THU") return fail("Phiếu không ở bước Nghiệm thu");
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

    // Ư1 — cương vị nhập liệu thay thế (đã thay gấp)
    if (action === "ungEntry") {
      if (t.type !== "UNG" || t.status !== "CHO_NHAP_LIEU") return fail("Phiếu không ở bước Nhập liệu");
      if ((user.position ?? "") !== t.assignedPosition)
        return fail(`Phiếu này được giao cho cương vị "${t.assignedPosition}" — bạn không có quyền nhập liệu`, 403);
      const note = String(body.completionNote || "").trim();
      if (!note) return fail("Vui lòng nhập thông tin thay thế");
      const err = await validateAndWriteItems();
      if (err) return fail(err);
      const up = await prisma.materialTicket.update({
        where: { id: t.id },
        data: {
          status: "CHO_XAC_NHAN_PDF", completionNote: note,
          proposedById: user.id, proposedByName: user.name ?? "",
          proposedByPosition: user.position ?? null, proposedAt: new Date(),
        },
        include: ITEM_INCLUDE,
      });
      await audit(user.id, "MT_UNG_ENTRY", "MaterialTicket", t.id, `${t.code}: nhập liệu thay thế`);
      return ok(up);
    }

    // Ư2 — Trưởng Ca xác nhận & xuất Word (BBKT in "(bổ sung sau)")
    if (action === "ungConfirmDoc") {
      if (t.type !== "UNG" || t.status !== "CHO_XAC_NHAN_PDF") return fail("Phiếu không ở bước Xác nhận xuất file");
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
      const up = await prisma.materialTicket.update({
        where: { id: t.id },
        data: {
          status: "CHO_HOAN_THIEN", pctNumber: pct, chiHuyName: chiHuy, docUrl: url,
          completedById: user.id, completedByName: user.name ?? "", completedAt: new Date(),
        },
        include: ITEM_INCLUDE,
      });
      await audit(user.id, "MT_UNG_DOC", "MaterialTicket", t.id, `${t.code}: xuất BBNT (chờ BBKT + thống kê)`);
      return ok(up);
    }

    // Ư3 song song — Trưởng Ca bổ sung số BBKT (tự sinh lại file Word với số thật)
    if (action === "ungBbkt") {
      if (t.type !== "UNG" || t.status !== "CHO_HOAN_THIEN") return fail("Phiếu không ở bước Hoàn thiện");
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
