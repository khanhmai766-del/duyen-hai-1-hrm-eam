# Quản lý chỉ tiêu KTKT

Tích hợp gói `ctktkt-dashboard-transfer-2026-11-04.zip` vào EAM. Thông tin nguồn và SHA-256 của gói nằm ở `modules/ctktkt/SOURCE.json`. Mã tính toán, mẫu Excel và các quy tắc số liệu được giữ từ gói nguồn; bộ kết nối, đăng nhập, đường dẫn và khung giao diện được chuyển sang kiến trúc của EAM.

## Màn hình

Thanh bên có nhóm **QUẢN LÝ CHỈ TIÊU KTKT**, gồm Dữ liệu các tháng, Báo cáo Chỉ tiêu KTKT, Báo cáo sản xuất, Theo dõi lượng nước, Theo dõi hóa chất, Suất hao nhiệt PPA và Báo cáo PMIS. Bên phải tiêu đề có ba nút biểu tượng: Tiện ích đồng bộ, Sao lưu & nạp dữ liệu (chung một màn hình), Nhật ký số liệu. Hai nút dữ liệu hiện theo quyền sao lưu/nạp và xem nhật ký; không lặp lại các mục này trong hàng tab báo cáo hoặc thanh bên. Các chức năng sao lưu/nạp/nhật ký đã có trong gói nguồn; phần nhận ZIP chia nhỏ được bổ sung khi tích hợp. Tuyến gốc: `/tien-ich/chi-tieu-ktkt`.

Các màn hình nằm trong khung ứng dụng EAM và sử dụng NextAuth hiện tại. Không tạo thêm tài khoản hoặc cookie đăng nhập của dự án nguồn. `User.id` hiện tại là danh tính người thao tác; quyền lấy từ RBAC của EAM, áp theo cương vị **đang làm việc** do `requireUser()` trả về. Ngày 04/11/2026 đã SSH **chỉ đọc** và đối chiếu 25 tên cương vị chính trên production (174 tài khoản đang hoạt động); các tên khớp chính sách CTKTKT. Không sửa nhân sự trên server.

RBAC chung chỉ giữ `ctktkt-access` để mở/xem phân hệ. Các mức khác `none` của quyền cửa vào này đều không cấp quyền nghiệp vụ. Các dòng/ngoại lệ `ctktkt:<tên quyền nguồn>` cũ được bỏ khỏi API và màn hình RBAC; mã KTKT không dùng chúng nữa. Các cấu hình RBAC khác được giữ nguyên.

Quyền nghiệp vụ nằm tại **Phân quyền KTKT** (`/tien-ich/chi-tieu-ktkt/phan-quyen`), mở bằng nút cạnh thao tác sao chép Excel. Bảng chọn cương vị cho từng nhóm quyền, có tìm kiếm, lọc cương vị đã giao và chọn/bỏ cả cột đang hiển thị. Nhóm sao lưu, nạp, nhật ký và sửa phân quyền được tách riêng. Quyền **Toàn quyền KTKT** bao gồm mọi thao tác trong phân hệ. Chỉ người có quyền sửa phân quyền hoặc toàn quyền KTKT mới được mở/lưu bảng.

Quyền lấy theo **cương vị đang làm việc**, không suy rộng từ vai trò VIEWER/SUPERVISOR/TECHNICIAN/MANAGER của web. Vì vậy VHV mang vai trò VIEWER vẫn nhập đúng các nhóm ô được giao, còn Giám sát không tự có thêm quyền PPA/hóa chất. Khi đổi cương vị, quyền KTKT đổi ở lần yêu cầu tiếp theo. Tài khoản tra cứu giới hạn (`DEFECT_READ_ONLY`) và tài khoản đang buộc đổi mật khẩu vẫn bị chặn. ADMIN đang bật chế độ quản trị website luôn có toàn quyền để phục hồi cấu hình; điều này không nâng quyền hệ thống cho người được giao quản trị KTKT.

Cấu hình được lưu trong bảng `RbacConfig` có sẵn, khóa `ctktkt-position-permissions`, gồm phiên bản và đầy đủ danh sách cương vị cho từng quyền. Không cần thêm bảng/cột. Chưa từng lưu thì dùng mặc định theo mã nguồn gốc (25 cương vị); không tự ghi cấu hình trong GET. Mảng rỗng đã lưu là **không cấp quyền**, không phục hồi mặc định. Nút **Khôi phục mặc định bản gốc** chỉ thay bản nháp sau xác nhận; cần bấm **Lưu phân quyền** mới áp dụng. Cấu hình tùy chỉnh của hệ thống gốc không có trong gói backup nên không được coi là đã chuyển.

Lưu cấu hình dùng compare-and-swap và `expectedVersion`; hai người mở cùng phiên bản không ghi đè nhau (409, giữ bản nháp và yêu cầu tải lại). Cấu hình lỗi không âm thầm cấp quyền mặc định. Mỗi lần lưu có nhật ký `UPDATE_CTKTKT_PERMISSIONS`. Quyền bao trùm nhập KTKT/nước/hóa chất được quy đổi sang nhóm nhỏ, nên bỏ chọn một nhóm không bị quyền nhập toàn bộ cấp lại; quyền Toàn quyền KTKT là ngoại lệ được nêu rõ trên màn hình.

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
npx tsx scripts/verify/ctktkt-permissions.mjs
MSYS_NO_PATHCONV=1 npm run verify:ui -- --preset=ctktkt-integration --widths=360,1280
MSYS_NO_PATHCONV=1 npm run verify:ui -- --preset=ctktkt-permissions --widths=360,1280
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

Kiểm tra phân quyền bao gồm 25 cương vị × 4 vai trò, nhập theo nhóm và các ô ngoài nhóm, thu hồi quyền rỗng, quyền dữ liệu độc lập, đổi cương vị, ADMIN phục hồi, kiểm dữ liệu đầu vào và xung đột phiên bản. Script API phân quyền chỉ chạy local: tạo cương vị/tài khoản tạm, cấp và thu hồi quyền riêng cho chúng, kiểm 403/409, sau đó hoàn tác cấu hình bằng CAS và dọn tài khoản/nhật ký kiểm thử. Không sửa quyền của nhân sự thật trên production khi kiểm tra local.

## Kiểm tra nguồn yêu cầu sau Nginx

Các thao tác ghi dùng chung `modules/ctktkt/lib/request-origin.ts`: chấp nhận cùng origin trực tiếp hoặc origin công khai khai báo trong `NEXT_PUBLIC_APP_URL` (mặc định `https://duyenhai1.vn`). Không lấy origin được tin cậy từ `Host`/`X-Forwarded-*` do bên gọi gửi. Trường hợp Nginx chuyển HTTPS sang HTTP nội bộ không bị từ chối nhầm. Nguồn khác vẫn trả 403; các endpoint trước đây bắt buộc Origin tiếp tục yêu cầu header này. Khi triển khai ở tên miền khác phải cấu hình URL công khai đúng. Không thay đổi quyền hoặc công thức KTKT.

## Ảnh công tơ chỉ dùng trong lượt đọc

Luồng OCR mới không ghi ảnh vào database hoặc kho tệp. Ảnh chỉ được gửi trong yêu cầu nhận dạng; sau khi nhận kết quả, trình duyệt thu hồi object URL và bỏ tham chiếu file, giữ lại chỉ số để người dùng kiểm tra và xác nhận. Đóng cửa sổ cũng bỏ các ảnh tạm còn lại. Ảnh đọc lỗi còn trong lượt nhập để thử lại hoặc chọn ảnh khác. Không tự lưu chỉ số khi OCR xong.

Mục ảnh đã lưu và nút đối chiếu kho ảnh được bỏ khỏi giao diện. Ảnh lịch sử có sẵn không bị xóa hàng loạt trong lần sửa mã này; cơ chế dọn ảnh hết hạn cũ vẫn hoạt động. Không có cam kết xóa bộ nhớ vật lý hay chính sách lưu phía dịch vụ nhận dạng Gemini.

## Bố trí theo ba máy chủ của PX

- Server 1: ứng dụng Next.js, giao diện, API, kiểm tra quyền và tạo báo cáo theo yêu cầu. Không cấu hình database local cho production.
- Server 2: PostgreSQL dùng DATABASE_URL chung của EAM. KTKT chỉ lưu số liệu, kết quả nhận dạng, cấu hình và nhật ký trong các bảng ctktkt_.
- Server 3: kho S3 chung của EAM, cấu hình bằng S3_ENDPOINT/S3_BUCKET và các khóa hiện có. Tệp cần lưu lâu dài phải qua lib/s3.ts; không thêm kho riêng hoặc lưu nội dung ảnh vào database. KTKT hiện chưa có yêu cầu giữ bản tệp báo cáo; Excel tạo để tải xuống không tự lưu trên server.
- Ảnh công tơ: ngoại lệ theo yêu cầu không lưu trữ — chỉ xử lý trong lượt OCR, không chuyển sang Server 3. Ảnh cũ vẫn theo lịch hết hạn, chưa xóa hàng loạt.
- Google Sheets: bản đồng bộ báo cáo, không phải database chính và không phải Server 3.

Kiểm tra chỉ đọc trên Server 1 sau khi có mã mới: node scripts/check/ctktkt-architecture.mjs. Công cụ không in khóa/URL, không ghi DB, không upload tệp; kiểm tra cấu hình, bảng KTKT và kết nối mạng tới kho S3. Kết quả địa chỉ khác nhau chưa chứng minh ba máy chủ vật lý; cần đối chiếu cấu hình hạ tầng do người quản trị cung cấp. Dung lượng và quyền ghi S3 cần kiểm tra riêng trên hệ thống quản trị.

Cập nhật: ảnh OCR được giữ tạm trong trình duyệt 5 phút kể từ lần đọc thành công gần nhất để đối chiếu, hết hạn tự thu hồi. Đóng cửa sổ hoặc bỏ ảnh sẽ giải phóng sớm. Không upload vào kho lưu trữ. Chỉ số AI giữ đầy đủ phần thập phân và chuỗi giá trị khi gửi lưu, không cắt hai chữ số.

## Kiểm soát sửa Báo cáo chỉ tiêu KTKT theo ca

Áp dụng cho ô nhập của toàn bộ Báo cáo chỉ tiêu KTKT, không đổi công thức hoặc quyền nhập theo cương vị. Ca sửa được xác định theo thời điểm lưu lần đầu, giờ Việt Nam: sáng [06,14), chiều [14,22), đêm [22,06 ngày sau). Mốc ghi công tơ 08/16/24 và kỳ báo cáo giữ nguyên; không đổi cách tính sản lượng vì giờ giao ca.

Mỗi ô lưu mới ghi người nhập và đầu ca vào ctktkt_input_ownership. Người nhập chỉ tự sửa ô chính mình đã nhập trong cùng ca; xóa ô không xóa dấu sở hữu để không thể xóa rồi nhận lại ở ca sau. Quản trị website (SessionUser.role=admin) được sửa trực tiếp và là đối tượng duy nhất được duyệt; quyền sửa phân quyền KTKT riêng không đủ để duyệt.

Qua ca, mở Yêu cầu chỉnh sửa, chọn các ô và giá trị mới hoặc lấy danh sách ô đang sửa, nhập lý do rồi gửi. API dùng cùng kiểm tra loại dữ liệu, ngày, quyền và ô liên kết như lưu thường. Yêu cầu không ghi số liệu ngay. Người dùng chỉ thấy yêu cầu của mình, quản trị thấy danh sách để duyệt hoặc từ chối. Khi duyệt, khóa yêu cầu và từng ô, đối chiếu giá trị/ghi chú/thời điểm cập nhật/ID nhật ký, cập nhật số liệu + nhật ký + phiên bản đọc + trạng thái yêu cầu trong cùng giao dịch. Yêu cầu đã xử lý không thể duyệt lại.

Dữ liệu lịch sử chưa có dấu sở hữu không được tự nhận là của người đang xem; sửa trực tiếp bị chặn, chỉ có thể đề nghị quản trị kiểm tra nguồn gốc trước khi duyệt. Không đổi số liệu lịch sử hoặc suy đoán chủ sở hữu khi triển khai.

Triển khai cần áp dụng riêng prisma/manual/add-ctktkt-corrections.sql trước khi chạy mã mới (deploy qua --sql theo hướng dẫn). Hai bảng nằm trên PostgreSQL chung Server 2, không dùng tệp cục bộ hay Google Sheets để lưu duyệt. Chưa áp dụng SQL này lên production. Chưa có bảng thì API lưu trả thông báo chưa triển khai và không ghi bỏ qua quy tắc.

Với số liệu đã có trước khi bật quy tắc ca, chỉ nhận diện chủ sở hữu từ nhật ký đầu tiên nếu đó là thao tác insert từ ctktkt-report, có người nhập và thời điểm rõ ràng; không nhận chủ sở hữu từ nhật ký khôi phục/đồng bộ hoặc một lần sửa sau đó.

Để không đi vòng kiểm soát ca, thao tác nạp JSON/ZIP chứa field_code KTKT: yêu cầu tài khoản quản trị, dù tài khoản khác có restore_data. Quyền xem trước và tải sao lưu giữ nguyên. Nạp dữ liệu các mục khác giữ quyền cũ.

## Công thức và file xuất khớp web cũ (08/11/2026)

Web cũ (ctktkt-dashboard, commit 5c4659c) là chuẩn cho công thức, cách tính, số liệu và file xuất, trừ các điểm ghi rõ "giữ theo web mới".

Đã đưa về giống web cũ:

- File Excel Chỉ tiêu KTKT: chặn lỗi chia 0 như web cũ (`IFERROR(...ERROR.TYPE=2...)`) trên mọi sheet; I169..K172 giữ công thức gốc của mẫu.
- File Lượng nước: suất nước khi điện phát = 0 để trống, không ghi 0.
- PPA: ngày cả hai tổ ngừng lưu được (sản lượng 0, không đánh giá SHN), hiện trên web, file và Google Sheets như web cũ; PMIS bỏ số cũ của tổ ngừng.
- Dán từ Excel/Google Sheets lấy giá trị gốc trong clipboard (vd. độ ẩm 8,2567 hiển thị 8,3).

Giữ theo web mới (quyết định 08/11/2026):

- Nhiệt trị than chung nhà máy: thiếu số của một tổ thì tổ đủ số dùng nhiệt trị của chính tổ đó.
- Điện tự dùng toàn nhà máy và tỷ lệ I27/I145: loại phần điện nhận lưới cấp cho tổ ngừng. File Excel ghi công thức tương ứng ở I25/I27 (`ctktkt-auxiliary-export-rules.ts`). Bảng chỉ tiêu hiện "Ngừng máy — không đánh giá"/"Thiếu dữ liệu" cho suất hao và tỷ lệ tự dùng.
- Tổng tự dùng PMIS L157 (S1) / L158 (S2) — `ctktkt-pmis-auxiliary.ts`, dùng chung cho màn hình (tab PMIS) và file xuất: tổ có phát = (đầu cực − xuất tuyến) + điện nhận qua xuất tuyến của tổ; không phát, có nhận qua xuất tuyến của tổ (285 → S1, 283 → S2, `GRID_RECEIVE_S1/S2` từ “Đồng bộ tất cả” QLKT) = điện nhận; không phát, không nhận = lấy qua TD21 (lẽ ra xuất tuyến 284, CSV 284 đang hỏng) → `=I24`. Trường hợp đặc biệt (nhận xuất tuyến rồi cắt điện MBA…) nhập tay ở `PMIS_AUX_MANUAL_S1/S2` (kèm lý do `PMIS_AUX_NOTE_*`), số nhập tay luôn ưu tiên. Thiếu chỉ số TD21 hoặc cả hai tổ cùng qua TD21 thì giữ J − K. L162 = L158 + L157 như file gốc.
- Ảnh công tơ than: lưu trên kho tệp Server 3 (S3, thư mục `ctktkt/coal-meter-photos/`) 30 giờ kể từ mốc ca để TKĐ đối chiếu ("Đối chiếu ảnh" ở bảng công tơ than), sau đó tự xoá (xoá tệp trước rồi xoá dòng). Bảng `ctktkt_coal_meter_photos` chỉ giữ khoá ảnh (`s3:...`) và kết quả đọc, không giữ nội dung ảnh. Dọn ảnh chạy mỗi lần mở/đọc/lưu ảnh và qua `/api/ctktkt/cron/coal-photos` (Bearer CRON_SECRET). Tối đa 600 ảnh còn hạn. Kho tệp lỗi thì vẫn trả số đọc được, báo chưa lưu ảnh. Hộp đọc ảnh không tự ẩn ảnh; ảnh chỉ tự xoá khi hết 30 giờ.
- Số đọc từ ảnh ghi đầy đủ như máy đọc (không cắt còn 2 chữ số thập phân như web cũ).
- Giao diện, đường dẫn `/api/ctktkt/*`, đăng nhập dùng chung, PostgreSQL, phân công nhập và yêu cầu sửa theo ca.

## Hiệu chỉnh công tơ điện khi reset (08/11/2026)

Khi công tơ điện (máy phát, MBT, tự dùng TD 9X1/9X2 của S1/S2) bị reset hoặc thay trong ngày, Trực phụ/Trực chính điện nhập
"Hiệu chỉnh reset" (MWh) ở cột cuối bảng công tơ điện và ghi lý do. Ô: `ELEC_RESET_{S1|S2}_{8|9|10|11}`, `ELEC_RESET_NOTE_{S1|S2}`.

- Lượng điện trong ngày = số 24h ngày D − số 24h ngày D-1 + hiệu chỉnh (`lib/ctktkt-electric-meter-reset.ts`).
- File Excel ghi công thức `D21-C21+(hiệu chỉnh)` ở E20–E23 / H20–H23 và ghi chú lý do, giống cách file chuẩn cộng bù trực tiếp.
- Ví dụ 03/11/2026: MBT T1 reset 22h → hiệu chỉnh S1 hàng 9 = 6935855,62 + 280,956 = 6936136,576; MBT T2 về 0 khi S2 ngừng → hiệu chỉnh S2 hàng 9 = 6554821,3.
- Ô trống = 0; không báo thiếu số liệu.
