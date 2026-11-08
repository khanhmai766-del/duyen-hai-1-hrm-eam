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
| 1 + 2 | Theo từng trang: hook TanStack trong `hooks/`, handler trả `ok()/fail()`, tách component, CSS → Tailwind. Thứ tự: **Hoá chất → Lượng nước → PMIS → PPA → Báo cáo sản xuất → Dữ liệu các tháng → Chỉ tiêu KTKT** | Hoá chất ✅ · Lượng nước ✅ · PMIS ✅ · PPA ✅ · Báo cáo sản xuất ✅ · Dữ liệu các tháng ✅ (08/11) · còn Chỉ tiêu KTKT ⏳ |

### Mẫu chuyển một trang (theo trang Hoá chất)

1. **API**: handler trả `ok(body)` / `fail(message, status)` của `lib/api` với **đúng `body` cũ**; thêm tên route vào
   `NATIVE_ENVELOPE_ROUTES` trong `app/api/ctktkt/[[...path]]/route.ts` (cổng chỉ còn ghi audit + Cache-Control).
   Thêm các ca lỗi của route vào `ENDPOINTS`, ghi ảnh chụp **trên code cũ** (`git stash` phần đã sửa → `--record` → `git stash pop`), rồi so với code mới.
2. **Hook**: `hooks/useKtkt<Tên>.ts` — `useQuery` khoá `["ctktkt", "<route>", …]` (nằm dưới `["ctktkt"]` để lượt ghi KTKT khác cũng làm mới),
   `useMutation` gọi `apiMutate` và `invalidateQueries`. Component bỏ `useCtktktRequest`/`useEffect` tải tay.
3. **CSS**: chuyển các quy tắc **riêng của trang** trong `styles.css` thành lớp Tailwind rồi xoá quy tắc cũ. Quy tắc chung
   (`.engineering-workspace :is(button,a)[class*="rounded"]`, min-height trên điện thoại…) có độ ưu tiên cao hơn Tailwind —
   dùng tiền tố `!` khi cần. Kiểm bằng cách đo `getComputedStyle` các phần tử chính trước/sau ở 1280px và 390px: phải khớp hoàn toàn.
   Lớp dùng chung nhiều trang (`module-hero ktkt-dark-hero`, `engineering-workspace`) chuyển khi trang cuối cùng dùng nó đã chuyển xong.
   **Bảng phức tạp** (cố định cột bằng `nth-child`, biến độ rộng cột, đổi màu ô khi rê hàng — vd bảng Lượng nước) không ép sang
   lớp Tailwind: chuyển **nguyên văn** quy tắc sang tệp CSS cạnh component (`water-report-table.css`), xoá khỏi `styles.css`.
   Lưu ý quy tắc chung `.app-content :is(.rounded-2xl,…).bg-white` chỉ áp khi phần tử còn lớp `rounded-2xl` — đổi bo góc thì
   giữ lớp đó và thêm `!rounded-[…]`.
4. **Kiểm thử ghi** trên DB dev qua giao diện (thêm → sửa → xoá → lỗi server), rồi xoá dòng thử (id < 900000) để `--seed` không bị chặn.

**Route dùng chung nhiều trang** (vd `daily-inputs`: PMIS, Dữ liệu các tháng, Báo cáo sản xuất) chuyển cùng trang đầu tiên
dùng nó — phong bì `{data, meta, error}` không đổi nên các trang còn dùng `useCtktktRequest` không bị ảnh hưởng (hợp đồng
đọc + ghi chứng minh). Hook dùng chung: `hooks/useKtktDailyInputs.ts` (`useSaveDailyInputs`, `useInvalidateKtkt`).
`ctktkt-report` chuyển cùng trang Chỉ tiêu KTKT (cuối cùng); trước đó các hook đọc nó bằng `apiGet` vẫn đúng.

**Dữ liệu mẫu**: mỗi bảng một dải id cố định (900000 + 20000 × thứ tự bảng). Thêm dòng mẫu vào một bảng thì chỉ ảnh chụp
của API đọc bảng đó đổi — ghi lại khi route đó còn là code cũ (hoặc đã chứng minh khớp), và kiểm phần khác ngoài `id` = 0.

**Trang có tiện ích Chrome** (PMIS, Dữ liệu các tháng, BCSX): kiểm luồng đồng bộ bằng tiện ích giả lập — `addInitScript`
trả lời `PING` bằng `READY` và `SYNC_HEATRATE` bằng `SYNC_HEATRATE_RESULT` đúng kênh `ctktkt-qlkt-sync`.

**Gọi ra ngoài** (Google Apps Script trong nút Google Sheet): gọi thẳng `apiReportResponse` của `lib/fetcher` — với URL ngoài
nó chỉ là `fetch` + câu lỗi mất mạng tiếng Việt, đúng như `useCtktktRequest` cũ. Hợp đồng ghi chỉ kiểm nhánh "máy chủ chưa
cấu hình" (dev không có `GOOGLE_SHEET_APPS_SCRIPT_URL`), không bao giờ gọi Apps Script thật.

**Tách CSS theo trang khỏi `styles.css`**: chỉ chuyển quy tắc mà MỌI selector có lớp của trang ở **cấp ngoài**. Lớp nằm trong
`:is()/:not()/:where()/:has()` không tính — vd `:is(.ktkt-page-header, .monthly-toolbar-controls, .module-hero)` áp cho nhiều
trang; chuyển nó sang CSS của component sẽ làm nó biến mất ở trang không nạp component đó (đã suýt mắc 08/11).

**CSS chết**: khi trang đổi cấu trúc, xoá quy tắc theo **selector** (không theo dòng) — tệp CSS module viết dồn nhiều quy tắc/dòng
và gộp selector bằng dấu phẩy. Trước khi xoá lớp khỏi CSS dùng chung, `grep` toàn repo (`.tsx/.ts/.css`) phải ra 0.

**Trang có bảng nhập đang sửa** (BCSX; sắp tới Dữ liệu các tháng, Chỉ tiêu KTKT): dữ liệu tải về được chép vào state đang sửa.
Truy vấn ngày dùng `gcTime: 0` + `staleTime: Infinity` (chọn lại ngày luôn đọc mới, không hiện bản cũ), chép vào state khi
lượt tải MỚI về (so tham chiếu `data` trong lúc render), và các lượt lưu chỉ `invalidateQueries({ refetchType: "none" })` —
không tải lại ngày đang sửa, để không ghi đè ô người dùng đang sửa dở ở tổ máy/khối khác. Đọc bắt buộc mới (sao lưu, đọc lại
xác minh, "nạp lại") gọi thẳng `apiGet`.

**Phản hồi là FILE** (`bcsx-operation-import`, `bcsx-export`): đọc bằng `apiReportResponse` (file trả nguyên, lỗi JSON →
`{error}`); route chỉ đổi nhánh lỗi sang `fail()`.

### Việc tồn đọng ghi nhận khi chuyển đổi

- `GET water-report` trả 500 cho **cả tháng** nếu một ca có hiệu chỉnh công tơ âm (`normalizeWaterAdjustment` ném lỗi khi đọc).
  Form và API ghi đã chặn số âm nên dữ liệu thật chưa gặp; chỉ có thể lọt qua đường khôi phục/nạp dữ liệu. Chưa sửa (đổi hành vi API).
- `POST water-report` ghi từng ca và tính lại chuỗi bằng các câu lệnh riêng lẻ, không cùng một giao dịch — lỗi giữa chừng
  để lại tháng tính dở. Xử lý khi chuyển sang Prisma (giai đoạn 3) bằng `prisma.$transaction`.
- `bcsx-section1-import` (nạp lịch sử Mục 1 từ 2 file S1/S2): chỉ kiểm nhánh lỗi — file do `bcsx-export` xuất thiếu các sheet theo
  ngày ("01"…) của file BCSX gốc; cần một cặp file gốc mẫu để khoá nhánh thành công. `bcsx-operation-import` cũng vậy (thiếu file
  DanhSachLenhKetThuc mẫu). `bcsx-sync` hiện không có nơi nào gọi — xem lại ở giai đoạn 4.
- `styles.css` còn các quy tắc `.module-chart-grid …` không phần tử nào dùng (đã xoá phần của PMIS); dọn ở giai đoạn 4.
- PMIS (đã sửa khi chuyển): bản cũ báo "Không đồng bộ được ngày nào…" rồi tự xoá ngay vì lượt tải lại đặt `error = ""`;
  nay thông báo lỗi còn hiển thị.
| 3 | `getRawDb()` → Prisma, đọc trước ghi sau; có thể "so bóng" (chạy cả truy vấn cũ và mới, ghi log khi lệch) | ⏳ |
| 4 | Chuyển 4 API máy; xoá `db/sql.ts`, `getRawDb`, `useCtktktRequest`, cổng `[[...path]]` | ⏳ |

Trước khi bắt đầu một trang: báo cho người còn lại để không sửa song song trang đó; `git fetch` trước khi sửa.

## Kiểm tra bắt buộc mỗi bước

```bash
npm run test:ctktkt                 # 251 test đơn vị/miền (cần bảng ctktkt_* trên DB dev, xem dưới)
npm run test:ctktkt:contract        # các API GET phải khớp ảnh chụp chuẩn (cần dev server ở :3030)
npm run test:ctktkt:contract -- --writes   # kịch bản thêm/sửa/xoá phải ra phản hồi + trạng thái y hệt
npx tsc --noEmit
MSYS_NO_PATHCONV=1 npm run verify:ui -- /tien-ich/chi-tieu-ktkt/<trang>
```

### Test hợp đồng (`scripts/verify/ctktkt-contract.mjs`)

- Đổ bộ dữ liệu mẫu cố định vào DB **dev** (id ≥ 900000; lõi là 2 ngày thật 16–17/09/2026 trong
  `tests/ctktkt/fixtures/ctktkt-sample-data.ts`, cộng dữ liệu ngày 28/08–18/09, nước, hoá chất, PPA, sự kiện).
- Gọi 20 API GET bằng phiên ADMIN dev, so từng giá trị với `tests/ctktkt/contracts/api-snapshots.json`.
- `--seed` đổ lại dữ liệu mẫu; `--record` ghi đè ảnh chụp chuẩn — **chỉ ghi lại khi cố ý đổi hành vi API**, và ghi rõ lý do trong commit.
- Thêm API mới vào mảng `ENDPOINTS` khi chuyển đổi tới nó.
- **Hợp đồng ghi** (`--writes`, ảnh chụp `api-write-snapshots.json`): mỗi nhóm trong `WRITE_SCENARIOS` chạy trên dữ liệu
  mẫu mới đổ, ghi phản hồi từng bước + kết quả GET sau bước đó (id cấp mới và mốc thời gian được chuẩn hoá). Thêm kịch bản
  cho route sắp chuyển và `--writes --record` **trên code cũ** trước khi sửa. Tệp Excel tải lên lấy từ chính API xuất của web.

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
