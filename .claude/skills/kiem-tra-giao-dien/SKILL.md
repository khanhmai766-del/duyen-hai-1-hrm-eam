---
name: kiem-tra-giao-dien
description: Chụp và đánh giá giao diện web của repo trên khổ điện thoại (360/390px) và máy tính (1280px) sau khi sửa trang/ thành phần UI — soi bố cục vỡ, nút quá nhỏ, chữ bị cắt, bộ lọc không co giãn. Dùng khi sửa hoặc thêm màn hình, khi người dùng báo "vỡ bố cục", "trên điện thoại khó dùng", hoặc trước khi báo xong một thay đổi giao diện.
---

# Kiểm tra giao diện điện thoại / máy tính

Người dùng chính là vận hành viên cầm điện thoại ở hiện trường. Sửa giao diện xong **phải tự nhìn ảnh chụp** trước
khi báo xong — kiểm tra kiểu (`tsc`) và lint không bắt được bố cục vỡ.

## Quy trình

1. Dev server chạy ở cổng 3030 (`npm run dev -- -p 3030`; thường đã chạy sẵn).
2. Chụp và soi tự động:
   ```bash
   MSYS_NO_PATHCONV=1 npm run verify:ui -- /tuyen-da-sua /tuyen-khac
   MSYS_NO_PATHCONV=1 npm run verify:ui -- --preset=pct-lam-viec --widths=360,1280
   ```
   Mặc định 360, 390, 1280px. Ảnh + `report.json` ở `reports/verify/ui-<thời điểm>/`.
3. **Đọc ảnh bằng Read** — tối thiểu ảnh 360px và 1280px của từng tuyến đã sửa. Với phần tử `fixed`/`sticky`
   (thanh điều hướng đáy, nút dính đáy, hộp thoại) chỉ tin ảnh khung nhìn `-p0.png`, `-p1.png`…; ảnh `-full.png`
   vẽ chúng sai chỗ.
4. Sửa đến khi hết LỖI; CẢNH BÁO nào để lại thì nói rõ vì sao với người dùng.
5. Trạng thái hiếm trên DB dev (lần làm việc đang mở, danh sách 100 người…) → thêm **preset** trong
   `scripts/verify/ui-presets.mjs` (giả lập qua `page.route`, `prepare` chỉ SELECT). **Không** tạo dữ liệu thật
   trên DB dev chỉ để chụp.
6. Cần bấm, gõ, mở hộp thoại tương tác → dùng Playwright MCP (mục cuối).

Chi tiết tham số và quy tắc an toàn: `scripts/verify/README.md`.

## Quy tắc bố cục đã rút ra trên repo này

- **Khung app**: `<main>` của `AppShell` đã có `p-4` (điện thoại) / `p-6` / `p-8` — trang con **không** thêm lề
  ngang lần nữa. Dưới `lg` có thanh điều hướng đáy cao 68px + nút Quét QR nhô lên; nội dung dính đáy dùng
  `sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))]` và bỏ dính ở `lg:` (`lg:static`).
- **Vùng bấm** trên điện thoại ≥ 40px: mẫu `h-10 sm:h-9` / `h-9 sm:h-7`. Nút hành động chính của màn hình
  hiện trường cao 56px (`h-14`), rộng hết khung.
- **Hàng nhiều nhãn** (số phiếu + trạng thái + "Cần bổ sung"…) phải `flex-wrap`; đặt thứ quan trọng (số + trạng
  thái) một hàng, nhãn phụ xuống hàng riêng. Đừng xếp 4 cột cố định trên 360px.
- **Số hiệu** (`3968/2026/VH1-NĐDH`, mã thẻ) bọc `whitespace-nowrap` để không gãy giữa chừng; phần chữ dài
  (tên đơn vị, nội dung) dùng `truncate` / `line-clamp-2`.
- Hai nút ngang nhau trên điện thoại: `grid grid-cols-2 gap-2 sm:flex` — không để một nút một dòng lệch nhau.
- Thanh tab nhiều mục cuộn ngang có chủ đích (`overflow-x-auto`) — script không coi là lỗi.
- Ô nhập trên điện thoại cỡ chữ ≥ 16px (`text-base sm:text-sm`) để iOS không tự phóng to.
- Chữ tiếng Việt dài hơn bản mẫu tiếng Anh 20–30%: thử với tên đơn vị/nội dung dài (preset đã có).
- Linh vật chatbot mang `data-ui-overlay` và được ẩn khi chụp; nếu nó che nút quan trọng khi dùng thật thì báo riêng.

## Playwright MCP (tương tác)

Máy này đã cài MCP `playwright` (Edge). Trước khi dùng các trang cần đăng nhập:

```bash
npm run verify:ui-session      # ghi reports/verify/mcp-state.json — phiên admin dev, hạn 8 giờ
```

MCP đọc tệp đó khi khởi động; tạo lại tệp rồi mở lại MCP (`/mcp`) khi phiên hết hạn. Chỉ dùng với
`http://localhost:3030`. Thao tác qua MCP **ghi thật vào DB dev** — không bấm lưu/xoá trên bản ghi thật; ưu
tiên preset giả lập.
