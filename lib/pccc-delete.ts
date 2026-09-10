import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import {
  assertPcccScope,
  assertPeriodDeletable,
  clearSignature,
  resolvePcccWriteScope,
  type PcccScopeTable,
  type PcccTargetType,
} from "@/lib/pccc-service";

/**
 * XOÁ MỘT THIẾT BỊ KHỎI SỔ PCCC — khuôn chung cho cả tám loại.
 *
 * Tám route [id] chỉ khác nhau ở bảng Prisma và cái nhãn ghi vào nhật ký; chép tay tám lần
 * là tám chỗ để quên một rào. Ở đây các rào nằm một chỗ, đúng thứ tự:
 *
 *   1. Quyền GHI của sổ PCCC (`resolvePcccWriteScope` ném 403 luôn nếu không đủ);
 *   2. Công tắc XOÁ cấp kỳ do Quản trị bật, và kỳ phải còn ghi được (`assertPeriodDeletable`);
 *   3. Phạm vi cương vị của chính dòng đó (`assertPcccScope`).
 *
 * Chữ ký PHẢI xoá tay trước khi xoá dòng: `PcccSignature` trỏ vào dòng bằng cột thường chứ
 * không phải khoá ngoại, nên xoá dòng trước là để lại chữ ký mồ côi trỏ vào một id không
 * còn tồn tại — đúng cái bẫy mà route xoá cuộn vòi đã ghi chú từ trước. Các bảng linh kiện
 * thì đi theo cascade của khoá ngoại.
 */
export function pcccDeleteHandler<Row extends { id: string; cuongViCode?: string | null; period: { isClosed: boolean; label: string; year: number; monthNo: number; allowItemDeletion: boolean } }>(cfg: {
  /** Loại mục tiêu — dùng để xoá chữ ký đúng nhóm. */
  target: PcccTargetType;
  /** Bảng để nới phạm vi ghi (tủ chữa cháy / cuộn vòi có cương vị được giao trọn bảng). */
  scopeTable?: PcccScopeTable;
  /** Thông báo khi không đủ quyền ghi, vd "Không đủ quyền xoá bình chữa cháy". */
  denyMessage: string;
  /** Thông báo khi không tìm thấy dòng. */
  notFound: string;
  /** Tên hành động ghi vào nhật ký, vd "DELETE_PCCC_EXTINGUISHER". */
  auditAction: string;
  /** Tên bảng ghi vào nhật ký, vd "PcccExtinguisher". */
  entity: string;
  find(id: string): Promise<Row | null>;
  remove(id: string): Promise<unknown>;
  /** Mô tả dòng cho nhật ký — xoá xong không tra lại được nữa. */
  label(row: Row): string;
}) {
  return async function DELETE(_req: Request, { params }: { params: { id: string } }) {
    return handle(async () => {
      const user = await requireUser();
      const scope = await resolvePcccWriteScope(user, cfg.denyMessage, cfg.scopeTable);

      const current = await cfg.find(params.id);
      if (!current) return fail(cfg.notFound, 404);
      assertPeriodDeletable(current.period);
      assertPcccScope(scope, current);

      await clearSignature(cfg.target, current.id);
      await cfg.remove(current.id);

      await audit(
        user.id,
        cfg.auditAction,
        cfg.entity,
        current.id,
        auditDetailWithPosition(user, `${current.period.label} · ${cfg.label(current)}`),
        { beforeData: current }
      );
      return ok({ id: current.id });
    });
  };
}
