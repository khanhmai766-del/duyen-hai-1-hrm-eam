# Tổng quan Module PCCC trên web nội bộ

> Tài liệu này mô tả **module theo dõi thiết bị PCCC trên web nội bộ** (trang `/pccc`) —
> tức là hệ thống ghi chép, không phải quy trình chữa cháy hay quy phạm PCCC chính thức
> của nhà máy. Khi có sự cố cháy nổ thật, làm theo phương án PCCC đã được cơ quan
> chức năng phê duyệt và hướng dẫn của cán bộ an toàn — không dùng tài liệu này để
> xử lý tình huống khẩn cấp.

## Module này theo dõi cái gì

Sổ PCCC trên web ghi lại tình trạng của bốn nhóm thiết bị phòng cháy chữa cháy, cập nhật
theo từng **kỳ** (mỗi kỳ là một tháng, ví dụ "T08.2026"):

- **Bình chữa cháy (BCC)** — các loại MFZ (bột), CO2, Foam. Mỗi bình có mã riêng, được
  đánh giá tình trạng: **Khả dụng**, **Cần theo dõi**, hoặc **Bất khả dụng**.
- **Tủ chữa cháy (TCC)** — mỗi tủ có nhiều linh kiện (vòi, lăng phun, van, kính, chân đế...),
  mỗi linh kiện được đánh dấu tình trạng riêng; tình trạng tổng thể của cả tủ được suy ra
  từ tình trạng xấu nhất trong các linh kiện đó.
- **Bồn FOAM, CO2, Diesel** và **hệ thống FM200** (bình khí chữa cháy tự động) — theo dõi
  mức chứa/áp suất và tình trạng.
- **Chữ ký xác nhận** — mỗi kỳ, mỗi mục có thể được người có thẩm quyền ký xác nhận đã
  kiểm tra.

## Cách dùng

- Trang `/pccc` có 4 tab tương ứng 4 nhóm thiết bị trên.
- Mỗi thiết bị có thể lọc theo tổ máy, tình trạng, hoặc tìm theo mã.
- **Chốt kỳ**: khi một tháng đã kiểm tra xong, kỳ đó được **chốt** — sau khi chốt, không
  ai sửa được số liệu của kỳ đó nữa (kể cả người có quyền quản lý), trừ khi mở lại theo
  đúng quy trình quản trị. Đây là cơ chế chống sửa số liệu sau khi đã báo cáo, không phải
  vì hết hạn kiểm tra.
- **Xuất Excel**: có thể xuất báo cáo của một kỳ ra file Excel, giữ đúng định dạng gần
  với bảng tính gốc mà nhà máy vẫn dùng trước đây.

## Ai được xem, ai được sửa

- Xem sổ PCCC: cần quyền `pccc-view` — mặc định các vai trò Quản trị viên, Quản đốc,
  Trưởng ca/kíp, Vận hành viên đều xem được; Viewer (chỉ xem) mặc định cũng xem được vì
  đây là thông tin an toàn nên không hạn chế đọc.
- Sửa/ghi nhận kiểm tra: cần quyền `pccc-manage`.
- Thêm/xoá cả một dòng thiết bị khỏi danh mục kỳ: cần công tắc quyền riêng, tách khỏi
  quyền sửa số liệu thông thường — để tránh xoá nhầm hàng loạt.

## Câu hỏi thường gặp mà module này trả lời được

- "Sổ PCCC tháng này đã chốt chưa?"
- "Bình chữa cháy khu vực nào đang ở tình trạng Bất khả dụng?"
- "Ai được quyền sửa sổ PCCC?"
- "Làm sao xuất báo cáo PCCC ra Excel?"

Những câu hỏi về **cách xử lý khi có cháy thật**, **quy định pháp luật về PCCC**, hoặc
**tiêu chuẩn kỹ thuật thiết bị chữa cháy** — module này không trả lời được, cần tra hồ sơ
PCCC chính thức của nhà máy hoặc hỏi cán bộ an toàn phụ trách.
