import type { KtktTx } from "../db/prisma";
import type { SessionUser } from "./auth/session";

/**
 * Ghi ô dữ liệu ngày (ctktkt_daily_inputs) kèm nhật ký sửa (ctktkt_daily_input_audit) bằng Prisma — bản giai đoạn 3 của
 * `auditedDailyBatch` (lib/daily-input-audit.ts, còn dùng cho các route chưa chuyển). Gọi trong `ktktWrite` để dữ liệu,
 * nhật ký và phiên bản đọc cùng một giao dịch: nhật ký lỗi thì không lưu gì.
 *
 * Mỗi thao tác chạy lần lượt (thao tác sau thấy kết quả thao tác trước — một ô gửi hai lần ra hai dòng nhật ký, như cũ):
 * 1. đọc giá trị + ghi chú hiện có (không có dòng → null, null);
 * 2. ghi nhật ký NẾU giá trị hoặc ghi chú đổi (so kiểu IS DISTINCT FROM): action delete / insert (chưa có dòng) / update;
 * 3. xoá, hoặc thêm/sửa (`keepNote`: sửa thì giữ ghi chú cũ, thêm mới thì ghi chú rỗng — như các route giữ ghi chú).
 */
export type DailyInputWrite =
  | { kind: "delete"; operatingDate: string; fieldCode: string }
  | { kind: "upsert"; operatingDate: string; fieldCode: string; value: string; note: string; keepNote?: false }
  | { kind: "upsert"; operatingDate: string; fieldCode: string; value: string; keepNote: true };

export async function writeDailyInputs(tx: KtktTx, user: SessionUser, source: string, writes: readonly DailyInputWrite[], updatedAt: string) {
  for (const write of writes) {
    const key = { operating_date_field_code: { operating_date: write.operatingDate, field_code: write.fieldCode } };
    const previous = await tx.ctktktDailyInputs.findUnique({ where: key, select: { value: true, note: true } });
    const oldValue = previous?.value ?? null, oldNote = previous?.note ?? null;
    const newValue = write.kind === "delete" ? null : write.value;
    const newNote = write.kind === "delete" ? null : write.keepNote ? (oldNote ?? "") : write.note;
    if (oldValue !== newValue || oldNote !== newNote) {
      await tx.ctktktDailyInputAudit.create({
        data: {
          actor_id: user.id, actor_username: user.username, actor_name: user.displayName, source,
          operating_date: write.operatingDate, field_code: write.fieldCode,
          action: write.kind === "delete" ? "delete" : oldValue === null ? "insert" : "update",
          old_value: oldValue, new_value: newValue, old_note: oldNote, new_note: newNote,
        },
      });
    }
    if (write.kind === "delete") {
      await tx.ctktktDailyInputs.deleteMany({ where: { operating_date: write.operatingDate, field_code: write.fieldCode } });
    } else {
      await tx.ctktktDailyInputs.upsert({
        where: key,
        create: { operating_date: write.operatingDate, field_code: write.fieldCode, value: write.value, note: write.keepNote ? "" : write.note },
        update: write.keepNote ? { value: write.value, updated_at: updatedAt } : { value: write.value, note: write.note, updated_at: updatedAt },
      });
    }
  }
}
