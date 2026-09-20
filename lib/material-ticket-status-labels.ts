import { RECOVERY_HANDOVER_STATUS } from "@/lib/constants";

/**
 * Nhãn tiếng Việt cho `MaterialTicket.status`, dùng ở phía server (Telegram).
 * Đồng bộ nội dung với STATUS map trong components/materials/MaterialTicketBoard.tsx
 * (map đó là client-only nên không import thẳng được) — sửa nhãn thì sửa cả hai nơi.
 */
export const MATERIAL_TICKET_STATUS_LABEL: Record<string, string> = {
  CHO_DE_XUAT: "Chờ đề xuất",
  CHO_XAC_NHAN: "Chờ xác nhận",
  CHO_XAC_NHAN_PHAT: "Chờ Thống Kê xác nhận ĐXVT",
  CHO_PHIEU__XUAT_KHO: "Chờ Thống Kê xác nhận ĐXVT",
  VAT_TU_KHONG_CO: "Vật tư không có",
  CHO_THONG_KE: "Chờ thống kê",
  VHV_LANH_VAT_TU: "Chờ VHV lãnh vật tư",
  NHAN_TU_HIEN_CO: "Nhận vật tư hiện có",
  NHAN_VAT_TU: "Xác nhận vật tư lãnh",
  CHO_PHIEU_YCSC: "Đã lãnh vật tư · Chờ xử lý SYC",
  SU_DUNG_VAT_TU: "Sử dụng vật tư",
  CHO_NGHIEM_THU: "Chờ nghiệm thu",
  CHO_TRA_VO: "Chờ xác nhận trả",
  [RECOVERY_HANDOVER_STATUS]: "Chờ trả phiếu vật tư thu hồi",
  CHO_QUYET_TOAN: "Chờ quyết toán",
  CHO_THONG_KE_XUAT_BIEN_BAN: "Chờ Thống kê xác nhận mã",
  CHO_NHAP_LIEU: "Chờ nhập số lượng ứng",
  CHO_NHAP_LIEU_THAY_THE: "Chờ nhập liệu thay thế",
  CHO_XAC_NHAN_PDF: "Chờ xác nhận xuất file",
  CHO_HOAN_THIEN: "Chờ hoàn thiện hồ sơ",
  HOAN_TAT: "Hoàn tất",
  TU_CHOI: "Từ chối",
};

export function materialTicketStatusLabel(status: string) {
  return MATERIAL_TICKET_STATUS_LABEL[status] ?? status;
}
