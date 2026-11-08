# Chuyển module KTKT về chuẩn web chính

Module `modules/ctktkt` là ứng dụng riêng được ghép vào ngày 04/11/2026 (xem `modules/ctktkt/SOURCE.json`).
Nó vẫn giữ cách viết cũ: SQL kiểu SQLite/D1 dịch sang Postgres lúc chạy (`db/sql.ts`), một cổng API chung
`app/api/ctktkt/[[...path]]`, hook `useCtktktRequest` thay cho TanStack Query, và khoảng 1.200 dòng CSS riêng.

Tài liệu này ghi kế hoạch đã chốt ngày 08/11/2026 (đã thống nhất giữa khanhmai766-del và Nguyen Ngoc Yen)
để mọi người sửa module này theo cùng một hướng.

## Nguyên tắc

1. **Thay từng phần** — mỗi lần một trang hoặc một API; code cũ và mới chạy song song tới khi bỏ được phần cũ.
2. **Không đổi cấu trúc bảng** `ctktkt_*`. Prisma chỉ *mô tả* bảng đang có; **không chạy `db:push`** cho các bảng này
   (lệch kiểu cột một chút là Prisma đòi sửa bảng thật) — chỉ `prisma generate`.
3. **Giữ nguyên mọi URL `/api/ctktkt/*`**. Bốn API dành cho hệ thống ngoài giữ nguyên định dạng JSON và chuyển sau cùng:
   `integration/v1/operating-data`, `cron/coal-photos`, `google-mirror/snapshot`, `POST google-mirror/status`
   (Apps Script, n8n, tiện ích Chrome phụ thuộc vào chúng).
4. **Lớp dữ liệu chuyển hết sang Prisma, kể cả báo cáo phức tạp.** Mỗi câu SQL đổi sang Prisma phải ra kết quả
   y hệt — kiểm bằng test hợp đồng (dưới đây). Phần ghi phải giữ việc tăng `ctktkt_operational_read_versions`.
5. **Code mới viết theo chuẩn mới**; không thêm SQL kiểu cũ hay CSS ghi đè mới vào module.

## Thứ tự

| Giai đoạn | Việc | Trạng thái |
|---|---|---|
| 0 | Test hợp đồng API, lệnh `test:ctktkt`, số đo nền | ✅ 08/11/2026 |
| 1 + 2 | Theo từng trang: hook TanStack trong `hooks/`, handler trả `ok()/fail()`, tách component, CSS → Tailwind. Thứ tự: **Hoá chất → Lượng nước → PMIS → PPA → Báo cáo sản xuất → Dữ liệu các tháng → Chỉ tiêu KTKT** | ⏳ |
| 3 | `getRawDb()` → Prisma, đọc trước ghi sau; có thể "so bóng" (chạy cả truy vấn cũ và mới, ghi log khi lệch) | ⏳ |
| 4 | Chuyển 4 API máy; xoá `db/sql.ts`, `getRawDb`, `useCtktktRequest`, cổng `[[...path]]` | ⏳ |

Trước khi bắt đầu một trang: báo cho người còn lại để không sửa song song trang đó; `git fetch` trước khi sửa.

## Kiểm tra bắt buộc mỗi bước

```bash
npm run test:ctktkt                 # 251 test đơn vị/miền (cần bảng ctktkt_* trên DB dev, xem dưới)
npm run test:ctktkt:contract        # 20 API GET phải khớp ảnh chụp chuẩn (cần dev server ở :3030)
npx tsc --noEmit
MSYS_NO_PATHCONV=1 npm run verify:ui -- /tien-ich/chi-tieu-ktkt/<trang>
```

### Test hợp đồng (`scripts/verify/ctktkt-contract.mjs`)

- Đổ bộ dữ liệu mẫu cố định vào DB **dev** (id ≥ 900000; lõi là 2 ngày thật 16–17/09/2026 trong
  `tests/ctktkt/fixtures/ctktkt-sample-data.ts`, cộng dữ liệu ngày 28/08–18/09, nước, hoá chất, PPA, sự kiện).
- Gọi 20 API GET bằng phiên ADMIN dev, so từng giá trị với `tests/ctktkt/contracts/api-snapshots.json`.
- `--seed` đổ lại dữ liệu mẫu; `--record` ghi đè ảnh chụp chuẩn — **chỉ ghi lại khi cố ý đổi hành vi API**, và ghi rõ lý do trong commit.
- Thêm API mới vào mảng `ENDPOINTS` khi chuyển đổi tới nó.

### Dựng bảng KTKT trên DB dev (một lần)

```bash
npx prisma db execute --file prisma/manual/add-ctktkt.sql --schema prisma/schema.prisma
npx prisma db execute --file prisma/manual/add-ctktkt-corrections.sql --schema prisma/schema.prisma
npm run test:ctktkt:contract -- --seed
```

## Số đo nền (production, 07–08/11/2026)

| Chỉ số | Giá trị |
|---|---|
| SQL KTKT (EXPLAIN ANALYZE) | 2–7 ms; mạng app → DB 0,33 ms — DB **không** phải nút thắt |
| Node xử lý `/login` | ~3 ms; tải CPU ~0,03 |
| Một lượt mở trang Chỉ tiêu KTKT | ~35 yêu cầu, chỉ 4 của KTKT (trước bản `8352f4ed`) |
| Gói JS trang Dữ liệu các tháng | 922 KB (267 KB nén) → 525 KB (163 KB nén) sau khi tách recharts |
| Giao thức | HTTP/1.1 → HTTP/2 từ 08/11/2026 |
