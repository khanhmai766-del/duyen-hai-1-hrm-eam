# Bộ kiểm thử nâng cấp — `scripts/verify/`

Công cụ đã dùng cho đợt nâng cấp Node 24 / Next.js 16 / React 19 (13–14/09/2026), giữ lại để lần nâng cấp
framework, thư viện hay sửa hàng loạt sau chạy lại được. Repo không có test tự động; bộ này thay thế bằng cách
**so hành vi trước/sau** trên bản build thật.

| Script | Dùng để | Cần DB dev + phiên tạm |
| --- | --- | --- |
| `crawl.mjs` | Đi qua 55 trang bằng trình duyệt thật, ghi API ≥400, lỗi JS, console.error, toast, h1 | Có |
| `compare-crawl.mjs` | So 2 file crawl (trước/sau), bỏ qua thời gian tải | Không |
| `hydration-check.mjs` | Bắt lỗi hydrate (React #418…) theo 4 tình huống giờ/múi giờ | Có |
| `ssr-probe.mjs` | Xem HTML server-render có chữ phụ thuộc giờ/phiên không (điều tra #418) | Có |
| `image-check.mjs` | Kiểm bộ tối ưu ảnh `/_next/image`: ảnh hợp lệ ra WebP, yêu cầu ngoài khoá bị chặn | Không — chạy được cả với site thật |
| `image-page-check.mjs` | Trang thật có ảnh vỡ không, ảnh có đi qua `/_next/image` không | Có |
| `ui-shots.mjs` (+ `ui-presets.mjs`) | Chụp trang ở khổ điện thoại → máy tính, soi trang cuộn ngang, phần tử lòi mép, nút < 32px, chữ bị cắt | Có |

## Quy tắc an toàn (bắt buộc)

- Script "cần DB dev + phiên tạm" **tạo tài khoản ADMIN tạm** trong DB và **tự ký cookie phiên** bằng `AUTH_SECRET`
  đọc từ `.env`. `_safety.mjs` từ chối chạy nếu `DATABASE_URL` không trỏ localhost hoặc BASE không phải localhost —
  **không bao giờ** trỏ vào Production, không ký token bằng secret Production.
- Tài khoản tạm tên `TEST … (tạm)`, email `@local.test`, bị xoá ngay khi chạy xong (không xoá được thì bị khoá).
- Kết quả ghi vào `reports/verify/` (đã `.gitignore`). Không commit.
- Chạy mọi lệnh từ **gốc repo** (script đọc `.env` theo thư mục hiện tại).

## Chuẩn bị

1. Node 24, `npm install`.
2. Trình duyệt cho Playwright (một lần): `npx playwright-core install chromium`.
3. DB dev chạy (`npm run dev` tự bật, hoặc `npm run db:start`).

## Quy trình so trước/sau khi nâng cấp

```bash
# 1) MỐC TRƯỚC — trên nhánh/commit cũ
npm run build
npx next start -p 3031            # để chạy ở terminal khác
node scripts/verify/crawl.mjs http://127.0.0.1:3031 reports/verify/crawl-truoc.json
#    tắt server 3031

# 2) SAU — trên nhánh nâng cấp
npm run build
npx next start -p 3031
node scripts/verify/crawl.mjs http://127.0.0.1:3031 reports/verify/crawl-sau.json

# 3) SO
node scripts/verify/compare-crawl.mjs reports/verify/crawl-truoc.json reports/verify/crawl-sau.json
```

`GIỐNG MỐC` = sẵn sàng cho bước kiểm tay. Lệch 1 trang kiểu `ERR_NETWORK_IO_SUSPENDED` là mạng máy chập chờn —
chạy lại để chắc. Trang lỗi 500/503 do DB dev thiếu dữ liệu/bảng (tiếp địa, phân tích dầu, SHN-PPA, phiếu công tác,
hợp đồng) giống nhau ở cả hai lần là bình thường.

## Kiểm tra hydration

```bash
# dev server cho thông báo lệch CHI TIẾT; bản build chỉ có mã #418
npm run dev -- -p 3030
MSYS_NO_PATHCONV=1 ROUTE=/ ROUNDS=2 node scripts/verify/hydration-check.mjs http://127.0.0.1:3030
MSYS_NO_PATHCONV=1 node scripts/verify/ssr-probe.mjs http://127.0.0.1:3031 /
```

`MSYS_NO_PATHCONV=1` chỉ cần trên Git Bash (Windows) — không có nó, `/` bị đổi thành `C:/Program Files/Git/`.

Bài học đợt 09/2026: lỗi #418 chỉ bắt được 1 lần, không tái hiện. **Đừng** "sửa" bằng cách truyền phiên server vào
`SessionProvider` — đã thử, lỗi tăng từ 0/12 lên 3/12 do `app/(dashboard)/loading.tsx` làm trang hydrate sau khung app.

## Kiểm tra giao diện điện thoại / máy tính (`ui-shots.mjs`)

```bash
npm run dev -- -p 3030                                   # terminal khác
MSYS_NO_PATHCONV=1 npm run verify:ui -- /work-permits /defects          # mặc định 360, 390, 1280px
MSYS_NO_PATHCONV=1 npm run verify:ui -- --preset=pct-lam-viec --widths=360,1280
```

- Ảnh + `report.json` ở `reports/verify/ui-<thời điểm>/`. Mỗi tuyến × khổ: `-full.png` (cả trang) và `-p0.png`…
  (khung nhìn khi cuộn, `--parts=N`). **Ảnh cả trang đặt sai phần tử `fixed`/`sticky`** (thanh điều hướng đáy, nút
  dính đáy) — đánh giá chúng trên ảnh `-pN`.
- LỖI (mã thoát 1): trang cuộn ngang, lỗi JS, API ≥ 500. CẢNH BÁO: lòi mép phải ngoài vùng cuộn ngang có chủ đích,
  nút/ô bấm < 32px trên điện thoại, chữ bị cắt không có dấu …, API 4xx, `console.error`.
- Linh vật chatbot (`[data-ui-overlay]`) được ẩn khi soi và chụp vì nó đè nội dung; `--keep-mascot` để giữ.
- `--preset=` dựng trạng thái hiếm trên DB dev (vd lần làm việc đang mở 12 người) bằng **giả lập trong trình duyệt**
  (`page.route`) — không ghi DB. Thêm preset trong `ui-presets.mjs`; `prepare` chỉ được SELECT.
- Không có Chromium của Playwright thì tự dùng Edge (`channel: "msedge"`).

## Kiểm tra ảnh

```bash
node scripts/verify/image-check.mjs http://127.0.0.1:3031
node scripts/verify/image-check.mjs https://duyenhai1.vn      # sau deploy — chỉ gọi URL công khai
node scripts/verify/image-page-check.mjs http://127.0.0.1:3031 /login / /hr /account
```

Khoá ảnh nằm ở `next.config.mjs` (`images.localPatterns`…) và `lib/optimizable-image.ts`; đổi khoá thì cập nhật danh
sách trong `image-check.mjs`.

## Lưu ý Windows / dev server

- Tắt dev server trước khi `git switch`/`merge`: git ghi lại file khi `next dev` đang chạy làm hỏng cache Turbopack
  (`.next/dev`) → mọi trang 500 với lỗi Tailwind `ENOENT`. Lỡ bị: tắt dev, xoá `.next/dev`, chạy lại.
- Tắt hẳn server theo cổng sau khi crawl (`netstat -ano | findstr :3031` → `taskkill /PID <pid> /T /F`), nếu không
  `prisma generate` ở lần build sau báo `EPERM`.
