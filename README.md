# PowerPlant EAM — Duyên Hải 1

Hệ thống quản lý nhân sự ca kíp, thiết bị và nghiệp vụ vận hành cho **Phân xưởng Vận hành 1 — Nhà máy Nhiệt điện Duyên Hải 1**. Giao diện tiếng Việt, hỗ trợ sử dụng trên điện thoại tại hiện trường và máy tính tại phòng điều khiển.

Ứng dụng dùng Next.js App Router, PostgreSQL và phân quyền theo vai trò, chức năng, cương vị làm việc. Các phân hệ dùng chung tài khoản đăng nhập và nhật ký thao tác.

## Chức năng chính

| Nhóm | Nghiệp vụ |
| --- | --- |
| Nhân sự và ca kíp | Lịch làm việc, điểm danh, bàn giao ca, sơ đồ ca trực, quản lý công việc và mệnh lệnh sản xuất |
| Thiết bị | Danh mục, thông tin thiết bị, mã QR, khiếm khuyết Cơ – Hóa/Điện, lịch sử sửa chữa và báo cáo |
| Phiếu công tác | Sổ Cơ/Điện, giữ và cấp số theo năm, phiếu nội bộ/nhà thầu, theo dõi trạng thái, xuất tài liệu và tích hợp NKVH |
| An toàn | Sổ thiết bị PCCC, tiếp địa và chống sét, thiết bị yêu cầu nghiêm ngặt về ATLĐ |
| Vật tư | Danh mục, tồn kho hóa chất, vật tư theo ERP, kế hoạch năm, nhu cầu tháng, lịch và lịch sử thay thế |
| Tài liệu số | Hợp đồng, quy trình, sơ đồ P&ID, diễn đàn kỹ thuật và hồ sơ lưu trữ vận hành |
| Chỉ tiêu KTKT | Dữ liệu tháng, báo cáo chỉ tiêu kinh tế kỹ thuật, báo cáo sản xuất, lượng nước, hóa chất, suất hao nhiệt PPA và PMIS |
| Tiện ích | Tiến độ đại tu, kết quả phân tích dầu LIMS, liên kết các công cụ phục vụ vận hành |
| Quản trị và tích hợp | Người dùng, phân quyền, nhật ký, thông báo hệ thống, trợ lý AI, đồng bộ n8n/Google Sheets và cảnh báo Telegram |

Chức năng hiển thị và thao tác được phép phụ thuộc cấu hình phân quyền của từng tài khoản/cương vị. Một số tích hợp cần cấu hình dịch vụ riêng, không tự hoạt động chỉ bằng việc khởi chạy ứng dụng.

## Công nghệ

| Thành phần | Công nghệ |
| --- | --- |
| Runtime | Node.js 24 (`>=24 <25`, xem [`.nvmrc`](.nvmrc)) |
| Framework | Next.js 16, App Router, React 19, TypeScript strict |
| Cơ sở dữ liệu | PostgreSQL, Prisma ORM 5.22 |
| Đăng nhập | Auth.js / NextAuth v5, mật khẩu và WebAuthn/passkey, phiên JWT |
| Giao diện | Tailwind CSS 3, shadcn/ui, Be Vietnam Pro |
| Dữ liệu phía client | TanStack Query |
| Biểu đồ và tài liệu | Recharts, ExcelJS, công cụ Word/PDF, mã QR |
| Lưu trữ tệp | PostgreSQL và kho S3-compatible tùy loại dữ liệu/cấu hình |
| Kiểm tra mã | ESLint 9 flat config, TypeScript, bộ kiểm tra theo phân hệ |

Phiên bản khai báo và toàn bộ lệnh nằm trong [`package.json`](package.json). Lịch sử nâng cấp cùng kế hoạch nâng Prisma nằm trong [hồ sơ release](docs/ATTT_HO_SO_RELEASE.md).

## Khởi chạy trên máy phát triển

### 1. Chuẩn bị

- Cài **Node.js 24** và npm.
- Clone kho mã rồi mở terminal tại thư mục gốc dự án.
- Chọn PostgreSQL tích hợp bên dưới hoặc một PostgreSQL riêng.

```bash
npm install
npm run sync:skills
```

`npm install` tự sinh Prisma Client qua `postinstall`. `sync:skills` dựng hướng dẫn cho Codex trong `.agents/` từ nguồn `.claude/`.

### 2. Cấu hình môi trường

Sao chép [`.env.example`](.env.example) thành `.env` (PowerShell: `Copy-Item .env.example .env`). Với PostgreSQL tích hợp, sửa các giá trị sau:

```dotenv
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/powerplant?schema=public"
AUTH_SECRET="thay-bang-chuoi-ngau-nhien-rieng"
AUTH_TRUST_HOST="true"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

Tạo giá trị ngẫu nhiên cho `AUTH_SECRET` bằng lệnh sau rồi chép kết quả vào `.env`:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Không commit `.env`, khóa dịch vụ hay dữ liệu sao lưu. Các biến n8n, Telegram, S3, ClamAV, AI và Google Sheets được mô tả trong `.env.example` và tài liệu từng tích hợp; chỉ cấu hình khi sử dụng.

### 3. Khởi tạo cơ sở dữ liệu local mới

PostgreSQL tích hợp dùng `embedded-postgres`, không cần Docker hoặc cài PostgreSQL hệ thống. Dữ liệu lưu trong `.pgdata/`, cổng **5433**, mã hóa UTF-8 để lưu tiếng Việt.

Mở một terminal và giữ tiến trình này chạy:

```bash
npm run db:start
```

Khi PostgreSQL báo sẵn sàng, mở terminal thứ hai tại gốc dự án:

```bash
npm run db:push
npm run db:seed
npm run dev
```

**Chỉ chạy `db:push` và `db:seed` ở bước này với cơ sở dữ liệu local mới dành cho demo.** Seed xóa dữ liệu ở nhiều bảng trước khi tạo dữ liệu mẫu; không chạy trên DB đang sử dụng. `db:push` đồng bộ toàn bộ schema và có thể đề nghị xóa bảng/cột ngoài schema; không dùng `--accept-data-loss` để bỏ qua cảnh báo. Các phân hệ có SQL bổ sung cần làm theo tài liệu riêng trong mục Tài liệu.

Mở [http://localhost:3000](http://localhost:3000), đăng nhập tại `/login`.

Ở những lần chạy sau, chỉ cần `npm run dev`: script tự bật PostgreSQL tích hợp nếu cổng 5433 chưa có tiến trình lắng nghe, sau đó chạy Next.js. Có thể đổi cổng web bằng `npm run dev -- -p 3030`.

**Dùng PostgreSQL riêng:** đặt `DATABASE_URL` đúng máy chủ/cổng/tên DB. Tự bảo đảm DB đã chạy; có thể dùng `npm run dev:next` để chỉ mở Next.js, không khởi động PostgreSQL tích hợp. Với DB hiện hữu, áp dụng thay đổi cấu trúc theo tài liệu phân hệ thay vì chạy các lệnh khởi tạo demo.

### Tài khoản demo

Các tài khoản sau được tạo bởi seed, dùng mật khẩu **`password123`** và chỉ dành cho môi trường demo:

| Vai trò | Email |
| --- | --- |
| Quản trị | `admin@powerplant.vn` |
| Trưởng ca | `supervisor@powerplant.vn` |
| Kỹ thuật viên | `tech@powerplant.vn` |
| Người xem | `viewer@powerplant.vn` |

## Lệnh thường dùng

| Lệnh | Công dụng |
| --- | --- |
| `npm run dev` | PostgreSQL tích hợp nếu cần + Next.js dev |
| `npm run dev:next` | Chỉ Next.js dev |
| `npm run db:start` | Chỉ PostgreSQL tích hợp |
| `npm run db:studio` | Mở Prisma Studio |
| `npx prisma generate` | Sinh lại Prisma Client sau khi sửa schema |
| `npm run db:push` | Đồng bộ toàn bộ schema; đọc cảnh báo dữ liệu trước khi dùng |
| `npm run db:seed` | Xóa dữ liệu demo cũ ở nhiều bảng và tạo dữ liệu mẫu |
| `npm run lint` | Kiểm tra ESLint |
| `npx tsc --noEmit` | Kiểm tra kiểu TypeScript |
| `npm run check:ctktkt` | Kiểm tra chuẩn kiến trúc phân hệ KTKT |
| `npm run test:ctktkt` | Kiểm thử phân hệ KTKT |
| `npm run test:ctktkt:contract` | Kiểm tra hợp đồng API KTKT trên môi trường local |
| `npm run test:tcms` | Kiểm thử phân hệ hợp đồng |
| `npm run verify:ui -- /tuyen` | Chụp và kiểm tra giao diện tuyến được chọn |
| `npm run sync:skills` | Sinh lại `.agents/` từ nguồn skill/agent |
| `npm run build` | Sinh Prisma Client và build production |
| `npm start` | Chạy bản production đã build |

Repo có các bộ kiểm thử theo phân hệ; xem thêm [`tests/`](tests/) và [hướng dẫn kiểm tra giao diện](scripts/verify/README.md). Với Git Bash trên Windows, dùng `MSYS_NO_PATHCONV=1 npm run verify:ui -- /tuyen` để giữ nguyên đường dẫn tuyến.

Sau khi sửa giao diện, phải xem ảnh chụp ở khổ điện thoại 360/390px và máy tính 1280px. Kiểm thử có ghi dữ liệu phải dùng dữ liệu thử tách biệt trên DB local; không thao tác phá hủy trên hồ sơ thật.

## Kiến trúc và phân quyền

- **API:** route dùng `handle()`, `requireUser()`, kiểm tra quyền, trả envelope `{ data, meta, error }` qua `ok()`/`fail()`; thao tác ghi có audit.
- **Client:** các hook trong `hooks/` dùng TanStack Query và `apiGet`/`apiMutate` từ `lib/fetcher.ts`.
- **Đăng nhập:** `proxy.ts` kiểm tra sự hiện diện của cookie phiên; quyền thực tế phải được kiểm tra phía server trong route/page.
- **Vai trò hệ thống:** `ADMIN`, `MANAGER`, `SUPERVISOR`, `TECHNICIAN`, `VIEWER`. Quyền chức năng có các mức Toàn quyền, Quản lý, Cá nhân, Chỉ xem và Không có quyền; cấu hình mặc định ở `lib/rbac-defaults.ts`, cấu hình tùy chỉnh lưu trong `RbacConfig`.
- **KTKT:** quyền vào phân hệ và quyền nghiệp vụ tách riêng. Quyền nhập/xem từng nhóm số liệu lấy theo cương vị đang làm việc; xem [tài liệu KTKT](docs/chi-tieu-ktkt.md).
- **Tệp tải lên:** kiểm định dạng thật và quét ClamAV khi được cấu hình qua `lib/upload-guard.ts`. Cách lưu ảnh/tệp phụ thuộc phân hệ.

Hướng dẫn đầy đủ cho việc phát triển nằm trong [`AGENTS.md`](AGENTS.md), nguồn duy nhất của quy ước AI trong repo. `CLAUDE.md` chỉ trỏ về tệp này.

```text
app/                    Trang App Router và API handlers
components/             Thành phần giao diện chung và theo nghiệp vụ
hooks/                  Hook truy vấn và cập nhật dữ liệu
lib/                    Auth, API, RBAC, Prisma và nghiệp vụ phía server
modules/ctktkt/         Phân hệ chỉ tiêu kinh tế kỹ thuật
prisma/                 Schema, seed và SQL thủ công trong manual/
chrome-extension/       Các tiện ích đồng bộ và công cụ đóng gói
scripts/                Import, kiểm tra, xử lý dữ liệu, triển khai, xác minh UI
tests/                  Kiểm thử theo phân hệ
docs/                   Hướng dẫn vận hành và tài liệu kỹ thuật
public/                 Tài nguyên tĩnh và mẫu tài liệu
proxy.ts                Bảo vệ tuyến bằng cookie phiên
```

## Triển khai production

Làm theo [hướng dẫn triển khai](docs/huong-dan-deploy-production.md), sử dụng **`scripts/deploy-server.sh`**. Script build trong thư mục riêng rồi chuyển bản chạy và dùng `pm2 reload`, có quy trình sao lưu/rollback.

**Không chạy thủ công `npm run build`, `npm install` hoặc `pm2 restart` trong `/var/www/dh1-app`.** Build trực tiếp có thể làm mất `.next` đang phục vụ và gây lỗi cho người dùng.

Thay đổi DB phải được xem xét riêng; SQL thủ công chỉ đặt trong [`prisma/manual/`](prisma/manual/README.md). Trên Windows, dừng dev server trước khi sinh lại Prisma Client để tránh khóa `query_engine-windows.dll.node`.

## Tài liệu

| Chủ đề | Tài liệu |
| --- | --- |
| Triển khai, xử lý sự cố và rollback | [Hướng dẫn production](docs/huong-dan-deploy-production.md) |
| An toàn thông tin và lịch sử nâng cấp | [Chính sách ATTT](docs/ATTT_CHINH_SACH.md) · [Hồ sơ release](docs/ATTT_HO_SO_RELEASE.md) |
| Quy ước phát triển và script | [AGENTS.md](AGENTS.md) · [Danh mục script](scripts/README.md) · [Kiểm tra UI](scripts/verify/README.md) |
| Phiếu công tác | [Sổ đăng ký PCT](docs/work-permit-register.md) · [Hướng dẫn cấp phiếu](docs/huong-dan-cap-phieu-cong-tac.html) |
| Đại tu và nhà thầu | [Google Sheets đại tu](docs/dai-tu-google-sheets.md) · [Mốc SCL S2](docs/scl-s2-milestones.md) · [Thẻ nhà thầu](docs/the-nha-thau-apps-script.md) |
| Thiết bị an toàn | [PCCC](docs/pccc.md) · [Tiếp địa và chống sét](docs/grounding-lightning.md) · [TBYCNN](docs/tbycnn.md) |
| Chỉ tiêu KTKT | [Nghiệp vụ và phân quyền](docs/chi-tieu-ktkt.md) · [Chuyển đổi về kiến trúc web chung](docs/ktkt-chuyen-doi.md) |
| Vật tư và hóa chất | [Đặc tả tồn kho hóa chất](docs/ton-kho-hoa-chat-spec.md) · [Quy trình quản lý vật tư](public/material-procedures/huong-dan-quan-ly-vat-tu.pdf) |
| Hợp đồng và tài khoản tra cứu | [Tích hợp TCMS](docs/contract-integration.md) · [Phân quyền tra cứu](docs/phan-quyen-tra-cuu.md) |
| Đồng bộ khiếm khuyết | [n8n](docs/n8n-defect-sync/README.md) · [Backup/restore](docs/n8n-defect-sync/BACKUP_RESTORE.md) · [Kiểm tra hai chiều](docs/n8n-defect-sync/TWO_WAY_COPY_TEST.md) |
| Đồng bộ vật tư và tài liệu | [Vật tư](docs/n8n-material-sync/README.md) · [Sao lưu vật tư](docs/n8n-material-sync/README-backup.md) · [Tài liệu](docs/n8n-document-sync/README.md) |
| Tiện ích trình duyệt | [QLVT/LIMS](chrome-extension/qlvt-sync/README.md) · [NKVH PCT](chrome-extension/nkvh-pct/README.md) |
| AI và thông báo | [Chatbox AI](docs/n8n-ai-chat/README.md) · [Telegram](docs/telegram-notifications.md) |

### Tích hợp qua tiện ích trình duyệt

- **QLVT/LIMS:** đọc dữ liệu trong tab nguồn đã đăng nhập, trả về website; không chuyển cookie đăng nhập và không ghi ngược vào nguồn.
- **NKVH PCT:** lấy số/điền số phiếu và đồng bộ hồ sơ đã lưu về website. Người dùng tự hoàn thiện và bấm Lưu trên NKVH; tiện ích không tự bấm Lưu.
- Các tiện ích phục vụ KTKT nằm cùng cây `chrome-extension/`; đóng gói bằng script tương ứng trong `chrome-extension/scripts/`.

### Hồ sơ lưu trữ vận hành

Trang `/documents/archive` quản lý dữ liệu tách lưới, khởi động, hiệu chỉnh lò và vòi dầu. Quyền đọc, chỉnh sửa và xuất sao lưu được kiểm tra theo từng chức năng/tab; mặc định trong `lib/rbac-defaults.ts` và có thể cấu hình lại qua Phân quyền.

Xuất dữ liệu theo năm để tải về dưới dạng Excel hoặc in PDF. Người phụ trách cần chủ động lưu bản xuất trong kho tài liệu nội bộ; thao tác tải xuống không tự tạo bản lưu trên server.
