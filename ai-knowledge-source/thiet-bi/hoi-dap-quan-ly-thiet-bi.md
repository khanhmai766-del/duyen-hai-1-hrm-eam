# Hỏi – đáp cách dùng phân hệ Quản lý thiết bị trên web nội bộ

> Tài liệu hỏi – đáp này mô tả **cách dùng các trang của phân hệ Quản lý thiết bị** trên web
> nội bộ Phân xưởng Vận hành 1, đối chiếu với phần mềm đang chạy (tháng 09/2026). Đây không
> phải quy trình vận hành, quy trình sửa chữa hay quy định an toàn chính thức của nhà máy.
> Số liệu cụ thể (khiếm khuyết nào đang mở, thiết bị nào hỏng) thì hỏi trợ lý để tra dữ liệu
> trực tiếp, không đọc từ tài liệu này.

## Tổng quan phân hệ

### Phân hệ Quản lý thiết bị gồm những trang nào?

Trên menu, mục **Quản lý thiết bị** gồm: Dashboard, Thông tin thiết bị, Khiếm khuyết thiết bị
(gồm Sheet Cơ - Hóa, Sheet Điện và Sổ cấp phiếu công tác), Lịch sử sửa chữa, Thiết bị PCCC,
Tiếp địa & chống sét, Thiết bị YCNN về ATLĐ (TBYCNN) và Thư mục lưu trữ. Mỗi trang chỉ hiện
trên menu khi tài khoản có quyền xem trang đó.

### Vì sao tôi không thấy một số trang hoặc một số dòng dữ liệu?

Có hai lớp giới hạn. Thứ nhất là **quyền theo vai trò** do Quản trị cấu hình ở trang Phân
quyền (ví dụ `pccc-view`, `tbycnn-view`, `grounding-lightning-view`). Thứ hai là **phạm vi
theo cương vị đang làm việc**: nhiều sổ chỉ hiện dòng thuộc cương vị của người xem, trừ Quản
trị viên và cấp quản lý (Quản đốc, Phó quản đốc, Kỹ thuật viên, Trưởng ca). Người kiêm nhiệm
muốn xem phần việc của cương vị khác thì đổi **cương vị đang làm việc** ở trang Tài khoản.
Tài khoản chế độ "chỉ tra cứu khiếm khuyết" chỉ mở được trang khiếm khuyết.

## Thông tin thiết bị

### Trang Thông tin thiết bị dùng để làm gì?

Trang `/devices` (tiêu đề "THÔNG TIN THIẾT BỊ — Lý lịch & quản lý tài sản thiết bị nhà máy")
có các tab **Cây thiết bị** (duyệt thiết bị theo cây thư mục), **Thẻ** (các thiết bị đã được
chọn tạo thẻ QR) và **Thêm mới** (chỉ Quản trị viên). Mở một thiết bị để xem lý lịch: khiếm
khuyết, lịch sử sửa chữa và vật tư liên quan tới thiết bị đó.

### Thẻ QR thiết bị là gì, tạo thế nào?

Ở tab **Thẻ**, chọn thiết bị từ cây thư mục rồi bấm **Thêm thẻ QR**. Có thể tạo QR cho thiết
bị lá hoặc cho thiết bị lớn/thư mục cha để tra dữ liệu tổng hợp của cả nhánh. Chỉ những thiết
bị đã được chọn mới hiện thẻ. **Gỡ thẻ QR** làm mã đã in bị vô hiệu hóa ngay, còn thiết bị và
dữ liệu liên quan vẫn giữ nguyên.

## Khiếm khuyết thiết bị

### Sheet Cơ - Hóa và Sheet Điện khác nhau thế nào?

Khiếm khuyết được tách theo hai Google Sheet nguồn mà hệ thống đồng bộ về. **Sheet Cơ - Hóa**
gồm các loại yêu cầu Cơ, Môi Trường, Hóa; **Sheet Điện** là phần của bộ phận Điện (Môi Trường
có ở cả hai bên). Mỗi phần chỉ hiển thị phiếu của sheet tương ứng.

### Dữ liệu khiếm khuyết lấy từ đâu, có tự cập nhật không?

Google Sheet vẫn là nguồn chính cho các trường gốc của phiếu. Hệ thống n8n kiểm tra định kỳ,
chỉ đồng bộ khi file Sheet có thay đổi, và đọc đủ các tab của từng nguồn: nguồn Cơ gồm `DH1`,
`DH1 MTruong`, `VH1_HOA`; nguồn Điện gồm `DH1`, `DH1 qt OL`. Người có quyền còn có nút
**Đồng bộ bằng n8n** để yêu cầu đồng bộ ngay. Thiết bị đã được vận hành viên ánh xạ, trạng
thái xác nhận và lịch sử trên web không bị lượt đồng bộ ghi đè.

### Các trạng thái của phiếu khiếm khuyết nghĩa là gì?

Trạng thái trên web gồm: **Chưa xử lý**, **Đang thực hiện**, **Chờ vật tư**, **Chờ ngừng
máy** và **Đã xử lý**.

### Mức độ khiếm khuyết 1, 2, 3, 4 được phân loại theo tiêu chí nào?

Form khiếm khuyết trên web có sẵn tiêu chí chọn mức độ (có thể tick tiêu chí chi tiết):

- **Mức 1 — ưu tiên cao nhất, xử lý khẩn cấp**: ảnh hưởng trực tiếp, nghiêm trọng đến vận
  hành tổ máy, an toàn, môi trường hoặc theo chỉ đạo của Ban Giám đốc. Tiêu chí: ảnh hưởng hệ
  số đáp ứng hoặc trực tiếp công suất tổ máy; ảnh hưởng trực tiếp thông số môi trường (khí
  thải, nước thải) hoặc áp suất nước PCCC; xì than, xì tro, rò rỉ hóa chất phát tán rộng; hư
  hỏng gây bất khả dụng máy phát Diesel; liên quan hệ thống bảo vệ, liên động, điều khiển chính
  quan trọng; phiếu thực hiện theo chỉ đạo của Ban Giám đốc.
- **Mức 2 — ưu tiên cao, xử lý sớm không để kéo dài**: ảnh hưởng công suất, độ khả dụng, độ tin
  cậy nhưng chưa tức thời như mức 1. Tiêu chí: phiếu mức thấp bị nhắc lại từ 2 lần (từ 7–30
  ngày kể từ ngày ra phiếu, tùy mức); suy giảm khả năng dự phòng của thiết bị/hệ thống quan
  trọng; có nguy cơ ảnh hưởng công suất hoặc độ khả dụng nếu không xử lý kịp; thiết bị phụ trợ
  quan trọng vận hành không ổn định nhưng thông số còn trong giới hạn; xì than, xì tro, rò rỉ
  hóa chất cục bộ; khiếm khuyết có xu hướng lặp lại, kéo dài hoặc xấu đi; ảnh hưởng trực tiếp
  suất hao nhiệt (SHN) hoặc lỗi PCCC không thuộc mức 1.
- **Mức 3 — ưu tiên trung bình, xử lý theo kế hoạch**: chưa ảnh hưởng trực tiếp công suất và
  độ khả dụng nhưng có nguy cơ hư hỏng xếp chồng hoặc làm suy giảm thiết bị. Tiêu chí: nguy cơ
  hư hỏng lan truyền/xếp chồng; hư hỏng nhỏ, rò rỉ nhỏ chưa ảnh hưởng ngay; ảnh hưởng tuổi thọ,
  độ bền; tồn tại cần đưa vào kế hoạch xử lý ở đợt dừng máy phù hợp.
- **Mức 4 — ưu tiên thấp, theo dõi cải tiến khi có điều kiện**: không ảnh hưởng và không có
  nguy cơ xếp chồng tới công suất, độ khả dụng. Tiêu chí: mang tính hoàn thiện, chỉnh trang, mỹ
  quan công nghiệp; không ảnh hưởng an toàn, môi trường, công suất và độ tin cậy; xử lý khi có
  điều kiện về vật tư, nhân lực hoặc lịch sửa chữa.

Ngoài mức độ, phiếu còn có **điều kiện thực hiện**: A — cần ngừng máy, B — không cần ngừng.

### Xác nhận phiếu đã xử lý thì bao lâu mới vào Lịch sử sửa chữa?

Khi vận hành viên xác nhận một phiếu (từ Google Sheet) đã xử lý, web tạo **bản nháp lịch sử** và
giữ phiếu ở mục tồn đọng thêm **14 ngày** để vẫn nhận dữ liệu sửa chữa mới đồng bộ về. Hết 14
ngày, hệ thống tự chốt lịch sử (tác vụ chạy mỗi giờ).

### Nhắc lại phiếu khiếm khuyết được ghi thế nào?

Nhắc lại không tạo dòng mới. Ô Nhắc lại của hàng gốc trên Sheet ghi số lần nhắc lại và ngày của
từng lần, ví dụ "Số lần nhắc lại: 2 / Nhắc lại lần 1 ngày 28/07/2026 / Nhắc lại lần 2 ngày
29/07/2026".

## Lịch sử sửa chữa

### Trang Lịch sử sửa chữa hiển thị gì?

Trang `/repair-history` liệt kê lịch sử xử lý khiếm khuyết đã chốt. Lịch sử được lưu độc lập
với phiếu khiếm khuyết, nên phiếu gốc có bị ẩn hoặc dọn đi thì lịch sử vẫn còn để tra cứu. Lý
lịch từng thiết bị (mở từ trang Thông tin thiết bị) gom khiếm khuyết, sửa chữa và thay vật tư
của đúng thiết bị đó.

## Tiếp địa & chống sét

### Sổ Tiếp địa & chống sét theo dõi gì?

Trang `/grounding-lightning` liệt kê các **khu vực/thiết bị** cần kiểm tra, mỗi khu vực có hạng
mục **Tiếp địa** và/hoặc **Chống sét**. Mỗi hạng mục mang một trong ba tình trạng: **Chưa kiểm
tra**, **Bình thường**, **Có khiếm khuyết**. Mỗi khu vực thuộc một cương vị và một tổ máy.

### Ai xem được những khu vực nào?

Quản trị viên, vai trò Quản lý/Giám sát và các cương vị quản lý (Quản đốc, Phó quản đốc, Kỹ
thuật viên, Trưởng ca) xem toàn bộ; người được nâng một trong các quyền tiếp địa lên mức
quản lý cũng xem toàn bộ. Những người khác chỉ thấy khu vực thuộc **cương vị đang làm việc**
của mình.

### Ghi nhận kết quả kiểm tra tiếp địa, chống sét thế nào?

Bấm **Kiểm tra** ở khu vực, chọn kết quả cho từng hạng mục. Hạng mục **Có khiếm khuyết** bắt
buộc ghi rõ nội dung khiếm khuyết. Mỗi hạng mục chỉ lưu **1 hình ảnh**; muốn thay ảnh thì gỡ ảnh
cũ trước. Chuyển hạng mục về **Bình thường** sẽ xóa ảnh của hạng mục đó.

### Vì sao không bấm xác nhận kiểm tra được?

Xác nhận kiểm tra cần quyền ghi sổ tiếp địa và khu vực phải thuộc phạm vi của bạn. Hệ thống
chặn khi còn hạng mục **Chưa kiểm tra** ("Phải hoàn tất kết quả của tất cả hạng mục trước khi
xác nhận") hoặc có hạng mục khiếm khuyết chưa ghi nội dung. Mỗi lần xác nhận lưu lại người
kiểm tra, cương vị, thời điểm và kết quả, ảnh của từng hạng mục tại lúc đó.

## Thư mục lưu trữ

### Thư mục lưu trữ gồm những nhóm nào?

Trang `/documents/archive` có các nhóm: **Dữ liệu tách lưới**, **Dữ liệu khởi động**, **Dữ
liệu hiệu chỉnh lò** (lưu tên hồ sơ, số, ngày, đường dẫn thư mục dữ liệu và tiến trình ghi tay)
và **Dữ liệu vòi dầu** (sơ đồ tình trạng vòi dầu, vòi than của từng tổ máy). Mỗi nhóm có quyền
xem riêng.

### Ai xem được Dữ liệu vòi dầu?

Nhóm vòi dầu chặn theo chức vụ: chỉ Quản trị viên và các chức vụ Quản đốc, Phó quản đốc, Kỹ
thuật viên, Trưởng ca, TK Lò máy, Lò trưởng, Lò phó, Thiết bị đo lường điều khiển (I&C) xem
được.

### Tình trạng vòi dầu, vòi than ghi nhận những gì?

Mỗi vòi dầu (theo tổ máy S1/S2, tường trước hoặc tường sau) có tình trạng khả dụng hoặc không
khả dụng, ô khiếm khuyết SCCN (sửa chữa cơ nhiệt) và SCĐ (sửa chữa điện), cờ **force tín hiệu
ngọn lửa**; vòi than cùng vị trí có tình trạng và ghi chú khiếm khuyết riêng. Vòi được coi là có
khiếm khuyết khi một trong hai ô SCCN/SCĐ có nội dung.
