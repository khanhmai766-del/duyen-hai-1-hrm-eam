# Hỏi – đáp Sổ thiết bị TBYCNN trên web nội bộ

> TBYCNN = **thiết bị yêu cầu nghiêm ngặt về an toàn lao động** (thiết bị áp lực, thiết bị
> nâng, thiết bị điện phòng nổ…) cùng các dụng cụ ATLĐ phải kiểm tra định kỳ.
> Tài liệu này mô tả **sổ theo dõi trên web nội bộ** (trang `/tbycnn`), đối chiếu với phần
> mềm đang chạy (tháng 09/2026) — không phải quy trình kiểm định kỹ thuật hay quy định pháp
> luật về TBYCNN. Tiêu chuẩn kiểm định và hạn kiểm định chính thức của một thiết bị cần tra
> hồ sơ kiểm định gốc hoặc hỏi đơn vị kiểm định. Muốn biết thiết bị nào đang quá hạn, hỏi trợ
> lý để tra dữ liệu sổ.

## Sổ TBYCNN gồm những gì

### Sổ TBYCNN theo dõi thông tin gì?

Mỗi dòng là một thiết bị trong một **kỳ** (tháng, nhãn dạng `2026-09`): tên, mã hiệu, KKS, vị
trí, khu vực, cương vị quản lý, tổ máy, danh mục, số lượng, số lượng khả dụng/không khả dụng,
chu kỳ thử, ngày kiểm định gần nhất, ngày kiểm định tiếp theo, số biên bản kiểm định (BBKĐ),
đơn vị kiểm định, khiếm khuyết, ghi chú và chữ ký xác nhận.

### Trang /tbycnn có những bảng nào?

Có tầng chọn bảng: **Sổ chính**, **Thang di động**, **Dây đai an toàn**, **Dụng cụ điện cầm
tay**. Ba bảng dụng cụ ATLĐ có cột riêng (tải trọng thử, thời gian thử, kết quả thử, đo cách
điện, tình trạng sử dụng…). Mỗi dòng chỉ thuộc đúng một bảng; đổi bảng là đổi cả bộ cột, các
thẻ thống kê và phạm vi nút xuất file.

### Tình trạng của thiết bị TBYCNN được tính thế nào?

Tình trạng **suy ra** từ số lượng khả dụng và không khả dụng, không nhập tay. Một dòng có nhiều
cái có thể vừa có cái tốt vừa có cái hỏng, ví dụ "3 khả dụng, 2 không khả dụng" — dòng đó được
đếm ở cả thẻ khả dụng lẫn thẻ có thiết bị hỏng. Ở bảng dụng cụ, đổi ô Kết quả thử thì hệ thống tự
chỉnh số lượng khả dụng cho khớp; xóa trắng Kết quả nghĩa là **chưa thử** (tình trạng "Chưa cập
nhật"), không phải không khả dụng.

### Hạn kiểm định quá hạn, sắp đến hạn tính thế nào?

Theo ngày kiểm định tiếp theo: trước hôm nay là **quá hạn**; còn trong vòng **90 ngày** là **sắp
đến hạn**. Dòng không có ngày hợp lệ (ví dụ tem bị mờ, ghi "Không có") thì không xếp hạn — sổ vẫn
giữ nguyên văn người nhập.

### Ngày kiểm định tiếp theo có tự tính không?

Có. Bỏ trống ô "KĐ tiếp theo" thì hệ thống tự tính = ngày kiểm định gần nhất + **chu kỳ thử tính
bằng tháng** (ngày cuối tháng được kẹp về ngày cuối của tháng đích, ví dụ 31/01 + 1 tháng =
28/02). Thiếu dữ liệu thì để trống, không ghi đè các giá trị đặc biệt như "Không có".

## Ai xem, ai sửa

### Tôi xem được những thiết bị nào trong sổ TBYCNN?

Cần quyền `tbycnn-view`. Quản trị viên, cấp quản lý (Quản đốc, Phó quản đốc, Kỹ thuật viên,
Trưởng ca) và hai cương vị Trưởng kíp (TK Lò máy, Trưởng kíp điện) xem toàn bộ; tài khoản được cấp
`tbycnn-view` mức quản lý cũng xem toàn bộ. Những người khác chỉ thấy thiết bị thuộc **cương vị
đang làm việc** của mình.

### Ai được sửa, ký sổ TBYCNN?

Quản trị viên và cấp quản lý (Quản đốc, Phó quản đốc, Kỹ thuật viên, Trưởng ca) sửa, ký được
toàn phân xưởng. **Mọi cương vị khác** đều sửa (qua Sửa bảng) và ký được dòng thuộc cương vị đang
làm việc của mình mà không cần xin cấp thêm quyền — để người trực tiếp đi kiểm định tự nhập kết
quả cho thiết bị mình quản. Trưởng kíp xem toàn bộ nhưng chỉ sửa được phần cương vị của mình. Tài
khoản chưa gán cương vị thì chưa ghi được. Chỉ nhóm ô "vận hành" sửa được (chu kỳ thử, mốc kiểm định, số BBKĐ,
đơn vị kiểm định, số lượng khả dụng/không khả dụng, khiếm khuyết, ghi chú, các cột kết quả thử);
thông tin gốc theo hồ sơ nhà máy bị khóa.

## Thao tác thường gặp

### Sửa bảng và ký tên sổ TBYCNN thế nào?

Bấm **Chỉnh sửa**. **Sửa bảng** mở khóa ô vận hành; ô sửa dở tô vàng, bấm Lưu để ghi một lượt.
**Ký tên** ký xác nhận các dòng thuộc cương vị của mình giao với bộ lọc đang đặt; hộp thoại cho
tick chọn từng dòng và tự tick sẵn dòng chưa ký. Chữ ký là **ảnh chữ ký số** trong hồ sơ cá nhân
(Tài khoản → Chữ ký số), không phải tên gõ tay.

### Sổ TBYCNN có chốt kỳ không?

Có. Cuối tháng (giờ Việt Nam) hệ thống chốt kỳ tháng cũ và mở kỳ tháng mới. Sang kỳ mới **giữ
nguyên số liệu thiết bị** — thiết bị hỏng tháng trước vẫn hiện hỏng cho tới khi có người sửa — và
chỉ **xóa chữ ký**, nên việc ký xác nhận phải làm lại mỗi tháng. Kỳ đã chốt không ghi được nữa.

### Thêm hoặc xóa thiết bị khỏi sổ TBYCNN được không?

Mặc định **khóa**. Thêm thiết bị cần cấp quản lý bật công tắc cấp kỳ trong menu Chỉnh sửa
(quyền `tbycnn-control-item-creation`); người thêm vẫn chỉ thêm được cho cương vị của mình. Xóa
thiết bị cần công tắc riêng (quyền `tbycnn-control-item-deletion`, mặc định chỉ Quản trị viên),
thực hiện trong chế độ Sửa bảng bằng nút thùng rác rồi Lưu. Khi công tắc xóa đang khóa, chỉ thiết
bị tự thêm mới xóa được và chỉ trong 30 ngày. Kỳ mới luôn khóa cả hai công tắc.

### Xuất sổ TBYCNN ra Excel, PDF thế nào?

Nút **Xuất File** xuất đúng bảng đang xem, theo bộ lọc cương vị và tổ máy đang đặt: Excel
(`.xlsx`, giữ bố cục hồ sơ gốc) hoặc PDF khổ A4 ngang có cột **Chữ ký xác nhận** (dòng chưa ký
để trống cho ký tay) và khối **Người lập biểu** luôn để trống cho ký tay.

### Xuất biên bản kiểm tra định kỳ (BBKT) thế nào?

Ba bảng dụng cụ (thang di động, dây đai an toàn, dụng cụ điện cầm tay) xuất được **biên bản kiểm
tra định kỳ** dạng Word theo mẫu của phân xưởng. Hộp thoại hỏi thành phần kiểm tra, giờ, địa
điểm; bảng phụ lục dựng lại từ số liệu sổ ở mỗi lượt xuất. Biên bản **không** áp bộ lọc cương
vị/tổ máy vì là văn bản cho toàn đợt kiểm tra. Số biên bản và ngày ban hành để trống cho văn thư
cấp số. Lưu ý: cột Ghi chú của bảng dụng cụ điện được in thẳng vào biên bản.

## Giới hạn của tài liệu

### Những câu hỏi nào sổ TBYCNN không trả lời được?

Tiêu chuẩn, quy trình kiểm định kỹ thuật, quy định pháp luật về thiết bị yêu cầu nghiêm ngặt, hay
việc một thiết bị có được phép vận hành hay không — cần tra hồ sơ kiểm định gốc, quy định an toàn
chính thức hoặc hỏi đơn vị kiểm định, cán bộ an toàn.
