# Hạng mục đại tu ↔ Google Sheets tiến độ (service account)

Form cấp **PCT nhà thầu · Đại tu** gợi ý *mã hạng mục + nội dung công việc* theo **loại PCT (Cơ/Điện), cương vị và
nhà thầu**, lấy từ 4 file tiến độ đại tu. Link các file nằm ở **Sổ PCT → Tiến độ đại tu**, dòng 1–4
(Lò hơi · Turbine · Máy phát · C&I). Dòng 0 "Lọc dữ liệu hạng mục thô" chỉ là link tham khảo, không phải nguồn.

- Đọc: `lib/server/work-permit-overhaul.ts` (quy tắc đọc ghi ở đầu file) qua `lib/server/google-sheets.ts`.
- Dữ liệu chép về bảng `WorkPermitOverhaulItem`; form cấp phiếu chỉ tra DB.
- Đồng bộ: nút **Đồng bộ hạng mục** (bảng Tiến độ đại tu, hộp chọn hạng mục) + timer `dh1-overhaul-items-sync`
  06:00 hằng ngày (`npm run import:overhaul-items`).
- Đợt 2: ghi kết quả ngày của PCT về Sheet — xem mục **Đợt 2** bên dưới.

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

## Đợt 2 — kết quả ngày PCT → Sheet (10/2026)

Web là nguồn, Sheet theo web. Code: `lib/server/overhaul-sheet-writer.ts`; lệnh: `npm run overhaul:sheet` (đầu tệp
`scripts/import/overhaul-sheet.ts` liệt kê các tham số).

**Luồng**

| Khi | Ô ngày (trạng thái) | Nhật ký ngày | % Hoàn thành / Trạng thái hiện tại |
| --- | --- | --- | --- |
| **Cập nhật tiến độ** giữa chừng (nút cạnh Kết thúc), hạng mục có tick | Đang thực hiện (ngày cập nhật) | ghi đè `PCT <số>/<năm>` ↵ `HH:mm · CHTT: ghi chú (x%)` | % lũy kế nhập / Đang thực hiện |
| Kết thúc lần làm việc, hạng mục **có tick** | Đang thực hiện | ghi đè `PCT <số>/<năm>` ↵ `HH:mm · CHTT: ghi chú (x%)` | % lũy kế nhập / Đang thực hiện |
| Kết thúc lần làm việc, hạng mục **không tick** | Không thực hiện (đã "Cập nhật tiến độ" cùng ngày → vẫn Đang thực hiện) | — | giữ % / Không thực hiện |
| 16:00, PCT còn hiệu lực mà cả ngày không mở lần làm việc | Không mở ngày thực hiện | — | giữ % / Không mở ngày thực hiện |
| Kết thúc phiếu | Kết thúc công tác | ghi đè `PCT <số>/<năm>` ↵ `HH:mm · Kết thúc phiếu` | giữ % / Kết thúc công tác |
| Hạng mục chưa nằm trong PCT nào | (mặc định) Chưa thực hiện — app không ghi | | |

- Ngày = ngày giờ VN của thời điểm kết thúc. Cột ngày tìm theo `dd/mm` trong tiêu đề "Ngày n"; hàng tìm theo **mã** mỗi
  lần ghi (người dùng có thể chèn/xoá hàng; từ 04/10/2026 tab "Lò phó - Cơ" đã bỏ `INDEX(FILTER(...))` từ tab "Lò- Cơ", chuyển sang giá trị tĩnh như các file khác — bản sao công thức cũ: `/root/backup-lo-pho-co-filter-2026-10-040327.json` trên server); cột %/Trạng thái tìm theo tên tiêu đề.
- Ghi chú hạng mục trống → Nhật ký ngày dùng ghi chú chung của lần làm việc / lần cập nhật.
- Nhật ký ngày (từ 05/10/2026): ô được **dựng lại** mỗi lần ghi — mỗi PCT có cập nhật trong ngày một đoạn
  `PCT <số>/<năm>` ↵ nội dung mới nhất của PCT đó (hạng mục phối hợp Cơ + Điện → hai đoạn); dòng kết thúc / huỷ phiếu
  nối sau. Chữ gõ tay trong ô ngày đó bị thay. (04/10: ghi đè một đoạn; trước nữa: nối thêm dòng.)
- "Trạng thái hiện tại" **bị ghi đè bằng giá trị** (bỏ công thức ở hàng đó), lấy kết quả của **ngày mới nhất** — chạy bù
  ngày cũ không đè ngày sau. Trong cùng ngày, ưu tiên: Không mở ngày thực hiện < Không thực hiện < có làm / kết thúc
  (hai PCT cùng giữ một hạng mục: phiếu không làm không đè phiếu có làm). "% Hoàn thành" là lũy kế **chung** của hạng
  mục: chỉ ghi khi bằng/cao hơn số đã ghi, không kéo lùi.
- **Vùng khoá: KHÔNG khoá trong đợt S2.** Từ 06/10/2026 cột "% Hoàn thành", "Trạng thái hiện tại" và ô trạng thái
  từng ngày (cột F trở đi) **để mở** cho mọi người nhập tiến độ trên Sheet — đã gỡ toàn bộ vùng khoá do web tạo bằng
  `npm run overhaul:sheet -- --unprotect --apply` (giữ vùng khoá A:E của người soạn file). Đừng chạy lại `--protect`.
  Ô nào có PCT cập nhật thì web vẫn ghi đè (ô ngày, "Trạng thái hiện tại"; "% Hoàn thành" chỉ khi bằng/cao hơn số web
  đã ghi). Trang web `/tien-ich/tien-do-dai-tu` chỉ hiện kết quả web ghi; % nhập tay trên Sheet chỉ được web đọc ở lần
  đồng bộ hạng mục (06:00 hằng ngày) và dùng cho hạng mục web chưa ghi %.
- Không tìm thấy tab / mã / cột ngày, hoặc mã trùng trong tab → báo lỗi, **không đoán ghi chỗ khác**; thử lại theo
  khoảng tăng dần (15 phút → 24 giờ, tối đa 8 lần) rồi `FAILED`. Xem: `npm run overhaul:sheet -- --status`.
- Thao tác trên phiếu chỉ ghi hàng đợi `OverhaulSheetOutbox` trong cùng transaction; đẩy lên Google ngay sau khi trả
  lời người dùng, cộng timer `dh1-overhaul-sheet-push` 15 phút và `dh1-overhaul-daily-status` 16:00
  (`scripts/systemd/README.md`). Google lỗi không chặn người dùng kết thúc ngày.
- **Một tiến trình đẩy tại một thời điểm** (`drainOverhaulSheetOutbox`, khoá tư vấn Postgres): nhiều người bấm Kết thúc
  cùng lúc thì người giữ khoá gom thành lô — mỗi lô mỗi file chỉ 2 lần đọc + 1 lần ghi, không nhân theo số người.
  Người đến sau chờ tới lượt; hàng đợi đã sạch thì không gọi Google.
- **Hạn mức Google** (miễn phí, ~60 đọc + 60 ghi mỗi phút cho service account; không dính quota Gemini): gặp 429 thì
  hoãn ~70 giây rồi ghi tiếp, không tính là lần lỗi.

**Công tắc ghi `OVERHAUL_SHEET_WRITE=1`** (`.env`). Thiếu → hàng đợi vẫn xếp nhưng KHÔNG ghi Sheet. Máy dev dùng chung
link 4 file thật với production nên **không bật trên dev**; thử trên dev bằng `npm run overhaul:sheet -- --dry` (đọc
Sheet, in ô sẽ ghi). Bật trên server sau khi làm xong các bước chuẩn bị dưới đây.

**Chuẩn bị Sheet trước khi bật**

1. Tab **CI** đang khoá A:G — cho service account quyền sửa cột "% Hoàn thành" và "Trạng thái hiện tại" (hoặc thu
   vùng khoá về A:E). Ô bị khoá → lỗi "Ô cần ghi nằm trong vùng bị khoá".
2. `npm run overhaul:sheet -- --setup` (xem trước) → `--setup --apply` (**đã chạy 03/10/2026**, user cho phép):
   - danh sách thả xuống ô ngày → 5 trạng thái mới; ô ngày còn chữ cũ đổi sang chữ mới;
   - hàng hạng mục còn công thức / chữ cũ: "% Hoàn thành" = 0, "Trạng thái hiện tại" = ô ngày gần nhất có chữ
     (trống → Chưa thực hiện);
   - tổng hợp đầu tab: ĐÃ HOÀN THÀNH = số mục 100% · ĐANG THỰC HIỆN = số mục 1–99% · TỔNG (Turbine) = đếm 5 trạng
     thái · % TIẾN ĐỘ = trung bình % các mục.
   - **chuẩn hoá mọi tab giống nhau** (03/10): tiêu đề `="Ngày N"&CHAR(10)&TEXT($G$2+N-1;"dd/mm")` liền mạch; hàng 2–4
     cùng nhãn (TỔNG SỐ HẠNG MỤC · ĐÃ HOÀN THÀNH · ĐANG THỰC HIỆN · % TIẾN ĐỘ · Ngày bắt đầu đại tu) và công thức (vùng
     mở `G7:G`); hàng nhật ký đủ nhãn + ô gộp; ô ngày tự xuống dòng; cột % tĩnh → công thức; cùng bộ màu 5 trạng thái.
   Chạy lại an toàn (ô đã đúng thì bỏ qua) — file thêm tab mới thì chạy lại `--setup --apply` là đồng bộ. Đợt 03/10 sửa
   các lỗi có sẵn: tiêu đề "Ngày 41" sai dấu và cột ngày 34 chép nhầm thành "Ngày 41" (3 tab Turbine Điện), 108 hàng
   nhật ký thiếu nhãn (Trợ Thủ-Điện), TỔNG của CI đếm thừa 2.
   - 03/10 (user cho phép): bỏ cột "Cương vị" ở mọi tab hạng mục file Máy phát (chỉ hàng 5 trở xuống — hàng 2–4 là
     khối tổng hợp) → **mọi tab 4 file cùng bố cục**: A Mã · B Tên TB · C Nội dung · D Biện pháp · E Nhà thầu ·
     F % · G Trạng thái · H–BO "Ngày 1–60"; **mọi tab bắt đầu 06/10/2026** (G2, định dạng ngày). Cương vị tab Máy phát
     lấy theo tên tab ("Trực chính điện" giữ nguyên tên). Tab "Điện_1" (chưa phân chia, đã tách sang "Máy Phó-Điện" /
     "Trợ thủ-Điện") app **bỏ qua** (`IGNORED_TABS`).
   - Bộ ghi báo lỗi nếu hai cột cùng một ngày (tiêu đề chép nhầm) thay vì đoán cột.

**Trên web**

- Hộp Kết thúc lần làm việc của PCT đại tu: từng hạng mục (xem biện pháp thi công) → tick đã làm, % lũy kế (không thấp
  hơn lần trước), ghi chú. % chung của phiếu = trung bình. Lưu ở `WorkPermitSession.itemProgress`.
- "Cập nhật tiến độ" (lần làm việc đang mở, PCT đại tu): như hộp Kết thúc nhưng không có thời điểm / người xác nhận;
  lưu kết quả mới nhất từng mục ở `WorkPermitSession.itemProgress` (kèm `at`). Hộp Kết thúc tick sẵn mục đã cập nhật hôm nay.
- Hạng mục đã nằm trong PCT **đã cấp** chưa huỷ / kết thúc phiếu: làm mờ + "Đã có trong PCT số …"; chọn vẫn được nhưng
  phải xác nhận (hai phiếu được cùng giữ một hạng mục). Server đòi cờ xác nhận cho mục MỚI thêm
  (`assertOverhaulItemsConfirmed`). Phiếu nháp chỉ được nhắc.
- Hạn "Kết thúc công việc dự kiến": còn ≤ 2 ngày → nhãn hổ phách; quá hạn → nhãn đỏ, server chặn mở / bàn giao lần làm
  việc (vẫn kết thúc được lần đang mở). Theo quy định: kết thúc phiếu, cấp PCT mới.

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
