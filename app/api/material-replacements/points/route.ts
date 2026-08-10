import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handle, ok, requireUser } from "@/lib/api";
import { resolveEquipmentAccessForUser } from "@/lib/server-access";
import { canViewMaterialReplacement } from "@/lib/material-replacement-access";
import { resolvePositionViewScope } from "@/lib/position-data-scope";
import { materialCategoryMatches, replacementDueStatus } from "@/lib/constants";
import { normalizeText } from "@/lib/nav";
import { positionsMatch } from "@/lib/position-catalog";

export const dynamic = "force-dynamic";

/**
 * Danh sách ĐIỂM KHAI BÁO (isActive=false, chưa có lịch sử) để chọn khi ra SYC thay
 * thế ngay trong form Nhập khiếm khuyết — "cửa phụ" của luồng bên Danh mục vật tư.
 *
 * Chỉ trả điểm đã gắn thiết bị trên cây: điểm chưa gắn thì không dựng được phiếu.
 * Lọc theo đúng tổ máy + cương vị người dùng đang chọn ở form, nên danh sách luôn
 * gộp được vào một phiếu duy nhất (cùng ràng buộc mà resolveMaterialRequest kiểm lại).
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const access = await resolveEquipmentAccessForUser(user);
    // Cùng rào cương vị với trang Lịch thay thế: danh sách điểm để ra SYC không được
    // bày điểm ngoài phạm vi, nếu không đây thành cửa phụ đọc dữ liệu cương vị khác.
    const viewScope = await resolvePositionViewScope(user, "replacement");
    const sp = req.nextUrl.searchParams;
    const machine = sp.get("machine")?.trim();
    const position = sp.get("position")?.trim();
    const category = sp.get("category")?.trim();
    const q = sp.get("q")?.trim();

    // Không có tổ máy + cương vị thì tập kết quả vô nghĩa (trải toàn nhà máy).
    if (!machine || !position) return ok([]);

    const where: Prisma.MaterialReplacementWhereInput = {
      isActive: false,
      logs: { none: {} },
      deviceSeq: { not: null },
      machine,
    };

    const rows = await prisma.materialReplacement.findMany({
      where,
      orderBy: [{ nextDueAt: "asc" }],
      select: {
        id: true,
        deviceSeq: true,
        machine: true,
        system: true,
        location: true,
        quantity: true,
        deviceCount: true,
        intervalMonths: true,
        intervalNote: true,
        lastReplacedAt: true,
        nextDueAt: true,
        managingPosition: true,
        material: { select: { id: true, code: true, name: true, unit: true, category: true } },
        device: { select: { seq: true, name: true, parentSeq: true, childCount: true } },
        // Điểm đã có phiếu chưa xử lý xong thì cảnh báo ngay trên danh sách chọn.
        defectRequests: {
          where: { defect: { status: { not: "DA_XU_LY" }, cancelledAt: null } },
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { defect: { select: { requestNumber: true } } },
        },
      },
    });

    // Cương vị so khớp qua positionsMatch (chịu được đổi tên/khác dấu), category qua
    // materialCategoryMatches — cùng quy ước với phần còn lại của Danh mục vật tư.
    const keyword = q ? normalizeText(q) : "";
    const filtered = rows.filter((row) => {
      if (!positionsMatch(row.managingPosition, position)) return false;
      if (category && !materialCategoryMatches(row.material.category, category)) return false;
      if (!canViewMaterialReplacement(access, row, viewScope)) return false;
      if (!keyword) return true;
      return normalizeText(
        [row.material.name, row.material.code, row.system, row.device?.name, row.location]
          .filter(Boolean)
          .join(" ")
      ).includes(keyword);
    });

    const parentNames = new Map<string, string>();
    const parentSeqs = [...new Set(filtered.map((row) => row.device?.parentSeq).filter(Boolean) as string[])];
    if (parentSeqs.length > 0) {
      const parents = await prisma.equipmentNode.findMany({
        where: { seq: { in: parentSeqs } },
        select: { seq: true, name: true },
      });
      for (const parent of parents) parentNames.set(parent.seq, parent.name);
    }

    return ok(
      filtered.map((row) => ({
        id: row.id,
        materialId: row.material.id,
        materialName: row.material.name,
        materialCode: row.material.code,
        materialUnit: row.material.unit,
        category: row.material.category,
        deviceSeq: row.deviceSeq,
        deviceName: row.device?.name ?? row.location ?? "",
        // Node còn con = THƯ MỤC: phiếu sẽ neo vào chính nó, cột Thiết bị nhận tên thư mục.
        deviceIsFolder: (row.device?.childCount ?? 0) > 0,
        systemName: (row.device?.parentSeq ? parentNames.get(row.device.parentSeq) : null) ?? row.system ?? "",
        managingPosition: row.managingPosition,
        machine: row.machine,
        quantity: Math.max(0, row.quantity) * Math.max(1, row.deviceCount || 1),
        intervalMonths: row.intervalMonths,
        intervalNote: row.intervalNote,
        lastReplacedAt: row.lastReplacedAt,
        nextDueAt: row.nextDueAt,
        dueStatus: row.intervalMonths > 0 ? replacementDueStatus(row.nextDueAt) : null,
        openRequestNumber: row.defectRequests[0]?.defect.requestNumber ?? null,
      }))
    );
  });
}
