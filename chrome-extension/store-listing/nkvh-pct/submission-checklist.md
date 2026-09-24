# Danh sách trước khi nộp Edge Add-ons – Cấp số PCT NKVH 1.0.1

## Phê duyệt và tài khoản

- [ ] Có xác nhận của bộ phận quản lý NKVH / CNTT cho phép tiện ích điền số phiếu trên NKVH và chuyển nội dung phiếu sang duyenhai1.vn.
- [ ] Tài khoản Microsoft Partner Center (chương trình Microsoft Edge) đã đăng ký xong và bật xác minh hai bước.

## Trước khi nộp

- [ ] Commit, push và deploy: trang https://duyenhai1.vn/public/nkvh-pct-privacy phải mở được **khi chưa đăng nhập**.
- [ ] API `/api/work-permits/nkvh-claim` đã có trên production (cùng lượt deploy trên).
- [ ] Đã đặt mốc sổ giấy năm hiện tại cho **cả sổ Cơ và sổ Điện** trên production.
- [x] Chạy `node chrome-extension/scripts/package-nkvh-pct.mjs` → `chrome-extension/dist/nkvh-pct-store-v1.0.1.zip`.
- [x] Gói không chứa quyền hoặc URL localhost.
- [ ] Cài thử **chính file ZIP** (giải nén ra thư mục rồi Load unpacked), không chỉ thư mục mã nguồn.
- [ ] Thử trên NKVH thật, sổ Điện và sổ T-C-N-H: lấy số, bấm lại (không tốn số), điền số, đồng bộ về sổ; không bấm Lưu trên NKVH khi thử.

## Trong Partner Center

- [ ] Packages: tải lên file ZIP.
- [ ] Availability: Hidden.
- [ ] Properties: theo `edge-listing.md`.
- [ ] Store listings (Tiếng Việt): mô tả và logo 300 × 300 theo `edge-listing.md`.
- [ ] Submit: dán `review-notes.md` vào ô Notes for certification.

## Mỗi lần phát hành bản mới

1. Tăng `version` trong `chrome-extension/nkvh-pct/manifest.json` (ví dụ 1.0.1).
2. Chạy lại lệnh đóng gói.
3. Partner Center → tiện ích → **Update** → tải gói mới → Publish. Máy đã cài sẽ tự cập nhật.
