# Cấp số và tự đồng bộ PCT NKVH – PXVH1 (1.1.0)

Tiện ích dùng cho PCT nội bộ điện tử của PXVH1. Không tự tạo, ký hoặc bấm Lưu trên NKVH.
Số, nội dung và trạng thái đã lưu trên NKVH là nguồn chuẩn cho hồ sơ theo dõi duyenhai1.
PCT giấy vẫn cấp trên website và dùng chung dãy Cơ/Điện theo năm.

## Luồng mới

1. Mở PCT ở B1. Nếu cần số, bấm **Lấy số PCT → Lấy số & điền**.
2. Máy chủ chỉ tạo lượt `RESERVED` gắn `id_pct`, chưa ghi PCT Đã cấp. Bấm lại nhận cùng lượt.
3. Hoàn thiện phiếu, có thể sửa số, rồi tự bấm **Lưu trên NKVH**.
4. MAIN-world `saved-events.js` nghe phản hồi `pfAjaxComplete` có thông báo lưu/cấp thành công,
   không có `validationFailed`. Nó chỉ báo sự kiện, không gọi API website.
5. Content script đọc lại HTML từ NKVH để nhận dữ liệu đã lưu (không dùng ô đang gõ), rồi tự gửi
   số, `id_pct`, nội dung, cương vị, trạng thái về website. Không cần bấm Đồng bộ lần nữa.
6. Nếu API website lỗi, yêu cầu còn trong localStorage của nguồn NKVH. Thử lại sau 30 giây,
   khi online hoặc mở lại phiếu. Xung đột 409/mapping 400 cần xử lý, không thử liên tục.

Không chỉ dựa vào `id_pct` để khẳng định đã cấp. Không đồng bộ khi mới bấm Lưu, lưu bị từ chối,
hoặc không nhận ra thông báo thành công. Trường hợp không nhận ra phản hồi: dùng nút đồng bộ
thủ công sau khi xác nhận NKVH đã lưu. Cần kiểm tra thông báo thực tế trên cả Cơ và Điện trước phát hành.

## Giữ số và chống trùng

- Sổ Cơ/Điện và năm là phạm vi dãy số. Các đường ghi dùng chung khóa dãy.
- Website có **Lấy số PCT** (tiếp theo) và **Giữ số đã nhập** (kể cả số thấp hơn mốc).
- Số lớn nhất không phải hàng rào cấm chọn số cũ chưa dùng.
- Phiếu NKVH đã lưu có thể nhận số người khác đang giữ, kể cả dự định cấp giấy. Lượt chuyển thành
  ISSUED, lịch sử ghi người giữ trước; biểu mẫu cũ bị chặn. Website cập nhật lượt mỗi 5 giây.
- Cùng `id_pct` cập nhật một hồ sơ, kể cả sửa số. Khóa advisory + unique `(kind, nkvhPctId)`
  ngăn các đường tạo và gắn link sinh hồ sơ trùng.
- Số đích đã thuộc phiếu khác (giấy/điện tử/phiếu hủy): báo xung đột, không ghi đè.
- Số gõ tay đã thấy trên danh sách NKVH được ghi OBSERVED, kể cả số thấp hơn hoặc vượt dãy.
  OBSERVED không được tiếp tục cấp giấy hoặc hủy như lượt chưa dùng.
- Số cũ của hồ sơ đã đổi số theo NKVH chuyển REVIEW. Không tự giải phóng; người giữ đối chiếu
  và xác nhận chưa sử dụng trước khi giải phóng.
- Hủy lượt RESERVED/REVIEW chưa dùng → RELEASED và lưu lịch sử. Hủy phiếu đã cấp → CANCELLED;
  quy tắc mở lại số phiếu hủy ở Mốc sổ giấy vẫn là thao tác riêng.
- Lượt giữ cho NKVH chưa cấp vẫn xuất hiện trên website. Có thể tiếp tục cho giấy nếu chưa dùng
  hoặc hủy lượt sau đối chiếu. Khi NKVH lưu sau đó bằng số đã cấp giấy thì báo xung đột.

## Đồng bộ và đối chiếu

- NKVH đã có số: **Đồng bộ số hiện có** nhận dữ liệu đọc lại từ NKVH, không cấp số mới.
- Chấp nhận hậu tố `…/VH1-NĐDH` và `…/NĐDH-VH1`; giữ nguyên số chính thức ở `WorkPermit.nkvhNumber`.
  `number` vẫn là phần số chuẩn hóa để chống trùng cùng dãy.
- Tổ máy không bắt buộc khi đồng bộ. Chưa xác định lưu UNKNOWN; không mặc định COMMON.
- Cương vị đọc từ **Chức danh người cho phép làm việc**, ánh xạ theo position-catalog. Chưa khớp
  thì mở phần chọn xác nhận; không dùng cương vị lần trước để thay giá trị NKVH.
- Danh sách tự đối chiếu phiếu trong 48 giờ đang hiển thị, giới hạn 10 phiếu/lượt quét.
  Không quét toàn bộ lịch sử hoặc tự điều khiển phân trang. Phiếu cũ đồng bộ thủ công.
- Dừng/hủy/kết thúc NKVH được ghi về sổ. Phiếu hủy chưa có hồ sơ có nút nhận về ở trạng thái hủy.
- NKVH và website vẫn có khoảng trễ: hai phiếu đã cấp trùng số phải đối chiếu.
  Cấp ở máy chưa có tiện ích hoặc không mở danh sách có thể chưa được website biết ngay.

## Cấu trúc và phát hành

Cần máy chủ mới và SQL `prisma/manual/work-permit-nkvh-saved-sync.sql` trước khi phát hành tiện ích.
SQL chỉ thêm cột/index, không sửa dữ liệu. Unique có thể từ chối nếu dữ liệu cũ trùng; dùng script
SELECT `npx tsx scripts/check/work-permit-number-conflicts.ts` để đối chiếu trước, không tự gộp.
Không chạy db:push để áp toàn bộ schema hoặc tự xóa hồ sơ trùng.

Các file JS mới phải có trong cả `chrome-extension/scripts/package-nkvh-pct.mjs` và
`lib/server/nkvh-pct-extension-package.ts`. Gói tải website và gói đóng sẵn cùng version 1.1.0.

Cài bằng Load unpacked Chrome/Edge; cập nhật xong Reload tiện ích và tải lại tab NKVH.
Đóng gói thử localhost: `node chrome-extension/scripts/package-nkvh-pct.mjs --localhost`.
Gói `chrome-extension/dist/nkvh-pct-localhost-v1.1.0.zip` mặc định gọi `http://localhost:3030`,
có thể chọn cổng 3000 trong popup; không có quyền gọi máy chủ duyenhai1.vn.
Giải nén, chọn thư mục bằng Load unpacked và đăng nhập localhost trên cùng trình duyệt.
Tiện ích GET kiểm tra protocolVersion 2 để tránh dùng luồng mới với máy chủ cũ.
Phiếu QLVH khác VH hoặc đơn vị ngoài không thuộc luồng này. Cookie không được đọc hoặc chuyển đi;
service worker gọi website với cookie đăng nhập do trình duyệt tự gắn.

## Kiểm tra

- `npx tsx --test tests/work-permits/*.test.ts`: nghiệp vụ bằng bộ nhớ cô lập.
- `node scripts/verify/nkvh-extension.mjs`: HTML/API giả lập, xác nhận lưu lỗi không đồng bộ,
  đọc dữ liệu đã lưu, lưu yêu cầu khi mất mạng và gửi lại; không truy cập NKVH thật/DB.
- `npx tsx scripts/verify/thu-nkvh-claim.ts`: DB localhost đã có cấu trúc mới,
  một giao dịch luôn hoàn tác. Không chạy trên production.
- `npm run verify:ui -- --preset=pct-cap-so`: biểu mẫu cấp giấy giả lập, không cấp phiếu thật.

Trước bỏ sổ ghi số thủ công: đối chiếu dữ liệu cũ, kiểm thử đồng thời trên PostgreSQL và
kiểm thử Lưu trên NKVH thật ở cả hai loại phiếu bằng lượt được phép cấp.
