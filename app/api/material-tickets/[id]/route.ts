import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import {
  isShiftLeader, isStats, statsLockRemaining,
} from "@/lib/material-workflow";
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

function toBbntItems(t: FullTicket): BbntItem[] {
  return t.items.map((it) => ({
    materialName: it.material.name,
    materialCode: it.material.code,
    materialUnit: it.material.unit,
    quantity: it.quantity,
    deviceName: it.device.name,
    deviceKks: it.device.kks,
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

// PUT /api/material-tickets/[id]   { action, ...payload }
// Mọi khóa (trạng thái × cương vị × phạm vi × 2 ngày) thi hành TẠI ĐÂY.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json();
    const action = String(body.action || "");
    const t = await getTicket(params.id);
    if (!t) return fail("Không tìm thấy phiếu", 404);
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

    // B1 — cương vị phân giao gửi đề xuất
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

    // B1' — Trưởng Ca xác nhận (server tự check tồn kho)
    if (action === "confirm") {
      if (t.type !== "DE_XUAT" || t.status !== "CHO_XAC_NHAN") return fail("Phiếu không ở bước Xác nhận");
      if (!isShiftLeader(user.position)) return fail("Chỉ Trưởng Ca / Trưởng Kíp được xác nhận", 403);
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
          confirmedById: user.id, confirmedByName: user.name ?? "", confirmedAt: new Date(),
        },
        include: ITEM_INCLUDE,
      });
      await audit(user.id, "MT_CONFIRM", "MaterialTicket", t.id, `${t.code}: xác nhận — kho đủ`);
      return ok(up);
    }

    // B1' — Từ chối (kho thiếu / lý do khác). Phiếu đóng vĩnh viễn.
    if (action === "reject") {
      if (t.type !== "DE_XUAT" || t.status !== "CHO_XAC_NHAN") return fail("Phiếu không ở bước Xác nhận");
      if (!isShiftLeader(user.position)) return fail("Chỉ Trưởng Ca / Trưởng Kíp được từ chối", 403);
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

    // B2 — Thống kê nhập số phiếu ĐXVT (khóa tối thiểu 2 ngày sau xác nhận)
    if (action === "stats") {
      if (t.type !== "DE_XUAT" || t.status !== "CHO_THONG_KE") return fail("Phiếu không ở bước Thống kê");
      if (!isStats(user.position)) return fail("Chỉ cương vị Thống kê được thao tác bước này", 403);
      const left = statsLockRemaining(t.confirmedAt);
      if (left > 0) {
        const h = Math.ceil(left / 3600e3);
        return fail(`Chưa đủ 2 ngày kể từ khi xác nhận — còn ${Math.floor(h / 24)} ngày ${h % 24} giờ`);
      }
      const num = String(body.proposalNumber || "").trim();
      if (!num) return fail("Vui lòng nhập số phiếu đề xuất vật tư");
      const up = await prisma.materialTicket.update({
        where: { id: t.id },
        data: { status: "CHO_NGHIEM_THU", proposalNumber: num, statsById: user.id, statsByName: user.name ?? "", statsAt: new Date() },
        include: ITEM_INCLUDE,
      });
      await audit(user.id, "MT_STATS", "MaterialTicket", t.id, `${t.code}: số phiếu ${num}`);
      return ok(up);
    }

    // B3 — Trưởng Ca nghiệm thu: nhập PCT/LCT + nội dung + chỉ huy → xuất Word → HOÀN TẤT
    if (action === "accept") {
      if (t.type !== "DE_XUAT" || t.status !== "CHO_NGHIEM_THU") return fail("Phiếu không ở bước Nghiệm thu");
      if (!isShiftLeader(user.position)) return fail("Chỉ Trưởng Ca / Trưởng Kíp được nghiệm thu", 403);
      const note = String(body.completionNote || "").trim();
      const pct = String(body.pctNumber || "").trim();
      const chiHuy = String(body.chiHuyName || "").trim();
      if (!note) return fail("Vui lòng nhập thông tin xác nhận thay thế xong");
      if (!pct) return fail("Vui lòng nhập số PCT/LCT");
      if (!chiHuy) return fail("Vui lòng nhập tên chỉ huy trực tiếp (SCCN)");

      const { url } = await generateBbntDoc({
        code: t.code, soBBKT: t.bbktNumber, soPCT: pct, noiDung: note,
        tenChiHuy: chiHuy, tenTruongCa: user.name ?? "",
        tenVHV: t.proposedByName, chucVuVHV: t.proposedByPosition,
        items: toBbntItems(t),
      });
      const up = await prisma.materialTicket.update({
        where: { id: t.id },
        data: {
          status: "HOAN_TAT", completionNote: note, pctNumber: pct, chiHuyName: chiHuy, docUrl: url,
          completedById: user.id, completedByName: user.name ?? "", completedAt: new Date(),
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
