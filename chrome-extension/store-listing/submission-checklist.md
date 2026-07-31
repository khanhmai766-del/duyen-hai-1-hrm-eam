# Danh sách trước khi gửi duyệt phiên bản 1.1.0

## Tài khoản và phê duyệt

- [ ] Tài khoản Chrome Web Store Developer đã bật xác minh hai bước.
- [ ] Email liên hệ của nhà phát hành đã được xác minh.
- [ ] Có xác nhận nội bộ cho phép tiện ích truy cập QLVT và LIMS.
- [ ] Không cung cấp tài khoản hoặc VPN nội bộ cho bên ngoài khi chưa có phê duyệt của đơn vị.

## Kiểm thử bản phát hành

- [x] Chạy `node chrome-extension/scripts/package-store.mjs`.
- [ ] Cài thử chính gói `qlvt-sync-store-v1.1.0.zip`, không chỉ thử thư mục mã nguồn.
- [ ] Kiểm tra đồng bộ QLVT khi phiên còn hạn và hết hạn.
- [ ] Kiểm tra LIMS với các khoảng 7 / 14 / 30 ngày.
- [ ] Kiểm tra LIMS khi ở Dashboard, sai khu vực, hết phiên và không có mẫu Không Đạt.
- [ ] Kiểm tra trường hợp tab nguồn đã mở trước khi cập nhật tiện ích.
- [x] Xác nhận bản Store không chứa quyền hoặc URL localhost.
- [x] Xác nhận ZIP chứa `bridge-lims.js` và `bridge-lims-page.js`.

## Nội dung Chrome Web Store

- [ ] Triển khai `https://duyenhai1.vn/public/qlvt-sync-privacy` và kiểm tra không yêu cầu đăng nhập.
- [ ] Upload gói `qlvt-sync-store-v1.1.0.zip`.
- [ ] Upload icon 128×128.
- [x] Đã tạo hai ảnh 1280×800 bằng dữ liệu minh họa:
  - `store-assets/screenshot-qlvt-sync-v1.1.0-1280x800.png`
  - `store-assets/screenshot-lims-sync-v1.1.0-1280x800.png`
- [ ] Upload hai ảnh trên vào Store theo thứ tự QLVT trước, LIMS sau.
- [ ] Cập nhật tên, tóm tắt và mô tả theo `vi.md`.
- [ ] Cập nhật Privacy Practices theo `privacy-declarations.md`.
- [ ] Khai báo Website content và giải thích quyền `portal.tpcduyenhai.com.vn`.
- [ ] Dán nội dung `review-notes.md`.
- [ ] Giữ Visibility phù hợp với người dùng nội bộ, ví dụ Unlisted.
- [ ] Thông báo người dùng rằng phiên bản mới bổ sung quyền truy cập LIMS.
- [ ] Gửi xét duyệt; cân nhắc tắt tự động phát hành để kiểm soát thời điểm triển khai.

## Khi cập nhật các phiên bản sau

1. Tăng `version` trong `manifest.json`.
2. Cập nhật mô tả, Privacy Practices và chính sách quyền riêng tư nếu phạm vi dữ liệu/quyền thay đổi.
3. Chạy `node chrome-extension/scripts/package-store.mjs`.
4. Cài và kiểm thử chính ZIP vừa tạo.
5. Upload ZIP mới và gửi xét duyệt lại.
