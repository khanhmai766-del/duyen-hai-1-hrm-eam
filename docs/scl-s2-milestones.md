# Mốc tiến độ SCL S2 — 2026

Trang chủ và chuông thông báo dùng cùng dữ liệu `/api/overhaul-milestones`.
Mọi người đăng nhập được xem; chỉ tài khoản `ADMIN` đang bật chế độ quản trị được
thêm, sửa, xoá. API vẫn kiểm tra quyền `operation-events` và giới hạn tài khoản chỉ đọc.
Các vai trò khác không được ghi kể cả có mức `manage/full` của quyền này.
Mốc đơn nhắc đúng ngày; khoảng ngày nhắc đầu/cuối, theo `Asia/Ho_Chi_Minh`.
Đây là lịch kế hoạch, không xác nhận hoàn thành hoặc tự kết luận chậm tiến độ.

Nền trang chủ có minh hoạ SVG chuyển động theo nội dung mốc hôm nay (tách lưới,
cẩu rotor, tuabin, áp lực, Diesel, nước tuần hoàn, đốt lò, thiết bị điện). Có nhiều
mốc thì luân phiên mỗi 7 giây; không có mốc dùng nền bảo dưỡng chung. Mốc ngừng
trở trục dùng rotor đứng yên. Nền không nhận thao tác và không thay thế nội dung lịch.
Chuyển động dừng khi phần này ra ngoài vùng nhìn, tab ẩn hoặc người dùng bật
`prefers-reduced-motion`. Kiểm tra: `node scripts/verify/overhaul-animation.mjs`.

## Nguồn đã đối chiếu

`PL2. Mốc đường găng SCL S2-DH1 2026.xls`, sheet `LH-TB S2-DH1`: 34 nội dung, cộng 2 mốc theo sơ đồ cập nhật
06/10/2026 — **Cắt điện MBA chính** 07h00 09/10 (Ngày 4) và **Đóng điện MBA chính** 17h00 10/11 (Ngày 36) — tổng
36 nội dung (22 mốc đơn, 14 khoảng ngày), tương ứng 50 lần nhắc. Thêm mốc mới vào DB đã nạp:
`npx tsx scripts/data-ops/add-overhaul-milestones.ts` (xem trước) rồi `--commit`. Ngày 1 là **06/10/2026** (file gốc
ghi 07/10; dời sớm 1 ngày ngày 05/10/2026 cho khớp các tab tiến độ trên Google Sheets).
Khoảng ngày lấy hai đầu ngoặc; không lấy vị trí mũi tên nối giữa nhãn làm ngày riêng.
Dữ liệu nằm ở `lib/overhaul-milestones-source.ts`. Mốc cuối là 03/12; tiêu đề lịch
đến 04/12 nhưng file không ghi một công việc riêng ngày đó.

Bộ mốc đã nạp vào DB không tự đổi theo file nguồn. Dời ngày bộ đã nạp bằng
`npx tsx scripts/data-ops/shift-overhaul-milestones.ts` (xem trước) rồi thêm `--commit`:
chỉ dời mốc còn đúng ngày cũ của file, mốc đã sửa tay trên web để nguyên và liệt kê ra.

## Localhost

```powershell
npx prisma generate
# DB local phải đang chạy. Chỉ thực hiện SQL bổ sung bảng này, không db:push toàn bộ.
npx prisma db execute --file prisma/manual/add-overhaul-milestones.sql --schema prisma/schema.prisma
npx tsx scripts/import/overhaul-milestones-local.ts
npm run dev -- -p 3030
```

Bộ nạp chỉ chấp nhận DB localhost; chỉ thêm mã nguồn chưa có. Mốc sửa trên web giữ
nguyên khi nạp lại. Xoá trên web là xoá mềm, giữ mã nguồn để bộ nạp không tự phục hồi.
Không tự nạp dữ liệu hay tạo bảng khi người dùng mở trang.

## Kiểm tra

```powershell
npx tsx --test tests/overhaul-milestones.test.ts
npx tsx scripts/verify/overhaul-milestones.ts
npx tsx scripts/verify/overhaul-milestones-browser.ts
npm run verify:ui -- --preset=scl-s2
```

Script API chỉ dùng tài khoản/mốc tạm trên localhost và dọn trong `finally`.
Script browser kiểm tra 5 ngày, bấm chuông mở đúng mốc và sửa/xoá/thêm qua giao diện
bằng response giả lập, không ghi lên bộ mốc thật.
Preset giao diện chỉ SELECT và giả lập response theo ngày 22/11, không sửa đồng hồ
hệ thống hay dữ liệu. Các preset `scl-s2-ngay-dau`, `scl-s2-ngay-cuoi`, `scl-s2-het-lich`
kiểm tra ngày 06/10, 03/12 và 04/12. Ảnh nằm trong `reports/verify/` (gitignore).

Nút “Xem sơ đồ” cạnh “Xem toàn bộ lịch” trên trang chủ mở trực tiếp popup sơ đồ;
đóng bằng nút X hoặc Escape. Hình sơ đồ đường găng SVG từ chính dữ liệu lịch: ô mốc đơn phía trên,
thanh khoảng ngày phía dưới. Phóng to để cuộn, đọc rõ và bấm mở chi tiết; tải PNG
độ phân giải gấp đôi để chia sẻ. Sửa lịch sẽ cập nhật cả hình và phần nhắc mốc.
Sơ đồ giữ ngày chính xác, bố trí lại ô chữ để tránh đè nhau; không suy diễn quan hệ
phụ thuộc hoặc kết quả hoàn thành. Kiểm tra tải ảnh và tương tác bằng
`node scripts/verify/overhaul-diagram.mjs` sau `npm run verify:ui-session`.

Việc build, triển khai, áp SQL hoặc nạp dữ liệu production là bước riêng cần được yêu cầu.
