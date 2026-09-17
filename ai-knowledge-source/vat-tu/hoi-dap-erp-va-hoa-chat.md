# Hỏi – đáp trang Vật tư theo ERP và Tịnh kho hóa chất

> Tài liệu hỏi – đáp này bổ sung cho "Hướng dẫn sử dụng phần Quản lý vật tư", tập trung vào hai
> trang **Vật tư theo ERP** (`/vat-tu/loai-dau`) và **Tịnh kho hóa chất** (`/chemical-inventory`),
> đối chiếu với phần mềm đang chạy (tháng 09/2026). Luồng phiếu vật tư, quyết toán, kế hoạch năm
> và nhu cầu tháng xem trong Hướng dẫn sử dụng phần Quản lý vật tư. Con số tồn kho cụ thể thì hỏi
> trợ lý để tra dữ liệu trực tiếp.

## Vật tư theo ERP

### Trang Vật tư theo ERP dùng để làm gì?

Trang gom các **mã vật tư ERP** (mã kho công ty) thành **nhóm** dùng chung để theo dõi tồn kho
theo loại: Dầu bôi trơn, Lõi lọc dầu, Thiết bị C&I, Hóa Chất, Chai Khí, Bi Nghiền Than, Văn phòng
phẩm, Dụng cụ sơn, Khác. Mỗi nhóm cộng tồn ERP của các mã đã xác nhận thuộc nhóm (quy đổi theo hệ
số), so với **tồn tối thiểu** để cảnh báo nhóm đang dưới mức. Cần quyền `erp-material-manage` mức
xem trở lên.

### Tab Chờ phân nhóm là gì?

Mã ERP mới hoặc mã bị tách khỏi nhóm nằm ở tab **Chờ phân nhóm** (số trên tab là số mã đang chờ).
Người có quyền duyệt từng mã vào nhóm; bảng có cột **Gợi ý của hệ thống** đề xuất nhóm phù hợp.
Xóa một nhóm thì các mã trong nhóm trở về Chờ phân nhóm, không mất dữ liệu ERP.

### Tồn kho ERP được cập nhật thế nào?

Bấm **Đồng bộ ngay**: web đọc tồn kho từ **phiên QLVT đang đăng nhập** trên máy của bạn thông qua
tiện ích trình duyệt **Đồng bộ QLVT** — tiện ích chỉ đọc, không ghi gì về hệ thống QLVT. Chưa cài
hoặc chưa bật tiện ích thì web báo "Không tìm thấy tiện ích Đồng bộ QLVT". Trang hiện trạng thái
lần đồng bộ gần nhất và cảnh báo khi dữ liệu đã quá 4 giờ.

### Ngừng sử dụng một mã ERP thì sao?

Mã bị ngừng sử dụng rời nhóm hiện tại, không còn trong danh sách chọn cho phiếu mới và bị bỏ qua
khi cập nhật tồn kho; lịch sử phiếu cũ vẫn giữ nguyên. Khôi phục thì mã trở lại tab Chờ phân nhóm.

## Tịnh kho hóa chất

### Trang Tịnh kho hóa chất gồm những tab nào?

**Tổng quan**, **Nhật ký NH3** (nhật ký ngày của NH3), **Tồn theo cương vị** (lưới tồn cuối tháng
theo từng cương vị), **Phiếu nhập**, **Tổng hợp năm**, **Hợp đồng**, và **Lịch sử đồng bộ** (chỉ
người có quyền quản lý). Mỗi tháng là một **kỳ** dạng `2026-09`.

### Tồn đầu, nhập, sử dụng, tồn cuối của hóa chất tính thế nào?

Mọi con số dẫn xuất được **tính lại từ dữ liệu gốc** mỗi lần xem, không lấy từ ô lưu sẵn: tồn đầu
tháng lấy tồn cuối tháng trước; nhập trong tháng cộng từ các phiếu nhập; lượng sử dụng = tồn đầu +
nhập − tồn cuối. Đơn vị hiển thị theo từng mặt hàng (ví dụ NH3 tính theo tấn). Riêng NH3 còn tính
**suất hao** theo kg/MWh khi đã nhập sản lượng điện của tháng.

### Ai được nhập liệu sổ hóa chất?

Theo quyền `chemical-inventory-manage`: **xem** — xem và xuất báo cáo; **cá nhân** — thêm ghi nhật
ký ngày, tạo/sửa phiếu nhập, sửa ô tồn cuối **đúng cương vị đang trực**; **quản lý** — thêm sản
lượng S1+S2, xóa phiếu, mở/khóa kỳ, hợp đồng, xem trước dữ liệu nhập file; **toàn quyền** — thêm
ghi dữ liệu nhập file và mở khóa kỳ.

### Khóa kỳ hóa chất nghĩa là gì?

Kỳ ở trạng thái đã khóa thì số liệu tháng đó chỉ đọc. Người có quyền quản lý khóa kỳ; **mở khóa**
cần toàn quyền và phải nêu lý do.

### Các cảnh báo trên sổ hóa chất nghĩa là gì?

Sổ tự sinh cảnh báo để soát số liệu, ví dụ: thiếu một trong hai số cân; khối lượng công nhận không
bằng số cân nhỏ hơn; phiếu không có biển số xe; trùng chuyến xe đã ghi trong ngày; tồn đầu ngày
không khớp tồn cuối ngày trước; tồn đầu tháng không khớp tồn cuối tháng trước; tồn cuối âm; lượng
sử dụng âm; tồn vượt sức chứa bồn; tồn dưới ngưỡng cảnh báo; lượng dùng lệch bất thường so với
trung vị tháng; khối lượng xe ngoài dải thường gặp; chưa có bản đọc ngày cuối tháng (NH3); thiếu
tháng trong chuỗi. Sổ **không** so lượng đề xuất trên phiếu vật tư với lượng nhập thực tế — cân
thực tế mới là số vào sổ.

## Hỏi trợ lý về số liệu vật tư

### Trợ lý AI tra được những số liệu vật tư nào?

Trợ lý tra trực tiếp (theo đúng quyền của người hỏi): tồn kho theo lô của Danh mục Vận Hành 1 và tồn
ERP theo mã/nhóm; phiếu đề xuất/ứng vật tư đang ở bước nào; kế hoạch vật tư năm (kế hoạch, đã dùng,
còn lại) và biểu nhu cầu vật tư tháng; tồn kho hóa chất theo tháng; lịch sử thay vật tư và điểm sắp
đến hạn, quá hạn thay thế. Hãy nêu rõ tên hoặc mã vật tư, tháng/năm cần tra để trả lời chính xác.
