# Hỏi – đáp Sổ thiết bị PCCC trên web nội bộ

> Tài liệu này mô tả **sổ theo dõi thiết bị PCCC trên web nội bộ** (trang `/pccc`), đối
> chiếu với phần mềm đang chạy (tháng 09/2026) — tức hệ thống ghi chép kết quả kiểm tra,
> **không phải** phương án chữa cháy, quy trình xử lý sự cố cháy nổ hay quy phạm PCCC chính
> thức của nhà máy. Khi có cháy nổ thật, làm theo phương án PCCC đã được phê duyệt và hướng
> dẫn của cán bộ an toàn — không dùng tài liệu này để xử lý tình huống khẩn cấp.
> Muốn biết thiết bị cụ thể nào đang không đạt hay quá hạn, hỏi trợ lý để tra dữ liệu sổ.

## Sổ PCCC gồm những gì

### Trang /pccc có những tab nào?

Trang có 8 tab: **Tổng quan**, **Bình chữa cháy**, **Tủ chữa cháy** (kèm bảng cuộn vòi của
tủ), **Tủ điều khiển chữa cháy**, **Foam · CO2 · Diesel · FM200**, **Nút nhấn báo cháy**,
**Van chữa cháy** và **Đèn sự cố**. Tab Tổng quan đếm số liệu theo đúng phạm vi người xem được
phép xem.

### Kỳ của sổ PCCC là gì?

Mỗi kỳ là một tháng, nhãn dạng `T09.2026`. Trang mặc định mở kỳ của tháng hiện tại. Kỳ của
tháng chưa tới không được tạo trước; nếu có thì chỉ đọc (huy hiệu "Chưa tới kỳ — chỉ đọc").

### Tình trạng thiết bị PCCC được đánh giá theo mức nào?

Theo TB 5100/TB-NĐDH ngày 14/8/2026, kết quả kiểm tra của bình chữa cháy, tủ chữa cháy, nút
nhấn báo cháy và cuộn vòi chỉ còn hai mức **Đạt** / **Không đạt** (ba mức cũ quy đổi: Khả dụng
và Cần theo dõi thành Đạt; Bất khả dụng thành Không đạt). **Van chữa cháy** có ba mức riêng:
Khả dụng; Có suy giảm chức năng nhưng vẫn sử dụng được khi có sự cố; Không khả dụng. **Đèn sự
cố** có thêm mức "Không có đèn" — nghĩa là vị trí thực tế không lắp đèn, không phải lỗi thiết
bị.

### Áp suất bình chữa cháy ghi thế nào?

Áp suất bình MFZ/Foam và khối lượng bình CO2 ghi chung một ô, đơn vị **phần trăm** (0–100) so
với mức chuẩn của bình — người kiểm tra đọc thẳng số trên đồng hồ hoặc cân. Chủng loại bình gồm
Bình MFZ, Bình CO2, Bình Foam. Vị trí hiện tại của bình chọn trong: Tại chỗ; Trả phòng tập
kết/chưa cấp phát; Thất lạc/chưa cấp phát.

### "Quá hạn thay thế" của bình chữa cháy tính thế nào?

Hạn thay thế = ngày sản xuất + thời gian sử dụng (năm). Bình bị tính **quá hạn** khi hạn thay
thế trước ngày cuối của kỳ đang xem. Trên bảng, cột "Đến hạn thay thế" tô đỏ khi quá hạn và tô
vàng khi còn dưới 30 ngày.

## Ai xem, ai sửa

### Tôi xem được những dòng nào trong sổ PCCC?

Cần quyền `pccc-view`. Quản trị viên và cấp quản lý (Quản đốc, Phó quản đốc, Kỹ thuật viên,
Trưởng ca) xem toàn bộ; tài khoản được cấp `pccc-view` mức quản lý cũng xem toàn bộ. Những
người khác chỉ xem dòng thuộc **cương vị đang làm việc** của mình; ở các bảng có cột Cấp giám
sát (bình, nút nhấn, van, đèn) thì cấp giám sát xem thêm các dòng mình giám sát. Bảng Foam,
CO2, Diesel, FM200 là tài sản dùng chung nên ai có cương vị đều xem hết. Chưa khai cương vị thì
không thấy dòng nào. Người kiêm nhiệm đổi cương vị đang làm việc ở trang Tài khoản.

### Ai được sửa và ký sổ PCCC?

Chỉ Quản trị viên và cấp quản lý (Quản đốc, Phó quản đốc, Kỹ thuật viên, Trưởng ca) sửa và ký
được mọi thiết bị. Những người khác cần quyền ghi `pccc-manage` (bất kỳ mức nào từ cá nhân trở
lên) và chỉ sửa, ký được dòng thuộc **cương vị đang làm việc** của mình — mức quyền cao hơn
không mở rộng phạm vi; tài khoản chưa gán cương vị thì chưa ghi được. Không chuyển được dòng
sang cương vị khác. **Cấp giám sát chỉ xem, không kèm quyền sửa** phần mình giám sát. Riêng bảng
Tủ chữa cháy và cuộn vòi, một số cương vị được giao trọn bảng. Hai nhóm ô chỉ Quản trị viên sửa được:
phân công (cương vị, cấp giám sát, tổ máy, đơn vị tính) và dấu kiểm tra (ngày/người kiểm tra,
ngày/người chốt) — vì dấu kiểm tra do thao tác ký tự điền.

## Thao tác thường gặp

### Sửa bảng và ký tên trên sổ PCCC thế nào?

Bấm nút **Chỉnh sửa**. Mục **Sửa bảng** mở khóa ô để sửa nhiều dòng rồi bấm Lưu một lượt; hộp
thoại kết quả báo số dòng đã lưu và nhắc chữ ký đã bị xóa. Mục **Ký tên** ký xác nhận toàn bộ
dòng thuộc cương vị quản lý của người bấm (giao với bộ lọc đang đặt). Ở tab Foam · CO2 · Diesel
· FM200, việc ký là theo từng bồn/từng bảng FM200. Kỳ đã chốt hoặc chưa tới thì không sửa, không
ký được.

### Vì sao không ký tên được trên sổ PCCC?

Chữ ký là **ảnh chữ ký số** trong hồ sơ cá nhân, không phải tên gõ tay. Chưa có chữ ký số thì
hộp thoại nhắc và không cho ký — vào **Tài khoản → mục "Chữ ký số"** để thêm. Mỗi lần ký tự điền
người kiểm tra và ngày kiểm tra (bồn Foam/CO2/Diesel điền người chốt, ngày chốt).

### Chốt kỳ và sang kỳ mới diễn ra thế nào?

Tự động theo giờ Việt Nam: ngày **cuối tháng** hệ thống xuất Excel của kỳ lên kho lưu trữ S3
rồi mới **chốt kỳ** (chuyển chỉ đọc; chưa lưu trữ xong thì không chốt). Ngày **1 tháng sau** sinh
kỳ mới, mang số liệu kỳ vừa chốt sang và xóa ngày/người kiểm tra cùng chữ ký để kiểm tra lại.
Cơ sở dữ liệu chỉ giữ **6 kỳ gần nhất**; kỳ cũ hơn vẫn tải được từ bản lưu trữ. Khi bộ hẹn giờ
lỗi, người có quyền `pccc-close-period` bấm nút **Chuyển kỳ** để chạy tay đúng việc đó.

### Xuất Excel sổ PCCC thế nào?

Nút **Xuất Excel** là danh sách sổ xuống: kỳ đang xem (dựng từ dữ liệu hiện tại, theo bộ lọc
đang đặt) và **12 tháng lưu trữ gần nhất** đọc thẳng từ kho lưu trữ — đây là chỗ tra lại các
tháng đã bị dọn khỏi cơ sở dữ liệu. File giữ bố cục và tên sheet của sổ Excel gốc, có cột ảnh
chữ ký; bản lưu trữ có thêm sheet đầu "CHỐT KỲ".

### Thêm hoặc xóa thiết bị khỏi sổ PCCC được không?

Mặc định **khóa**. Thêm thiết bị cần cấp quản lý bật công tắc cấp kỳ (quyền
`pccc-control-item-creation`); xóa thiết bị cần công tắc riêng (quyền
`pccc-control-item-deletion`, mặc định chỉ Quản trị viên) vì xóa nhầm là mất dòng ở kỳ này và
các kỳ sau. Kỳ mới luôn sinh ra ở trạng thái khóa cả hai công tắc.

## Giới hạn của tài liệu

### Những câu hỏi nào sổ PCCC không trả lời được?

Cách xử lý khi có cháy thật, phương án chữa cháy, quy định pháp luật về PCCC, tiêu chuẩn kỹ
thuật hay chu kỳ bảo dưỡng thiết bị chữa cháy — không có trong sổ này. Cần tra hồ sơ PCCC chính
thức của nhà máy hoặc hỏi cán bộ an toàn phụ trách.
