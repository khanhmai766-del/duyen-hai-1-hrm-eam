export type ContractStatus =
  | "DRAFT"
  | "ACTIVE"
  | "IN_PROGRESS"
  | "TECHNICAL_COMPLETION"
  | "COMPLETED"
  | "CLOSED"
  | "SUSPENDED"
  | "CANCELLED";

export type ContractWarning =
  | "Bình thường"
  | "Theo dõi"
  | "Sắp hết hạn"
  | "Khẩn"
  | "Đã hết hạn"
  | "Đã hoàn thành";

export interface Supervisor {
  id: string;
  fullName: string;
  department: string;
  role?: string;
}

export interface Contract {
  id: string;
  departmentIds?: string[];
  version?: number;

  // =========================================================
  // 1. THÔNG TIN NHẬN DIỆN
  // =========================================================
  stt: number;
  contractNumber: string;
  packageName: string;

  // =========================================================
  // 2. ĐƠN VỊ CHỦ TRÌ QUẢN LÝ HỢP ĐỒNG
  // =========================================================
  leadDepartment: string;

  // =========================================================
  // 3. NHÀ THẦU / ĐƠN VỊ THỰC HIỆN
  // =========================================================
  contractorId?: string;
  contractorName: string;
  contractorAddress?: string;
  contractorPhone?: string;
  contractorRepresentative?: string;

  // =========================================================
  // 4. NHÂN SỰ GIÁM SÁT
  // =========================================================
  supervisors: Supervisor[];

  // =========================================================
  // 5. GIAO HỢP ĐỒNG
  // =========================================================
  handoverDocument?: string;
  handoverDate?: string;

  // =========================================================
  // 6. THỜI GIAN HỢP ĐỒNG
  // =========================================================
  signedDate?: string;
  contractDurationDays?: number;
  serviceProvisionDurationDays?: number;
  serviceDurationText?: string;
  unitExecutionDurationDays?: number;
  unitExecutionContinuous?: boolean;
  unitExecutionTriggerText?: string;
  effectiveConditionText?: string;

  contractStartDate?: string;
  siteHandoverDate?: string;
  goodsEndDate?: string;
  serviceEndDate?: string;
  contractEndDate?: string;

  // =========================================================
  // 7. GIA HẠN
  // =========================================================
  isExtended: boolean;
  extendedUntil?: string;

  // =========================================================
  // 8. TRIỂN KHAI
  // =========================================================
  implementationInvitationDate?: string;

  // =========================================================
  // 9. TIẾN ĐỘ
  // =========================================================
  progressPercent: number;
  progressNote?: string;

  // =========================================================
  // 10. GHI NHẬN QUÁ TRÌNH THỰC HIỆN
  // =========================================================
  costNote?: string;
  managementDirection?: string;

  // =========================================================
  // 11. THANH TOÁN / QUYẾT TOÁN
  // =========================================================
  paymentSettlementStatus?: string;

  // =========================================================
  // 12. TRẠNG THÁI
  // =========================================================
  status: ContractStatus;

  // =========================================================
  // 13. HỒ SƠ / TÀI LIỆU
  // =========================================================
  googleDriveFolderUrl?: string;
}
