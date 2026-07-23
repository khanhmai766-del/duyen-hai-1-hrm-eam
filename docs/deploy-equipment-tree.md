# Runbook deploy: Cây thiết bị mới (fullCode + lazy-load + phương án S2)

> Áp dụng cho production (VPS `/var/www/dh1-app`, pm2 `dh1-app`, DB `192.168.45.81/dh1db`).
> **Chạy ngoài giờ.** Toàn bộ SQL đều additive/an toàn chạy lại — KHÔNG dùng `prisma db push` trên prod.

## Thứ tự bắt buộc

1. **Sao lưu DB** (`pg_dump dh1db`).
2. `git pull origin main` && `npm install`.
3. **Áp schema additive**:
   ```bash
   npx prisma db execute --file prisma/manual/sync-equipment-tree-s2.sql --schema prisma/schema.prisma
   ```
4. `npm run build` (tự chạy prisma generate) — build XONG mới restart.
5. **Xóa cây cũ + nạp cây chuẩn 22.708 node** (ngoài giờ):
   ```bash
   npm run db:reset-equipment-tree            # xem trước
   npm run db:reset-equipment-tree -- --confirm
   npm run import:equipment-tree -- /duong-dan/danhmucs1common.xlsx
   ```
6. **Migrate phân quyền hệ thống** (BẮT BUỘC — scope cũ dạng "1.13" không khớp mã mới,
   cương vị có scope sẽ thấy CÂY RỖNG nếu bỏ qua):
   ```bash
   node scripts/migrate-position-scopes.mjs             # xem trước
   node scripts/migrate-position-scopes.mjs --confirm
   ```
   Sau đó admin mở màn hình phân quyền hệ thống rà lại.
7. `pm2 restart dh1-app`.
8. **Smoke test**: mở Cây thiết bị (chỉ tải nhánh gốc), bung vài cấp, tìm "bom",
   mở lý lịch 1 thiết bị nhánh 1 (tab S1/S2), 1 thiết bị nhánh 5 (COMMON),
   thử sửa Cương vị quản lý, thử Nhập Excel → Xem trước.

## Yêu cầu hạ tầng

- **nginx: bật gzip cho `application/json`** (giảm payload ~10 lần cho các form còn tải
  cây đầy đủ — xem Follow-up). Kiểm tra: `curl -H "Accept-Encoding: gzip" -sI https://duyenhai1.vn/api/equipment-tree | grep -i content-encoding`.
- **pm2 giữ 1 instance (fork mode)** — cache node/index/access là in-process; chạy
  cluster nhiều instance sẽ khiến invalidate cache không lan giữa các instance.
- `DATABASE_URL` giữ `connection_limit=10&pool_timeout=20`.

## Số liệu hiệu năng đã đo (22.708 node)

| Đường | Kết quả |
|---|---|
| /api/equipment-tree/roots · /children | 1–2ms, dùng index `parentSeq+sort` |
| /api/equipment-tree/search (không dấu, 50/trang) | ~10ms |
| /api/equipment-tree (cây đầy đủ — chỉ export & form cũ) | 220ms DB + ~3MB JSON (~300KB gzip), cache server 60s |

## Follow-up đã ghi nhận (không chặn deploy)

1. **EquipmentTreePicker + form khiếm khuyết/sửa chữa + thẻ phân quyền admin** còn tải cây
   đầy đủ (3MB, cache 60s/10min + gzip). Kế hoạch: thêm filter theo-cương-vị cho API lazy
   (roots/children nhận `position` + mức `edit`) rồi chuyển picker sang lazy; form
   khiếm khuyết cần thêm endpoint "node lá của nhánh". Làm trong pass riêng có test kỹ
   vì đây là form nghiệp vụ hằng ngày.
2. **/api/devices** trả toàn bộ danh sách lá (~20k) cho view dashboard — cần server-side
   pagination + aggregate. View bảng đã ẩn khỏi UI nên mức độ thấp.
3. Nối `machine` (S1/S2/COMMON) vào luồng GHI vật tư/QR trong UI (khiếm khuyết & sửa chữa đã có).
4. Búa gõ (DH1.S1.1.13.2): DB đã gom còn 4 nhánh A1/A2/B1/B2 nhưng file Excel nguồn vẫn
   chứa 720 dòng cũ — nhập lại toàn bộ file sẽ đụng mã. Nên sửa file nguồn cho khớp.
