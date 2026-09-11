import { AuthenticationError } from "./request-context";

export function apiError(error: unknown) {
  if (error instanceof Response) return error;
  const correlationId = crypto.randomUUID();
  const dbCode = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (["42P01", "3F000", "42704"].includes(dbCode)) return Response.json({ message: "Phân hệ hợp đồng chưa được khởi tạo dữ liệu. Vui lòng liên hệ quản trị viên." }, { status: 503 });
  if (dbCode === "42501") return Response.json({ message: "Bạn không có quyền thực hiện thao tác này." }, { status: 403 });
  if (error instanceof AuthenticationError) {
    return Response.json({ error: "AUTHENTICATION_REQUIRED", message: "Vui lòng đăng nhập lại.", correlationId }, { status: 401 });
  }
  if (error instanceof SyntaxError) {
    return Response.json({ error: "INVALID_JSON", message: "Dữ liệu gửi lên không hợp lệ.", correlationId }, { status: 400 });
  }
  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
  if (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "23505") {
    return Response.json({ error: "SEQUENCE_CONFLICT", message: "Dữ liệu vừa thay đổi. Vui lòng tải lại và thử lại.", correlationId }, { status: 409 });
  }
  if (code === "SSO_USER_NOT_PROVISIONED") return Response.json({ error: code, message: "Tài khoản chưa được phân công sử dụng quản lý hợp đồng.", correlationId }, { status: 403 });
  if (code.startsWith("DEPARTMENT_NOT_FOUND")) return Response.json({ error: "DEPARTMENT_NOT_FOUND", message: "Đơn vị chưa được cấu hình trong hệ thống.", correlationId }, { status: 400 });
  if (code === "DEPARTMENT_CODE_CONFLICT") return Response.json({ error: code, message: "Mã đơn vị đã tồn tại.", correlationId }, { status: 409 });
  if (code === "CONTRACTOR_CODE_CONFLICT") return Response.json({ error: code, message: "Mã nhà thầu đã tồn tại.", correlationId }, { status: 409 });
  if (code === "CONTRACTOR_TAX_CODE_CONFLICT") return Response.json({ error: code, message: "Mã số thuế đã được sử dụng cho nhà thầu khác.", correlationId }, { status: 409 });
  if (code === "CONTRACTOR_CONCURRENT_UPDATE_OR_NOT_FOUND") return Response.json({ error: code, message: "Nhà thầu đã được cập nhật ở nơi khác. Hãy tải lại trước khi lưu.", correlationId }, { status: 409 });
  if (code === "CONTRACTOR_NOT_AVAILABLE" || code === "CONTRACTOR_REQUIRED") return Response.json({ error: code, message: "Hãy chọn một nhà thầu đang hoạt động trong danh mục.", correlationId }, { status: 400 });
  if (code === "SUPERVISION_DECISION_NUMBER_CONFLICT") return Response.json({ error: code, message: "Số quyết định này đã tồn tại trong hợp đồng.", correlationId }, { status: 409 });
  if (code === "SUPERVISION_DECISION_CONCURRENT_UPDATE_OR_NOT_FOUND") return Response.json({ error: code, message: "Quyết định đã được cập nhật ở nơi khác. Hãy tải lại trước khi lưu.", correlationId }, { status: 409 });
  if (code === "SUPERVISION_DECISION_IMMUTABLE") return Response.json({ error: code, message: "Quyết định đã ban hành chỉ được chuyển sang trạng thái bị thay thế hoặc thu hồi.", correlationId }, { status: 409 });
  if (code === "SUPERVISION_PERSONNEL_NOT_AVAILABLE") return Response.json({ error: code, message: "Nhân sự được chọn không tồn tại hoặc đã ngừng hoạt động.", correlationId }, { status: 400 });
  if (code === "SUPERVISION_REFERENCE_NOT_FOUND" || code === "SUPERVISION_CONTRACT_NOT_FOUND") return Response.json({ error: code, message: "Hợp đồng, phạm vi công việc hoặc nhân sự được chọn không còn tồn tại.", correlationId }, { status: 400 });
  if (code === "SUPERVISION_DECISION_NOT_FOUND") return Response.json({ error: code, message: "Không tìm thấy quyết định giám sát.", correlationId }, { status: 404 });
  if (code === "MILESTONE_CODE_CONFLICT") return Response.json({ error: code, message: "Mã mốc tiến độ đã tồn tại trong hợp đồng.", correlationId }, { status: 409 });
  if (code === "MILESTONE_CONCURRENT_UPDATE_OR_NOT_FOUND") return Response.json({ error: code, message: "Mốc tiến độ đã được cập nhật ở nơi khác. Hãy tải lại trước khi lưu.", correlationId }, { status: 409 });
  if (code === "INSPECTION_CODE_CONFLICT") return Response.json({ error: code, message: "Mã phiếu kiểm tra đã tồn tại trong hợp đồng.", correlationId }, { status: 409 });
  if (code === "INSPECTION_CONCURRENT_UPDATE_OR_NOT_FOUND") return Response.json({ error: code, message: "Phiếu kiểm tra đã được cập nhật ở nơi khác. Hãy tải lại trước khi lưu.", correlationId }, { status: 409 });
  if (code === "INSPECTION_CONTRACT_IMMUTABLE") return Response.json({ error: code, message: "Không được chuyển phiếu kiểm tra sang hợp đồng khác.", correlationId }, { status: 409 });
  if (code === "INSPECTION_PERSONNEL_NOT_AVAILABLE") return Response.json({ error: code, message: "Người kiểm tra không tồn tại hoặc đã ngừng hoạt động.", correlationId }, { status: 400 });
  if (code === "INSPECTION_REFERENCE_NOT_FOUND" || code === "INSPECTION_CONTRACT_NOT_FOUND") return Response.json({ error: code, message: "Hợp đồng, phạm vi hoặc hạng mục được chọn không còn tồn tại.", correlationId }, { status: 400 });
  if (code === "TECHNICAL_ISSUE_CODE_CONFLICT") return Response.json({ error: code, message: "Mã vấn đề đã tồn tại trong hợp đồng.", correlationId }, { status: 409 });
  if (code === "TECHNICAL_ISSUE_CONCURRENT_UPDATE_OR_NOT_FOUND") return Response.json({ error: code, message: "Vấn đề kỹ thuật đã được cập nhật ở nơi khác. Hãy tải lại trước khi lưu.", correlationId }, { status: 409 });
  if (code === "TECHNICAL_ISSUE_CONTRACT_IMMUTABLE") return Response.json({ error: code, message: "Không được chuyển vấn đề sang hợp đồng khác.", correlationId }, { status: 409 });
  if (code === "TECHNICAL_ISSUE_ASSIGNEE_NOT_AVAILABLE") return Response.json({ error: code, message: "Người phụ trách không tồn tại hoặc đã ngừng hoạt động.", correlationId }, { status: 400 });
  if (code === "TECHNICAL_ISSUE_REFERENCE_NOT_FOUND" || code === "TECHNICAL_ISSUE_CONTRACT_NOT_FOUND") return Response.json({ error: code, message: "Hợp đồng, phiếu kiểm tra, phạm vi hoặc hạng mục được chọn không còn tồn tại.", correlationId }, { status: 400 });
  if (code === "ACCEPTANCE_CODE_CONFLICT") return Response.json({ error: code, message: "Mã nghiệm thu đã tồn tại trong hợp đồng.", correlationId }, { status: 409 });
  if (code === "ACCEPTANCE_CONCURRENT_UPDATE_OR_NOT_FOUND") return Response.json({ error: code, message: "Biên bản nghiệm thu đã được cập nhật ở nơi khác. Hãy tải lại trước khi lưu.", correlationId }, { status: 409 });
  if (code === "ACCEPTANCE_CONTRACT_IMMUTABLE") return Response.json({ error: code, message: "Không được chuyển biên bản nghiệm thu sang hợp đồng khác.", correlationId }, { status: 409 });
  if (code === "ACCEPTANCE_PERSONNEL_NOT_AVAILABLE") return Response.json({ error: code, message: "Người xác nhận không tồn tại hoặc đã ngừng hoạt động.", correlationId }, { status: 400 });
  if (code === "ACCEPTANCE_REFERENCE_NOT_FOUND" || code === "ACCEPTANCE_CONTRACT_NOT_FOUND") return Response.json({ error: code, message: "Hợp đồng, phiếu kiểm tra, phạm vi hoặc hạng mục được chọn không còn tồn tại.", correlationId }, { status: 400 });
  if (code === "MILESTONE_REFERENCE_NOT_FOUND" || code === "MILESTONE_CONTRACT_NOT_FOUND") return Response.json({ error: code, message: "Hợp đồng, phạm vi, hạng mục hoặc người phụ trách không còn tồn tại.", correlationId }, { status: 400 });
  if (code === "MILESTONE_NOT_FOUND") return Response.json({ error: code, message: "Không tìm thấy mốc tiến độ.", correlationId }, { status: 404 });
  if (code === "MILESTONE_OWNER_NOT_AVAILABLE") return Response.json({ error: code, message: "Người phụ trách không tồn tại hoặc đã ngừng hoạt động.", correlationId }, { status: 400 });
  if (code === "PERSONNEL_IDENTITY_CONFLICT") return Response.json({ error: code, message: "Subject SSO hoặc tên đăng nhập đã tồn tại.", correlationId }, { status: 409 });
  if (code === "PERSONNEL_REFERENCE_NOT_FOUND") return Response.json({ error: code, message: "Đơn vị, hợp đồng hoặc vai trò không còn tồn tại.", correlationId }, { status: 400 });
  if (code === "PERSONNEL_CONCURRENT_UPDATE_OR_NOT_FOUND") return Response.json({ error: code, message: "Người dùng đã được cập nhật ở nơi khác. Hãy tải lại trước khi lưu.", correlationId }, { status: 409 });
  if (code === "SELF_ACCOUNT_CHANGE_FORBIDDEN") return Response.json({ error: code, message: "Không được tự sửa hoặc tự khóa tài khoản đang đăng nhập.", correlationId }, { status: 403 });
  if (code.includes("LAST_GLOBAL_SYSTEM_ADMIN_REQUIRED")) return Response.json({ error: "LAST_GLOBAL_SYSTEM_ADMIN_REQUIRED", message: "Hệ thống phải luôn còn ít nhất một quản trị viên toàn hệ thống đang hoạt động.", correlationId }, { status: 409 });
  if (code === "CONCURRENT_UPDATE_OR_NOT_FOUND") return Response.json({ error: code, message: "Dữ liệu đã được người khác cập nhật. Hãy tải lại trước khi lưu.", correlationId }, { status: 409 });
  if (code.includes("CONTRACT_ITEM_WEIGHT_TOTAL_EXCEEDED")) return Response.json({ error: "CONTRACT_ITEM_WEIGHT_TOTAL_EXCEEDED", message: "Tổng trọng số hạng mục không được vượt quá 100%.", correlationId }, { status: 400 });
  if (code === "ACCESS_DENIED") return Response.json({ error: code, message: "Bạn không có quyền thực hiện thao tác này.", correlationId }, { status: 403 });
  console.error("API error", correlationId, error);
  return Response.json({ error: "INTERNAL_ERROR", message: "Có lỗi máy chủ. Vui lòng cung cấp mã tra cứu cho IT.", correlationId }, { status: 500 });
}
