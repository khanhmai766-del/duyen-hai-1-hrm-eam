import type { PrismaClient } from "@prisma/client";
import { getMaterialAnnualPlanSummary } from "@/lib/material-annual-plan-summary";

/**
 * Bộ nhớ đệm trong tiến trình cho phần tổng hợp kế hoạch vật tư năm.
 *
 * VÌ SAO CẦN: `getMaterialAnnualPlanSummary` tốn 12 truy vấn và quét toàn bộ lịch sử thay thế
 * của cả năm, nhưng lại là lõi dùng chung của BỐN đầu API:
 *   /api/material-annual-plans           (màn Kế hoạch vật tư năm)
 *   /api/material-annual-plans/monthly   (màn Nhu cầu vật tư tháng — mỗi lần đổi tháng một lượt)
 *   /api/material-annual-plans/monthly/export
 *   /api/material-annual-plans/forecast  (dự toán năm sau — còn gọi lại lần nữa bên trong)
 * Bấm qua lại 12 tháng của một năm nghĩa là dựng lại y hệt một bảng số 12 lần.
 *
 * Đệm giữ PROMISE chứ không giữ kết quả, nên hai người mở cùng một năm trong lúc lượt tính đầu
 * còn đang chạy sẽ dùng chung đúng một lượt thay vì chạy song song hai lượt.
 *
 * TTL ngắn + xoá đệm tại các điểm ghi quan trọng (quyết toán phiếu, nhập kế hoạch năm, chốt/mở
 * kỳ sổ hóa chất). Điểm ghi nào chưa gắn xoá đệm thì chậm nhất 60 giây sau tự tươi lại.
 *
 * LƯU Ý VẬN HÀNH: đệm nằm trong RAM của tiến trình, chỉ đúng khi app chạy MỘT tiến trình
 * (pm2 1 instance) — cùng giả định với `lib/material-workflow.ts` và `lib/rbac-permissions.ts`.
 */

const CACHE_TTL_MS = 60_000;

type Summary = Awaited<ReturnType<typeof getMaterialAnnualPlanSummary>>;
type CacheEntry = { value: Promise<Summary>; expiresAt: number };

const cache = new Map<number, CacheEntry>();

/**
 * Bản tổng hợp của một năm, dùng lại kết quả còn hạn.
 *
 * Mọi đường ĐỌC nên đi qua đây. Đường GHI (script nhập liệu, tác vụ nền cần số tuyệt đối tươi)
 * gọi thẳng `getMaterialAnnualPlanSummary` để không đọc phải bản đệm.
 */
export function getCachedMaterialAnnualPlanSummary(prisma: PrismaClient, year: number): Promise<Summary> {
  const now = Date.now();
  const cached = cache.get(year);
  if (cached && cached.expiresAt > now) return cached.value;

  const value = getMaterialAnnualPlanSummary(prisma, year);
  cache.set(year, { value, expiresAt: now + CACHE_TTL_MS });
  // Lỗi KHÔNG được nằm lại trong đệm: một lần mất kết nối DB sẽ khoá cả năm đó suốt TTL.
  value.catch(() => {
    if (cache.get(year)?.value === value) cache.delete(year);
  });
  return value;
}

/**
 * Xoá đệm sau khi ghi dữ liệu làm đổi con số của biểu.
 *
 * Không truyền năm thì xoá sạch — dùng cho thao tác đụng tới nhiều năm cùng lúc (sửa lịch sử
 * thay thế, đổi mã thiết bị) hoặc khi không tra được năm một cách chắc chắn.
 */
export function invalidateMaterialAnnualPlanCache(year?: number) {
  if (year === undefined) cache.clear();
  else cache.delete(year);
}
