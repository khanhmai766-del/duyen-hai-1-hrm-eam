# Hỏi – đáp thao tác trên Sổ cấp phiếu công tác (PCT)

> Tài liệu hỏi – đáp này mô tả **cách dùng sổ cấp PCT trên web nội bộ** (trang `/work-permits`),
> đối chiếu với phần mềm đang chạy (tháng 09/2026). Đây không phải quy định an toàn lao động,
> quy trình cấp phiếu hay nội dung biện pháp an toàn chính thức của nhà máy. Muốn biết phiếu cụ
> thể đang ở trạng thái nào, hỏi trợ lý để tra dữ liệu sổ.

## Mở sổ và đọc sổ

### Sổ cấp phiếu công tác nằm ở đâu trên web?

Trên menu đầy đủ: **Quản lý thiết bị → Khiếm khuyết thiết bị → Sổ cấp phiếu công tác**
(`/work-permits`). Bảng chọn của nút Khiếm khuyết trên thanh điều hướng điện thoại chỉ có Cơ –
Hóa và Điện, không có Sổ cấp PCT.

### Ai được xem sổ PCT?

Mọi tài khoản đăng nhập đều được tra cứu và xuất sổ. Quyền ghi tách làm hai, cấu hình ở **Quản
trị → Phân quyền**, nhóm **Tài liệu số**: **Sổ cấp PCT — Cấp phiếu** (`work-permit-issue`) và
**Sổ cấp PCT — Thực hiện phiếu** (`work-permit-execute`). Khi chưa cấu hình riêng, Quản trị viên,
Quản lý và Giám sát có cả hai quyền; Vận hành viên và Viewer chưa có quyền ghi.

### Quyền Cấp phiếu và quyền Thực hiện phiếu khác nhau thế nào?

**Cấp phiếu**: tạo, cấp, sửa nội dung cấp và hủy phiếu; quản lý danh bạ nhà thầu và danh mục
biện pháp an toàn; ghi nhận đóng phiếu nội bộ ngay trong form. **Thực hiện phiếu**: cho phép, mở
và kết thúc lần làm việc, bàn giao chỉ huy trực tiếp (CHTT), tạm dừng, cập nhật tiến độ, kết quả
và đóng phiếu (có nút **Ghi nhận đóng phiếu**). Quyền không giới hạn theo người tạo phiếu.

### Vì sao danh sách không hiện phiếu đã đóng?

Danh sách mặc định **không lấy phiếu Đã đóng và Đã hủy**; chọn riêng bộ lọc trạng thái tương ứng
mới thấy. Sổ phân trang 10 phiếu một trang. Tìm kiếm không phân biệt dấu, lọc được theo sổ, trạng
thái, tổ máy, cương vị, nội bộ/nhà thầu, phân loại KH/ĐX/SC và khoảng ngày thực hiện; tìm kiếm tra
cả CHTT, mã người, đơn vị và nhân viên trong các lần làm việc.

## Số phiếu và thông tin phiếu

### Số PCT được đánh thế nào, có tự cấp số không?

Có hai sổ riêng **Cơ – Nhiệt – Hóa** và **Điện**. Web **không tự cấp số**: người ghi nhập số thực
tế; form gợi ý số kế tiếp (số lớn nhất của phiếu chưa hủy trong đúng sổ và năm) để điền nhanh. Số
thuần hiển thị theo mẫu `{số}/{năm}/VH1-NĐDH`. Số là duy nhất theo sổ + năm trong các phiếu chưa
hủy — trùng thì bị chặn khi lưu; phiếu hủy giải phóng số để cấp lại, và số được phép lặp lại sang
năm mới.

### KH, ĐX, SC trên phiếu nghĩa là gì?

Cột STT trong mẫu giấy ghi phân loại công việc: **KH** (kế hoạch), **ĐX** (đột xuất), **SC** (sự
cố) — không phải số thứ tự dòng. Phân loại này không bắt buộc ở mọi trạng thái; phiếu cũ chưa phân
loại để trống.

### PCT giấy và PCT điện tử khác nhau thế nào trên web?

Hình thức phiếu chọn trong form: mặc định **nhà thầu là giấy, nội bộ là điện tử**, vẫn đổi được
(ví dụ nội bộ dùng giấy khi hệ thống điện tử lỗi). PCT điện tử có thể gắn **liên kết NKVH** (dán
link chi tiết phiếu trên Nhật ký vận hành); bấm số phiếu sẽ mở đúng phiếu trên NKVH, chưa gắn thì
web sao chép số và mở danh sách NKVH để dán tìm. PCT giấy bấm số phiếu thì mở chi tiết trong sổ.

### Phiếu đã cấp có sửa số, xóa phiếu được không?

Phiếu **đã cấp** không đổi được số, năm, loại sổ hay loại đơn vị. Phiếu **đã đóng hoặc đã hủy**
bị khóa sửa. Sổ **không có thao tác xóa** phiếu; mọi thay đổi ghi lịch sử trước/sau.

### Gắn PCT với phiếu khiếm khuyết (SYC) thế nào?

Trong form chọn SYC từ danh sách khiếm khuyết (theo đúng phạm vi xem khiếm khuyết của người dùng;
SYC khớp cương vị được xếp lên đầu). Phiếu lưu liên kết tới SYC; gõ tay lại số SYC sẽ gỡ liên kết
để tránh gắn nhầm. Chi tiết khiếm khuyết hiển thị các PCT đã cấp, chưa hủy của nó ở hàng **Số
PCT/LCT** trong **Theo dõi Vận hành**.

## Luồng trạng thái

### Luồng phiếu nội bộ gồm những bước nào?

Nội bộ (giấy hoặc điện tử): **Nháp → Đã cấp → Đã đóng**, hủy được khi phiếu chưa đóng. Nháp chỉ
là lưu tạm, chưa ghi nhận cấp phiếu — nhập phiếu đã cấp thực tế thì chọn Đã cấp. Không có bước
cho phép hay quản lý tiến độ nhiều lần làm việc. Đóng thủ công cần thời điểm đóng không trước thời
điểm cấp; kết quả không bắt buộc.

### Vì sao phiếu công tác nội bộ tự đóng?

Phiếu **nội bộ**, đã cấp, còn mở, có gắn SYC sẽ **tự đóng** khi SYC đó ở trạng thái Đã xử lý **đủ
24 giờ** (SYC còn tồn tại, không bị hủy). Lịch sử ghi "Hệ thống — Tự đóng theo SYC đã xử lý đủ 24
giờ", thời điểm đóng bằng mốc hoàn thành SYC + 24 giờ. SYC mở lại trước hạn thì không đóng; SYC mở
lại sau khi phiếu đã đóng thì phiếu không tự mở lại. Phiếu nhà thầu không tự đóng.

### Luồng phiếu nhà thầu gồm những bước nào?

**Nháp → Đã cấp → Đang thực hiện → Chờ làm tiếp → Đã đóng**. Một PCT nhà thầu có nhiều **lần
làm việc**: mở lần làm việc (chọn CHTT từ danh bạ nhà thầu, giờ thực tế, người cho phép) → phiếu
Đang thực hiện; kết thúc lần (giờ kết thúc, người xác nhận, tiến độ lũy kế 0–100%) → Chờ làm tiếp;
có thể mở lần tiếp theo hoặc đóng phiếu khi xong toàn bộ. Đang có lần mở thì không sửa, đóng hay
hủy phiếu được.

### Một CHTT có đứng hai phiếu cùng lúc được không?

Không. Một CHTT không được có hai lần làm việc trùng thời gian, kiểm tra chung cả hai sổ Cơ và
Điện. Muốn đổi người giữa chừng thì dùng **Bàn giao / đổi CHTT**: hệ thống kết thúc lần cũ và mở lần
mới cùng thời điểm, người mới phải đang rảnh. Không được nhập mốc thời gian tương lai hay kết thúc
trước khi mở.

## Xuất sổ và in phiếu

### Xuất sổ PCT ra Excel thế nào?

Excel xuất một sheet **Sổ cấp PCT**, tối đa **10.000 phiếu** (hơn thì thu hẹp khoảng ngày). Hộp
xuất cho chọn toàn bộ sổ Cơ/Điện theo năm cấp số, hoặc theo bộ lọc hiện tại. File mặc định lấy cả
phiếu đã đóng nhưng **luôn loại Nháp và Đã hủy**; có cột Hình thức phiếu, không có cột Trạng thái.
Chi tiết các lần làm việc tra trên web. Sổ Excel không phải biểu mẫu PCT chính thức.

### In mẫu phiếu công tác bằng Word được không?

Được với **PCT giấy đã cấp** (không in nháp hay phiếu hủy), theo mẫu Word của phân xưởng. PCT Điện
chỉ điền số PCT, số ĐKCT (nếu có), mục 1.1–1.6, ngày cấp, người cấp và người giám sát an toàn điện
(nếu có); từ mục 1.7 trở đi để trống ghi tay. PCT Cơ – Nhiệt – Hóa điền phần A từ các cặp **mối
nguy – biện pháp an toàn** đã chọn. Các thông tin chưa quản lý trên web (chức vụ, bậc an toàn…) và
chữ ký vẫn để trống, phải hoàn thiện trước khi dùng.

### Danh mục mối nguy – biện pháp an toàn dùng thế nào?

Chỉ **PCT Cơ – Nhiệt – Hóa bằng giấy** có phần này. Người cấp chọn cặp mối nguy – biện pháp từ danh
mục rồi phân công cho đơn vị cho phép, đơn vị công tác hoặc cả hai; có thể sửa câu chữ trên phiếu,
thêm cặp riêng, bỏ cặp và đổi thứ tự. Nội dung được lưu ngay trên phiếu, nên sửa danh mục về sau
không làm đổi phiếu cũ. Danh mục trên web chỉ là các cặp trích từ phiếu mẫu phân xưởng cung cấp —
không thay thế việc người cấp phiếu đánh giá mối nguy thực tế theo quy định an toàn.
