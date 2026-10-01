# Hạng mục đại tu ↔ Google Sheets tiến độ (service account)

Form cấp **PCT nhà thầu · Đại tu** gợi ý *mã hạng mục + nội dung công việc* theo **loại PCT (Cơ/Điện), cương vị và
nhà thầu**, lấy từ 4 file tiến độ đại tu. Link các file nằm ở **Sổ PCT → Tiến độ đại tu**, dòng 1–4
(Lò hơi · Turbine · Máy phát · C&I). Dòng 0 "Lọc dữ liệu hạng mục thô" chỉ là link tham khảo, không phải nguồn.

- Đọc: `lib/server/work-permit-overhaul.ts` (quy tắc đọc ghi ở đầu file) qua `lib/server/google-sheets.ts`.
- Dữ liệu chép về bảng `WorkPermitOverhaulItem`; form cấp phiếu chỉ tra DB.
- Đồng bộ: nút **Đồng bộ hạng mục** (bảng Tiến độ đại tu, hộp chọn hạng mục) + timer `dh1-overhaul-items-sync`
  06:00 hằng ngày (`npm run import:overhaul-items`).
- Đợt 2 (chưa làm): ghi kết quả ngày khi kết thúc lượt làm việc vào ô "Ngày n" — cùng service account.

## Quy ước trong file Sheets

| Thứ | Quy ước |
| --- | --- |
| Tab được đọc | Có hàng tiêu đề chứa ô **Mã hạng mục** và **Nội dung công việc** (30 hàng đầu). Tab "Tiến độ …", README, "Chi tiết …" tự bỏ. |
| Cột | Mã hạng mục · Tên thiết bị · Nội dung công việc · Biện pháp thi công · *Cương vị* · Nhà thầu · % Hoàn thành · Trạng thái hiện tại — thứ tự tuỳ ý, tìm theo tên. |
| Loại PCT | Đuôi tên tab: `- Cơ`, `-Điện`, `_Cơ`… File Máy phát và C&I không cần đuôi (mặc định PCT Điện). Tab file Lò/Turbine thiếu đuôi bị bỏ và báo. |
| Cương vị | Cột **Cương vị** của từng dòng; tab không có cột này (vd `CI`) thì lấy theo tên tab. Tên khác danh mục app ánh xạ ở `POSITION_ALIASES` (hiện: "Lò hơi" → Lò phó, "CI" → C&I). |
| Nhà thầu | Cột **Nhà thầu** ghi **mã viết tắt** trùng "Mã đơn vị" trong danh bạ nhà thầu của app (IDC, EPS, VATCO…). Dòng chưa ghi nhà thầu bị bỏ. |
| Gộp trùng | Cùng (loại PCT, mã, cương vị) ở tab nguồn ("Lò- Cơ") và tab cương vị ("Lò phó - Cơ") → một hạng mục. |

Sau mỗi lần đồng bộ, hộp kết quả liệt kê theo từng file: số hạng mục Cơ/Điện, **nhà thầu chưa có trong danh bạ**,
**cương vị chưa khớp**, tab bị bỏ, lỗi quyền.

## Cài đặt service account (đã làm 01/10/2026)

1. Google Cloud: dự án `dh1-eam` → bật **Google Sheets API**.
2. IAM & Admin → Service Accounts → tạo `dh1-sheets-sync` (không cấp role) →
   email `dh1-sheets-sync@dh1-eam.iam.gserviceaccount.com`.
3. Keys → Add key → JSON. Tệp khoá là **mật khẩu**: không gửi qua chat, không để trong OneDrive/repo.
4. Chia sẻ **từng** file tiến độ cho email trên, quyền **Người chỉnh sửa** (đợt 2 cần ghi). Nên đặt
   "Quyền truy cập chung" của file về **Bị hạn chế** — không để "Bất kỳ ai có đường liên kết — Người chỉnh sửa".

### Đặt khoá

- Máy dev: `C:\Users\Asus\.secrets\dh1-google-sa.json`, `.env`: `GOOGLE_SA_KEY_FILE="C:/Users/Asus/.secrets/dh1-google-sa.json"`.
- Server: chép khoá lên `/root/.config/dh1-google-sa.json` (`chmod 600`), thêm vào `.env` của app
  `GOOGLE_SA_KEY_FILE="/root/.config/dh1-google-sa.json"` rồi **reload** pm2.
- Timer: chép `scripts/systemd/dh1-overhaul-items-sync.{service,timer}` vào `/etc/systemd/system/`,
  `systemctl daemon-reload && systemctl enable --now dh1-overhaul-items-sync.timer` (xem `scripts/systemd/README.md`).

### Sự cố thường gặp

| Thông báo | Xử lý |
| --- | --- |
| "File chưa được chia sẻ cho tài khoản dịch vụ …" | Chia sẻ file cho email service account (Người chỉnh sửa). |
| "Không tìm thấy file — kiểm tra lại link" | Link trong bảng Tiến độ đại tu sai/bị xoá; dán lại link. |
| "Máy chủ chưa cấu hình tài khoản dịch vụ Google" | Thiếu `GOOGLE_SA_KEY_FILE` hoặc tệp khoá trên server. |
| Hạng mục không hiện khi chọn nhà thầu | Mã đơn vị trong danh bạ nhà thầu khác cột "Nhà thầu" trên Sheet (vd SGIDC ≠ IDC). |
