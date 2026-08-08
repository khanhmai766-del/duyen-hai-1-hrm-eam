import { ok, fail, requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { PCCC_PERMISSION } from "@/lib/pccc-service";
import { describeRollover, isLastDayOfMonth, runPcccRollover, vietnamClock } from "@/lib/pccc-rollover";

// exceljs + S3 cần Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/pccc/rollover — chạy TAY đúng cái mà bộ hẹn giờ vẫn chạy hằng tháng.
 *
 * Gộp "chốt kỳ" và "sinh kỳ mới" vào MỘT đường duy nhất là có chủ đích: hai việc đó
 * phải đi liền nhau (chốt xong mới sinh, và chốt thì bắt buộc phải xuất được file lên
 * S3). Tách làm hai nút như trước thì luôn có nguy cơ làm nửa vời — chốt mà quên sinh,
 * hoặc sinh kỳ mới trong khi kỳ cũ chưa hề được lưu trữ.
 *
 * body { closeCurrentPeriod?: true } — chốt luôn kỳ của tháng hiện tại. Chỉ nhận khi
 * hôm nay ĐÚNG là ngày cuối tháng; giữa tháng mà chốt là khoá mất bảng đang dùng.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, PCCC_PERMISSION.close, ["manage", "full"], "Không đủ quyền chuyển kỳ");

    const body = (await req.json().catch(() => ({}))) as { closeCurrentPeriod?: boolean };
    const clock = vietnamClock();
    if (body.closeCurrentPeriod && !isLastDayOfMonth(clock)) {
      return fail(
        `Hôm nay là ngày ${clock.day}, chưa phải ngày cuối tháng (${clock.lastDayOfMonth}) — chưa chốt kỳ đang mở được`,
        409
      );
    }

    const result = await runPcccRollover({
      closeCurrentPeriod: body.closeCurrentPeriod === true,
      actor: `${user.name ?? user.email ?? "Người dùng"} (chạy tay)`,
    });

    await audit(
      user.id,
      "ROLLOVER_PCCC_PERIOD",
      "PcccPeriod",
      result.closed[0]?.label ?? result.created[0] ?? "—",
      auditDetailWithPosition(user, `Chuyển kỳ PCCC: ${describeRollover(result)}`),
      { saveToAuditLog: true }
    );

    // Lỗi vẫn trả 200 kèm danh sách: một phần việc có thể đã xong (chốt được kỳ này,
    // hỏng ở kỳ kia) và người dùng cần thấy đủ cả hai vế.
    return ok(result, { summary: describeRollover(result) });
  });
}
