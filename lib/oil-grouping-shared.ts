// Hằng số và hàm thuần của phần gom nhóm vật tư ERP — KHÔNG chạm Prisma, KHÔNG chạm DB.
//
// Tách khỏi `lib/oil-grouping-sync.ts` vì màn hình chạy ở TRÌNH DUYỆT cũng cần mấy thứ này
// (OilGroupingPage và Danh mục vật tư). File kia import `@/lib/prisma`; trước đây webpack
// còn rũ bỏ được nhánh không dùng, nhưng đó là may chứ không phải bảo đảm — đến khi
// `lib/prisma.ts` đổi hình dạng (thêm middleware) thì cả PrismaClient bị gói vào bundle
// trình duyệt và hai trang vật tư trắng xoá với "Application error" (18/08/2026).
//
// Nguyên tắc từ đây: thứ gì client cần thì đặt ở file này; `oil-grouping-sync.ts` chỉ giữ
// phần thật sự phải nói chuyện với cơ sở dữ liệu.

// Các loại vật tư được gom nhóm (khớp Material.category / ErpMaterial.category).
export const GROUPABLE_CATEGORIES = ["Dầu bôi trơn", "Lõi lọc dầu", "Thiết bị C&I", "Hóa Chất", "Chai Khí", "Bi Nghiền Than", "Văn phòng phẩm", "Dụng cụ sơn", "Khác"] as const;
export type GroupableCategory = (typeof GROUPABLE_CATEGORIES)[number];
export const STANDALONE_GROUP_PREFIX = "__SINGLE__";

/**
 * MÃ TẠM cho vật tư khai tay khi CHƯA BIẾT mã ERP. Cột `code` là khoá duy nhất và là thứ
 * mọi nơi dùng để đối chiếu (gom nhóm, lấy tồn từ QLVT, phiếu đề xuất), để trống thì
 * không thể có hai dòng cùng rỗng. Vậy nên sinh mã tạm duy nhất rồi ẨN khỏi màn hình; khi
 * biết mã thật thì sửa lại ở hộp thoại sửa mã vật tư.
 *
 * Mã tạm KHÔNG bao giờ khớp dữ liệu QLVT nên tồn kho của dòng đó giữ nguyên số nhập tay,
 * không bị đồng bộ ghi đè về 0.
 */
export const PENDING_ERP_CODE_PREFIX = "__CHUA-CO-MA__";

export function isPendingErpCode(code?: string | null) {
  return Boolean(code?.startsWith(PENDING_ERP_CODE_PREFIX));
}

/** Mã hiển thị trên giao diện — mã tạm thì trả rỗng để nơi gọi tự hiện "Chưa có mã". */
export function displayErpCode(code?: string | null) {
  return isPendingErpCode(code) ? "" : (code ?? "");
}

export function isGroupableCategory(value: unknown): value is GroupableCategory {
  return typeof value === "string" && (GROUPABLE_CATEGORIES as readonly string[]).includes(value);
}
