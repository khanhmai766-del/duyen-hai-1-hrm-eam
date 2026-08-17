import type { Prisma } from "@prisma/client";
import {
  equipmentSeqWhere,
  type EquipmentAccessContext,
} from "@/lib/server-access";

export type MaterialCatalogAccessWhere = {
  declaration: Prisma.MaterialReplacementWhereInput;
  replacement: Prisma.MaterialReplacementWhereInput;
  usage: Prisma.EquipmentMaterialWhereInput;
};

/**
 * Phạm vi thiết bị dùng cho Danh mục vật tư PXVH1.
 *
 * Một vật tư chỉ thuộc danh mục của cương vị khi có dòng khai báo
 * MaterialReplacement(isActive=false) gắn với thiết bị thật trong nhánh được Xem
 * hoặc Sửa. Thư mục tổng tổ máy là cấp 1 (parentSeq=null), nên dữ liệu nghiệp vụ
 * chỉ bắt đầu từ node có cha — cấp 2 trở xuống.
 */
export function materialCatalogAccessWhere(
  access: EquipmentAccessContext,
  fullCatalogView = false
): MaterialCatalogAccessWhere {
  // Quyền xem toàn bộ Danh mục (ADMIN, material-view mức manage/full hoặc cương vị
  // hành chính như Thống kê) phải thắng bộ lọc cây thiết bị ở LUỒNG ĐỌC này. Quyền
  // ghi vẫn được các route mutation kiểm tra riêng bằng access-context gốc.
  const replacementSeq = fullCatalogView
    ? null
    : equipmentSeqWhere(
        access.branchFilter,
        "deviceSeq"
      ) as Prisma.MaterialReplacementWhereInput | null;
  const usageSeq = fullCatalogView
    ? null
    : equipmentSeqWhere(
        access.branchFilter,
        "deviceSeq"
      ) as Prisma.EquipmentMaterialWhereInput | null;

  const linkedReplacement: Prisma.MaterialReplacementWhereInput = {
    deviceSeq: { not: null },
    device: { is: { parentSeq: { not: null } } },
    ...(replacementSeq ?? {}),
  };
  const replacement: Prisma.MaterialReplacementWhereInput = {
    OR: [
      linkedReplacement,
      // File Excel cho phép khai báo theo Hệ thống + Tên thiết bị mà không có
      // deviceSeq. Lấy các dòng này ra để route kiểm tra phạm vi theo tên hệ
      // thống bằng access-context (so khớp tiếng Việt đã chuẩn hoá).
      { deviceSeq: null, system: { not: null } },
    ],
  };

  return {
    replacement,
    declaration: { ...replacement, isActive: false },
    usage: {
      device: { parentSeq: { not: null } },
      ...(usageSeq ?? {}),
    },
  };
}
