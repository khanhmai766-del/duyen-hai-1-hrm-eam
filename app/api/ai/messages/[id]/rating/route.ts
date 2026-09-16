import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, handle, ok, requireUser } from "@/lib/api";
import { hasAssignedPermissionLevel } from "@/lib/rbac-permissions";

export const dynamic = "force-dynamic";

/**
 * Đánh giá MỘT câu trả lời: 1 = hữu ích, -1 = chưa đúng, 0 = bỏ đánh giá.
 *
 * Ghi vào hai chỗ: `AiMessage` để nút giữ trạng thái khi mở lại hội thoại, và `AiTurnLog` để
 * số liệu còn sau khi hội thoại tự xoá sau 14 ngày.
 */
export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    if (!(await hasAssignedPermissionLevel(user, "ai-chat", ["read", "personal", "manage", "full"]))) {
      return fail("Bạn chưa được phân quyền sử dụng trợ lý AI", 403);
    }
    const { id } = await context.params;
    const body = await req.json().catch(() => null) as { rating?: unknown } | null;
    const rating = Number(body?.rating);
    if (![1, -1, 0].includes(rating)) return fail("Giá trị đánh giá không hợp lệ");

    const message = await prisma.aiMessage.findFirst({
      where: { id, role: "ASSISTANT", conversation: { userId: user.id } },
      select: { id: true },
    });
    if (!message) return fail("Không tìm thấy câu trả lời cần đánh giá", 404);

    const value = rating === 0 ? null : rating;
    await prisma.aiMessage.update({
      where: { id: message.id },
      data: { rating: value, ratedAt: value === null ? null : new Date() },
    });
    // Không có dòng số liệu tương ứng (lượt hỏi từ trước khi có bảng) thì bỏ qua, không báo lỗi.
    await prisma.aiTurnLog.updateMany({ where: { messageId: message.id }, data: { rating: value } });

    return ok({ id: message.id, rating: value });
  });
}
