import type { Prisma } from "@prisma/client";

/**
 * Điều kiện của các phiếu còn hiện trên trang Khiếm khuyết (bảng Tồn đọng). Trang
 * web và báo cáo Telegram dùng chung để số trong báo cáo luôn bằng số người dùng
 * thấy trên web.
 */
export function activeDefectWhere(now: Date = new Date()): Prisma.DefectWhereInput {
  const completedCutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  return {
    AND: [{
      // Đã xác nhận lưu lịch sử thì phiếu chuyển hẳn sang trang Lịch sử sửa
      // chữa (hiện ở đó với trạng thái Chờ chốt), không còn nằm ở bảng Khiếm
      // khuyết nữa để tránh một phiếu xuất hiện ở hai nơi.
      pendingHistory: { is: null },
    }, {
      // Phiếu hủy chỉ còn ở Tồn đọng trong lúc chờ ACK ghi ngược lên Sheet.
      OR: [
        { cancelledAt: null },
        { syncState: { not: "CONFIRMED" } },
      ],
    }, {
      OR: [
      {
        sourceType: "GOOGLE_SHEETS",
        syncState: { not: "CONFIRMED" },
      },
      {
        sourceType: { not: "GOOGLE_SHEETS" },
        status: { not: "DA_XU_LY" },
      },
      // Phiếu còn chờ vật tư phải ở lại Tồn đọng cho đến khi VHV bỏ đánh dấu.
      { status: "DA_XU_LY", postRepairAwaitingMaterial: true },
      // Phiếu đã xử lý bình thường ở lại 14 ngày để VHV có thể xem lại.
      {
        sourceType: { not: "GOOGLE_SHEETS" },
        status: "DA_XU_LY",
        postRepairAwaitingMaterial: false,
        completedAt: { gte: completedCutoff },
      },
      ],
    }],
  };
}

type OutstandingDefectState = {
  status: string;
  postRepairAwaitingMaterial: boolean;
};

/**
 * Phiếu còn là công việc phải xử lý, không tính phiếu Đã xử lý chỉ đang được giữ
 * lại 14 ngày để tra cứu. Cờ chờ vật tư sau xử lý vẫn được tính là tồn đọng.
 */
export function isOutstandingDefect(defect: OutstandingDefectState) {
  return defect.status !== "DA_XU_LY" || defect.postRepairAwaitingMaterial;
}

/** Điều kiện SQL tương ứng với isOutstandingDefect(), dùng chung cho KPI và cảnh báo. */
export function outstandingDefectWhere(now: Date = new Date()): Prisma.DefectWhereInput {
  return {
    AND: [
      activeDefectWhere(now),
      { cancelledAt: null },
      {
        OR: [
          { status: { not: "DA_XU_LY" } },
          { postRepairAwaitingMaterial: true },
        ],
      },
    ],
  };
}
