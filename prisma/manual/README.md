# prisma/manual — SQL thủ công

**Đây là nơi DUY NHẤT chứa SQL viết tay của dự án.** Trước tháng 9/2026 chúng nằm rải ở
`prisma/*.sql`, `prisma/sql/` và `scripts/sql/`; ba chỗ đó đã gộp về đây, đừng tạo lại.

## Vì sao tồn tại song song với prisma/migrations

Dự án **không dùng `prisma migrate` ở local** — schema đồng bộ bằng `npm run db:push`.
Nhưng `db:push` đồng bộ *toàn bộ* schema và sẽ **xoá bảng có trong DB mà không có trong
`schema.prisma`**, nên khi cần thêm một cột lên production ta chạy SQL nhắm đích:

```bash
npx prisma db execute --file prisma/manual/<ten-file>.sql --schema prisma/schema.prisma
```

Lúc deploy thì truyền qua `--sql` (xem `docs/huong-dan-deploy-production.md`):

```bash
./scripts/deploy-server.sh --sql prisma/manual/<ten-file>.sql
```

## Nguồn sự thật của **cấu trúc** là `schema.prisma`, không phải thư mục này

`schema.prisma` đã khai báo đủ index/unique (kể cả loại Prisma khó biểu diễn, ví dụ
`text_pattern_ops`). Dựng DB mới thì `db:push` là đủ — **không cần chạy lại các file ở đây**.
Giá trị còn lại của chúng là **hồ sơ ghi nhận đã áp gì lên production**, cộng 33 file có
`UPDATE/INSERT/DELETE` (sửa dữ liệu — thứ `schema.prisma` không tái tạo được).

## ⚠️ Không bao giờ chạy cả thư mục

Trong này có 5 file **xoá dữ liệu** (`purge-*`, `remove-*`, `drop-*`). Quét thư mục rồi
chạy tuốt là có ngày mất dữ liệu thật. Luôn chạy **từng file một**, có chủ đích.

## Thư mục con `tcms/`

21 file đánh số `001_` → `021_`, chạy **theo đúng thứ tự** và là migration của module TCMS
(hợp đồng). **Các test đọc thẳng nội dung file theo tên** (`tests/tcms/*.test.ts`), nên
đổi tên hay di chuyển là gãy `npm run test:tcms`.

## Quy tắc cho file mới

- Đặt ngay tại `prisma/manual/`, tên kebab-case mô tả việc: `add-<gì>.sql`, `migrate-<gì>.sql`.
- Viết idempotent (`IF NOT EXISTS`, `IF EXISTS`) để chạy lại không hỏng.
- File chạm dữ liệu thật thì ghi rõ phạm vi bằng comment ở đầu file.
