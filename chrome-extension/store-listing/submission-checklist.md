# Danh sách trước khi gửi duyệt

- [ ] Đăng ký Chrome Web Store Developer và bật xác minh hai bước.
- [ ] Xác minh email liên hệ của nhà phát hành.
- [ ] Có xác nhận nội bộ cho phép phát hành tiện ích truy cập QLVT.
- [ ] Triển khai URL chính sách quyền riêng tư và kiểm tra không yêu cầu đăng nhập.
- [ ] Upload `qlvt-sync-store-v1.0.3.zip`.
- [ ] Upload icon 128×128 và ảnh chụp 1280×800 trong thư mục `store-assets`.
- [ ] Điền nội dung trong `vi.md`.
- [ ] Điền khai báo quyền/dữ liệu theo `privacy-declarations.md`.
- [ ] Chọn Visibility: Unlisted.
- [ ] Dán nội dung `review-notes.md`; không cung cấp tài khoản hoặc VPN nội bộ khi chưa có phê duyệt của đơn vị.
- [ ] Gửi xét duyệt.

## Khi cập nhật phiên bản

1. Tăng `version` trong `manifest.json`.
2. Chạy `node chrome-extension/scripts/package-store.mjs`.
3. Upload ZIP mới và gửi xét duyệt lại.
