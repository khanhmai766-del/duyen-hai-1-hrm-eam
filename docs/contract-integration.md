# Tích hợp Quản lý hợp đồng

Tên trên website: **Quản lý hợp đồng**. Mục điều hướng nằm trong **QUẢN LÝ TÀI LIỆU SỐ**, đường dẫn `/documents/contracts`.

## Phạm vi mã nguồn

Chuyển từ `tcms-main.zip` sang Next.js 14 / React 18 của website:

- Tổng quan dùng số liệu API, không giữ hai tồn tại minh họa của bản gốc.
- Danh sách, thêm/sửa/chi tiết hợp đồng; thời hạn, cảnh báo và nhân sự giám sát.
- Hạng mục, hàng hóa, phạm vi công việc, quy tắc thời gian, nhật ký, checklist và nhập PDF.
- Quyết định giám sát, mốc tiến độ, kiểm tra, tồn tại kỹ thuật và nghiệm thu.
- Đơn vị, nhà thầu, nhân sự/phân quyền và tra cứu hồ sơ Drive.

Trang nằm trong `app/(dashboard)/documents/contracts`, API trong `app/api/tcms`, phần nghiệp vụ trong `lib/tcms`. API dùng envelope của website và giao diện truy cập qua TanStack Query. Mỗi mutation được ghi audit của website; các trigger PostgreSQL giữ audit chi tiết của phân hệ.

## Đăng nhập và quyền

Dùng phiên đăng nhập website qua `requireUser()`, kiểm tra tài khoản đang hoạt động và quyền `contract-access`. Không có đăng nhập TCMS riêng, không sử dụng biến DEV_AUTH của bản gốc.

`tcms.app_users.identity_subject` liên kết bằng `vh1:<User.id>`; đây là khóa kỹ thuật ổn định, không phải tên sản phẩm. Người quản trị chọn tài khoản website có sẵn ở trang **Nhân sự và phân quyền**. Máy chủ kiểm tra lại tài khoản được chọn; tên/email lấy từ website. Phân quyền chỉ tác động đến hợp đồng, không sửa tài khoản hay vai trò của website.

- Quyền `contract-access` cho phép mở phân hệ; vai trò/phạm vi trong TCMS quyết định dữ liệu được xem và thao tác được thực hiện.
- Quản trị nhân sự/đơn vị cần đồng thời mức `full` của `contract-access` và vai trò quản trị TCMS. Khi tắt chế độ quản trị website, quyền quản trị TCMS bị loại khỏi ngữ cảnh yêu cầu.
- SQL tích hợp khởi tạo liên kết cho các ADMIN đang hoạt động, với vai trò SYSTEM_ADMIN và CONTRACT_MANAGER toàn phân hệ. Các tài khoản khác được người quản trị cấp quyền cụ thể, không tự nhận quyền xem tất cả hợp đồng.
- Quyết định giám sát đã ban hành/còn hiệu lực có thể cấp phạm vi SUPERVISOR khi người đó chưa có vai trò khác. Nếu đã có vai trò khác, cấp phạm vi tường minh trong Nhân sự và phân quyền; không tự cộng các phạm vi làm vai trò mạnh hơn lan sang hợp đồng khác.
- Phiên website không được coi là đã xác thực SSO MFA. Việc lưu thay đổi trạng thái hợp đồng dùng phiên website và quyền CONTRACT_MANAGER trong phạm vi hợp đồng. Các kiểm tra MFA của chức năng xuất/lưu trữ nhạy cảm gốc vẫn giữ nguyên.
- Tất cả SQL nghiệp vụ chạy trong transaction bằng kết nối database hiện có của website. Kết nối phải không phải superuser và không có `BYPASSRLS`; mọi bảng nghiệp vụ bật `FORCE ROW LEVEL SECURITY` để chủ bảng cũng chịu chính sách RLS.

## Khởi tạo dữ liệu

Đã áp dụng đủ 21 migration trên cơ sở dữ liệu cục bộ `localhost:5433/powerplant` ngày 11/09/2026 theo xác nhận của người dùng. Đã liên kết 6 tài khoản quản trị hiện có (12 phân công vai trò). Kiểm tra sau khởi tạo: 0 hợp đồng, 0 nhà thầu, 0 hồ sơ; role runtime đọc được 25 bảng, 18 bảng bật RLS và role không có quyền bypass RLS. Khóa mã hóa cục bộ đủ 32 byte.

21 migration được lưu trong `prisma/manual/tcms`. Bảng mới nằm ở schema `tcms`; không thay thế bảng tài liệu hiện có, không chạy `prisma db push`, không nạp seed hợp đồng/nhà thầu giả.

Kiểm tra danh sách, **không kết nối hoặc ghi DB**:

```sh
npm run tcms:migrate
```

Chỉ khi người dùng cho phép khởi tạo cơ sở dữ liệu tương ứng:

```sh
npm run tcms:migrate -- --apply
```

Script dùng `TCMS_MIGRATION_DATABASE_URL_FILE`, hoặc `TCMS_MIGRATION_DATABASE_URL`, sau cùng là `DATABASE_URL` của website. Chạy trên DB có `public."User"`, bằng role được phép tạo schema/role/extension. Script khóa chống chạy đồng thời, bỏ qua migration đã ghi nhận và dừng khi có lỗi. Mỗi migration có transaction riêng; khi lỗi, các migration đã hoàn tất được giữ lại để có thể tiếp tục. Script không build, deploy, reload hay ghi dữ liệu nghiệp vụ mẫu.

Kết nối runtime dùng `TCMS_DATABASE_URL_FILE`, hoặc `TCMS_DATABASE_URL`, sau cùng là `DATABASE_URL`. Không cần tạo PostgreSQL role riêng; tài khoản kết nối hiện tại phải là role thường, không có quyền superuser/BYPASSRLS. Cấu hình TLS theo môi trường; `TCMS_DB_SSL=require` bật kiểm tra chứng thư. Lần tích hợp đầu nên dùng cùng DB của website.

## Khóa mã hóa và dịch vụ tùy chọn

Đã tạo khóa riêng cho môi trường cục bộ tại `.secrets/tcms-field.key` và tham chiếu trong `.env.local`; cả hai được Git bỏ qua. Không tự tạo hoặc đưa khóa này lên máy chủ.

Thông tin nhạy cảm của nhà thầu/hợp đồng được giữ định dạng AES-256-GCM từ bản gốc. Trước khi thêm nhà thầu/hợp đồng, cấu hình **một khóa 32 byte mã hóa Base64** qua một trong hai biến:

```dotenv
TCMS_FIELD_ENCRYPTION_KEY_FILE=/duong-dan-bi-mat/contract-key
# Hoặc TCMS_FIELD_ENCRYPTION_KEY do hệ thống quản lý bí mật cung cấp.
```

Khóa phải ổn định và được sao lưu riêng. Không dùng AUTH_SECRET làm khóa; thay/mất khóa sẽ không đọc được dữ liệu đã mã hóa. Không commit khóa vào Git.

Nhập PDF giữ provider AI của bản gốc và chỉ gửi khi người dùng chủ động chọn tệp, xác nhận và yêu cầu trích xuất. Cấu hình provider/API key theo `lib/tcms/server/pdf`; chưa thực hiện cuộc gọi AI khi tích hợp. OCR cục bộ là tùy chọn `TCMS_PDF_LOCAL_OCR_FALLBACK=true`, cần các gói PDF/Tesseract đã thêm.

Tra cứu hồ sơ và mở liên kết Drive được giữ. **Upload tài liệu Drive chưa có trong bản gốc, vẫn chưa kích hoạt.** Có biến cấu hình không đồng nghĩa dịch vụ Drive/scanner đã được kiểm chứng. Không có upload endpoint mới hoặc dữ liệu tự động gửi Drive.

## Kiểm tra

```sh
npm run test:tcms
npx tsc --noEmit --incremental false
npx eslint 'app/(dashboard)/documents/contracts' app/api/tcms lib/tcms hooks/use-tcms.ts
```

Kết quả cục bộ: 64/64 bài kiểm tra đạt, TypeScript và ESLint phạm vi tích hợp đạt. Các bài kiểm tra dùng parser, quyền, transaction qua fake writer và kiểm tra cấu trúc SQL; không ghi DB. Đã kiểm tra kết nối, bảng, quyền đọc của role runtime và cấu hình RLS trên DB cục bộ sau khởi tạo. Chưa chạy thử thêm/sửa hợp đồng thực tế hoặc kiểm tra giao diện bằng trình duyệt. Chưa chạy build, push, deploy hoặc reload.
