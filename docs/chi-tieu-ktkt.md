# Quản lý chỉ tiêu KTKT

Tích hợp gói `ctktkt-dashboard-transfer-2026-11-04.zip` vào EAM. Thông tin nguồn và SHA-256 của gói nằm ở `modules/ctktkt/SOURCE.json`. Mã tính toán, mẫu Excel và các quy tắc số liệu được giữ từ gói nguồn; bộ kết nối, đăng nhập, đường dẫn và khung giao diện được chuyển sang kiến trúc của EAM.

## Màn hình

Thanh bên có nhóm **QUẢN LÝ CHỈ TIÊU KTKT**, gồm Dữ liệu các tháng, Báo cáo Chỉ tiêu KTKT, Báo cáo sản xuất, Theo dõi lượng nước, Theo dõi hóa chất, Suất hao nhiệt PPA và Báo cáo PMIS. Bên phải tiêu đề có ba nút biểu tượng: Tiện ích đồng bộ, Sao lưu & nạp dữ liệu (chung một màn hình), Nhật ký số liệu. Hai nút quản trị dữ liệu hiện theo quyền quản trị KTKT; không lặp lại các mục này trong hàng tab báo cáo hoặc thanh bên. Các chức năng sao lưu/nạp/nhật ký đã có trong gói nguồn; phần nhận ZIP chia nhỏ được bổ sung khi tích hợp. Tuyến gốc: `/tien-ich/chi-tieu-ktkt`.

Các màn hình nằm trong khung ứng dụng EAM và sử dụng NextAuth hiện tại. Không tạo thêm tài khoản hoặc cookie đăng nhập của dự án nguồn. `User.id` hiện tại là danh tính người thao tác; quyền lấy từ RBAC của EAM, áp theo cương vị **đang làm việc** do `requireUser()` trả về. Ngày 04/11/2026 đã SSH **chỉ đọc** và đối chiếu 25 tên cương vị chính trên production (174 tài khoản đang hoạt động); các tên khớp chính sách CTKTKT. Không sửa nhân sự trên server.

Quyền `ctktkt-access` mở phân hệ; các quyền `ctktkt:<tên quyền nguồn>` xuất hiện trong Quản trị → Phân quyền. Mức Cá nhân áp theo phạm vi cương vị của gói nguồn; Quản lý/Toàn quyền cấp trực tiếp chức năng tương ứng. VIEWER mặc định chỉ xem. Quyền quản trị KTKT (`ctktkt:manage_users`) mặc định chỉ ADMIN và bao gồm toàn quyền phân hệ, sao lưu, khôi phục và cấu hình; quản lý tài khoản vẫn ở EAM. Tài khoản tra cứu chỉ giới hạn (`DEFECT_READ_ONLY`) chưa được mở phân hệ này.

## PostgreSQL và dữ liệu bàn giao

Dùng chính `DATABASE_URL` của EAM, với 17 bảng có tiền tố `ctktkt_`. Cấu trúc được khai báo trong `prisma/schema.prisma`. `modules/ctktkt/db` dùng tham số PostgreSQL, bảo toàn alias camelCase, chuỗi thời gian UTC và số đo double precision. Giao dịch dữ liệu ngày, nhật ký và phiên bản đọc cùng commit hoặc rollback. Không có thao tác tạo bảng/nạp nhân sự trong các GET của báo cáo.

File bổ sung cấu trúc riêng: `prisma/manual/add-ctktkt.sql`. File chỉ thêm các bảng/index KTKT, không chạm bảng hiện hữu. Không dùng `db:push` để nâng cấp toàn bộ cơ sở dữ liệu đang có. Index duy nhất có điều kiện của `chemical_usage_logs.source_key` được ghi trong file SQL vì Prisma 5 chưa biểu diễn index một phần.

Gói backup được cung cấp riêng `ctktkt-backup-all-2026-11-04 (2).zip`, đã kiểm checksum và nạp vào **PostgreSQL local**:

| Nhóm | Bản ghi |
| --- | ---: |
| Số liệu ngày / KTKT / PMIS | 114.348 |
| Thông số nửa giờ | 24.588 |
| Sự kiện vận hành | 732 |
| Suất hao nhiệt PPA | 95 |
| Ca nước | 193 |
| Sử dụng hóa chất | 833 |
| Chỉ tiêu theo kỳ | 0 |
| Danh sách trưởng ca | 6 |
| **Tổng (145 tệp)** | **140.795** |

Số lượng sau nạp khớp nguồn. Không đưa gói backup/số liệu vận hành vào Git hoặc `public/`. ID người nhập cũ dạng số được giữ dưới dạng chuỗi lịch sử cùng họ tên/cương vị; không dùng ID đó để tạo hay ghép tài khoản EAM. Người nhập mới dùng CUID của tài khoản EAM.

Chức năng sao lưu hỗ trợ JSON theo khoảng ngày và ZIP chia phần cho toàn bộ dữ liệu. Nạp có kiểm checksum, xem trước và xác nhận, mặc định chỉ bổ sung bản ghi thiếu. Toàn bộ các phần và nhật ký khôi phục được nạp trong một giao dịch; bất kỳ lỗi ghi nào sẽ rollback. Giới hạn ZIP 25 MB, tổng giải nén 50 MB/250.000 bản ghi; mỗi JSON tối đa 3 MB/12.000 bản ghi. Tệp người dùng tải lên đi qua `inspectUpload()`.

Script kiểm tra/nạp:

```sh
# Chỉ đọc và kiểm tra gói
npx tsx scripts/import/ctktkt-backup.ts '/đường/dẫn/backup.zip'

# Khởi tạo/nạp vào DB local
npx tsx scripts/import/ctktkt-backup.ts '/đường/dẫn/backup.zip' --apply --init-schema

# Chỉ khi được phép nạp production; chạy trên VPS sau khi deploy --sql add-ctktkt.sql
# Chỉ bổ sung bản ghi thiếu, không ghi đè bản ghi đã có.
npx tsx scripts/import/ctktkt-backup.ts '/đường/dẫn/backup.zip' --apply --production
```

## Kiểm tra

```sh
npx tsc --noEmit
npx tsx --test tests/ctktkt/*.test.mjs tests/ctktkt/domain/*.test.mjs
npx tsx scripts/verify/ctktkt.mjs
npx tsx scripts/verify/ctktkt-machine.mjs
MSYS_NO_PATHCONV=1 npm run verify:ui -- --preset=ctktkt-integration --widths=360,1280
```

Script kiểm tra API chỉ chạy local, tạo rồi xóa tài khoản tạm; kiểm đọc số liệu, VIEWER bị chặn ghi/khôi phục, mở lại Excel xuất ra, tải ZIP rồi kiểm tra toàn bộ phần và xem trước nạp, ghi/audit/rollback trên các dòng riêng được dọn sau đó. Preset ảnh dùng dữ liệu KTKT thật local; chỉ giả lập API thông báo đại tu vì DB local cũ thiếu cột của phân hệ đại tu, không sửa dữ liệu đó để chụp ảnh.

## Tiện ích nguồn và tên miền phụ

Các bản tiện ích QLKT/NKVH của gói này nằm riêng tại `public/ctktkt/`, đã cập nhật đường dẫn và danh sách host cho `duyenhai1.vn`, `ctktkt.duyenhai1.vn` và local. Không thay các tiện ích DH1 đang sửa dở trong `chrome-extension/`. Chưa kiểm nghiệm với phiên đăng nhập EVN nội bộ; phải cài bản ZIP mới khi kiểm tra đồng bộ thực tế. Google Sheets/AI vẫn cần cấu hình khóa và quyền truy cập tương ứng; liên kết mirror chỉ hiện khi cấu hình hoạt động.

Trang `/tien-ich/chi-tieu-ktkt/tien-ich-dong-bo` có nút tải QLKT v0.4.41 và NKVH v0.2.1 cùng hướng dẫn cài Chrome/Edge. Đóng gói lại sau khi sửa tiện ích bằng `node chrome-extension/scripts/package-ctktkt.mjs`; danh sách tệp được cố định trong script này.

Có thể thêm `ctktkt.duyenhai1.vn` trỏ vào cùng ứng dụng; cần cấu hình DNS, HTTPS, định tuyến và phiên đăng nhập trước khi sử dụng. Tên miền phụ chưa được cấu hình. Ngày 04/11/2026 người dùng đã cho phép đưa bản tích hợp KTKT lên `main`, build/deploy bằng quy trình production, thêm bảng KTKT và nạp gói backup theo chế độ chỉ bổ sung dữ liệu thiếu. Kết quả triển khai phải được xác nhận riêng sau khi chạy.

## API chia sẻ số liệu và dọn ảnh định kỳ

Đã chuyển hai chức năng kỹ thuật của gói nguồn vào cùng phân hệ:

- `GET /api/ctktkt/integration/v1/operating-data?period=YYYY-MM&dataset=pmis|ppa`: chỉ đọc, giữ JSON `version/dataset/period/entries` và cách tính từ nguồn. Chỉ lấy ngày trong kỳ đến ngày hiện tại theo giờ Việt Nam; đọc thêm ngày cuối kỳ trước để tính các chỉ số liên kết. Dùng `Authorization: Bearer <khóa>`; cấu hình **SHA-256 của khóa** vào `PXVH1_READ_API_KEY_SHA256`. Khóa gốc phải gồm 40–100 ký tự chữ, số, `_` hoặc `-`, giống quy ước nguồn. Không dùng mật khẩu hoặc cookie tài khoản EAM cho API này. Khi đổi/thu hồi hash, khóa cũ không còn truy cập được.
- `GET /api/ctktkt/cron/coal-photos`: dùng `Authorization: Bearer <CRON_SECRET>`. Xóa ảnh công tơ than đã đến `expires_at`, theo quy tắc lưu bốn ca của nguồn; dọn các bộ đếm OCR quá 24 bucket giờ. Hai nhóm được dọn trong cùng giao dịch. Không xóa số liệu vận hành hoặc báo cáo. Giữ JSON `{ "ok": true }` khi thành công.

Các endpoint này và hai endpoint Google mirror được đi qua lớp cookie để handler tự kiểm bearer riêng. Chỉ đúng đường dẫn/phương thức được miễn kiểm cookie; API báo cáo, cấu hình và dữ liệu thông thường vẫn yêu cầu đăng nhập. Thiếu/sai khóa trả 401; chưa cấu hình khóa thì chức năng tương ứng bị khóa.

Bản nguồn dùng Vercel Cron; VPS dùng cặp `scripts/systemd/dh1-ctktkt-coal-photos.service` và `.timer`. Lịch `00:00 UTC` (07:00 Việt Nam), giống bản nguồn; `Persistent=true` chạy bù khi máy bỏ lỡ lịch. systemd không chạy chồng cùng service; câu xóa có thể chạy lại an toàn. `npm run ctktkt:cleanup-photos` gọi ứng dụng qua `127.0.0.1:${PORT:-3000}`, đọc `CRON_SECRET` từ môi trường/`.env`, không in khóa ra log và không theo redirect.

Khi **được yêu cầu triển khai và kích hoạt lịch trên VPS**, cần cấu hình các khóa phù hợp, triển khai ứng dụng theo hướng dẫn production, rồi cài timer:

```sh
cp scripts/systemd/dh1-ctktkt-coal-photos.service scripts/systemd/dh1-ctktkt-coal-photos.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now dh1-ctktkt-coal-photos.timer
systemctl list-timers dh1-ctktkt-coal-photos.timer --all --no-pager
```

Các lệnh cài timer ở trên là tài liệu, chưa chạy trên VPS. Kiểm tra local bổ sung bao gồm khóa sai/thiếu/thu hồi, tham số kỳ, hợp đồng PMIS/PPA với số 0 và giá trị thiếu, giới hạn ngày, lỗi DB, truy cập không cookie, đọc dữ liệu PostgreSQL thật và dọn ảnh trên bảng TEMP riêng (rollback sau kiểm tra).
