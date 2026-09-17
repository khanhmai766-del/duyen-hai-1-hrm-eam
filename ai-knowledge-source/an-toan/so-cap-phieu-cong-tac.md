# Tổng quan Sổ cấp Phiếu công tác (PCT) trên web nội bộ

> Phiếu công tác (PCT) là văn bản cho phép thực hiện công việc trên thiết bị theo đúng
> kiểm soát an toàn của nhà máy trước khi bắt đầu. Tài liệu này mô tả **sổ cấp PCT trên
> web nội bộ** (trang `/work-permits`) — nơi ghi nhận việc cấp/đóng phiếu, không phải quy
> định về nội dung biện pháp an toàn phải có trong một PCT hay quy trình an toàn lao động
> khi thao tác trên thiết bị thật.

## Sổ này theo dõi cái gì

- Hai sổ riêng: **Cơ – Nhiệt – Hóa** và **Điện**. Số phiếu hiển thị theo mẫu chung
  `{số}/{năm}/VH1-NĐDH`.
- Mỗi PCT có phân loại **KH** (kế hoạch), **ĐX** (đột xuất), hoặc **SC** (sự cố) — không
  bắt buộc phải chọn ngay ở mọi trạng thái.
- **Luồng nội bộ** (điện tử hoặc giấy): Nháp → Đã cấp → Đã đóng, có thể hủy nếu phiếu
  chưa đóng. Không có bước "cho phép" hay quản lý tiến độ nhiều lần làm việc.
- **Luồng nhà thầu**: đầy đủ hơn — Nháp → Đã cấp → Đang thực hiện → Chờ làm tiếp → Đã
  đóng; nhà thầu có thể mở lại lần làm việc, bàn giao chỉ huy thi công (CHTT), và phải
  kết thúc lần làm việc cuối trước khi đóng phiếu.
- **Tự đóng theo SYC**: chỉ áp dụng phiếu nội bộ gắn với một khiếm khuyết (SYC) đã xử lý
  xong đủ 24 giờ — hệ thống tự động đóng phiếu, ghi lịch sử là "Hệ thống — Tự đóng theo
  SYC đã xử lý đủ 24 giờ". Nếu SYC mở lại sau khi phiếu đã đóng, phiếu không tự mở lại.
- **Liên kết NKVH** (Nhật ký vận hành): PCT điện tử có thể gắn link tới phiếu chi tiết
  trên hệ thống NKVH để tra cứu nhanh; PCT giấy không có chức năng này.

## Ai được thao tác

- Có hai vai trò nghiệp vụ tách biệt: người có quyền **Cấp phiếu** và người có quyền
  **Thực hiện phiếu** — mỗi vai trò thấy các nút thao tác khác nhau (ví dụ ghi nhận đóng
  phiếu, gắn/thay link NKVH).
- Danh sách mặc định trên web **không hiển thị phiếu đã đóng/đã hủy** — phải chọn bộ lọc
  riêng mới thấy. Khi xuất Excel thì mặc định lấy cả phiếu đã đóng nhưng luôn loại bỏ
  Nháp/Đã hủy.

## Câu hỏi thường gặp mà sổ này trả lời được

- "PCT số X đang ở trạng thái nào?"
- "Phiếu nào của nhà thầu đang Đang thực hiện?"
- "Vì sao PCT này tự đóng?"
- "Sổ Cơ – Nhiệt – Hóa và Điện khác nhau chỗ nào?"

Những câu hỏi về **biện pháp an toàn cụ thể phải ghi trong PCT**, **quy trình an toàn lao
động khi thao tác trên thiết bị điện/cơ/nhiệt**, hoặc **ai được phép ký cho phép công
tác theo quy định nhà máy** — sổ này không trả lời được, cần tra quy định an toàn lao
động chính thức hoặc hỏi cán bộ an toàn phụ trách.
