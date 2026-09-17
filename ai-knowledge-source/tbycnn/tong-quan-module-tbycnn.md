# Tổng quan Module TBYCNN trên web nội bộ

> TBYCNN = **Thiết bị yêu cầu nghiêm ngặt về an toàn lao động** (theo cách gọi trong hồ sơ
> nhà máy) — ví dụ bình chịu áp lực, thiết bị nâng, thang máy... loại thiết bị pháp luật
> yêu cầu phải kiểm định định kỳ bởi đơn vị kiểm định độc lập.
>
> Tài liệu này mô tả **module ghi sổ trên web nội bộ** (trang `/tbycnn`) — nơi lưu lại
> thông tin kiểm định đã có, không phải quy trình kiểm định kỹ thuật hay quy định pháp
> luật về TBYCNN. Muốn biết tiêu chuẩn kiểm định, quy trình kỹ thuật hay hạn kiểm định
> chính xác của một thiết bị cụ thể, tra hồ sơ kiểm định gốc hoặc hỏi đơn vị kiểm định.

## Module này theo dõi cái gì

Mỗi dòng trong sổ TBYCNN là **một thiết bị** thuộc diện phải kiểm định nghiêm ngặt,
gắn với một **kỳ** (theo tháng, ví dụ "2026-09"). Thông tin lưu cho mỗi thiết bị gồm:

- Tên thiết bị, vị trí lắp đặt, cương vị/bộ phận quản lý (đã chuẩn hoá theo danh mục
  chức danh chung của nhà máy).
- **Ngày kiểm định gần nhất** và **ngày kiểm định tiếp theo** — hệ thống lưu cả ngày đã
  phân tích được (để lọc, đếm thiết bị quá hạn) lẫn nguyên văn người nhập (vì một phần
  dữ liệu gốc không phải ngày hợp lệ, ví dụ tem kiểm định bị mờ không đọc được ngày).

## Cách dùng

- Trang `/tbycnn` hiển thị danh sách thiết bị theo kỳ, lọc được theo tình trạng hạn
  kiểm định (còn hạn / sắp hết hạn / quá hạn tuỳ theo ngày đã phân tích được).
- **Thêm thiết bị mới vào danh mục kỳ**: chỉ mở khi bật một công tắc quyền cấp kỳ riêng
  (`tbycnn-control-item-creation`) — mặc định tắt để tránh thêm nhầm ngoài ý muốn.
- **Xoá thiết bị**: tương tự, cần bật công tắc quyền riêng (`tbycnn-control-item-deletion`)
  và chỉ thực hiện được trong chế độ Sửa bảng.
- **Xuất báo cáo**: xuất được ra Excel và PDF.
- **Chưa có chức năng chốt kỳ** (khác với module PCCC) — đây là điểm còn thiếu đã biết
  của module, dữ liệu kỳ trước hiện vẫn có thể sửa được.

## Ai được xem, ai được sửa

- Xem sổ TBYCNN: quyền `tbycnn-view` — mặc định mọi vai trò từ Vận hành viên trở lên
  xem được.
- Sửa số liệu: quyền `tbycnn-manage`.

## Câu hỏi thường gặp mà module này trả lời được

- "Thiết bị nào trong sổ TBYCNN sắp hết hạn kiểm định?"
- "Thiết bị X thuộc cương vị nào quản lý?"
- "Sổ TBYCNN có chốt kỳ như PCCC không?" (chưa có, đang ở pha 1)

Những câu hỏi về **tiêu chuẩn/quy trình kiểm định kỹ thuật**, **quy định pháp luật về
thiết bị yêu cầu nghiêm ngặt** — module này không trả lời được, cần tra hồ sơ kiểm định
gốc hoặc hỏi đơn vị kiểm định.
