# Module Quản lý thiết bị PCCC — Phân xưởng Vận hành 1

Đưa file Excel "Quản lý BCC và TCC.xlsx" + bản web demo tĩnh (`Web_Demo_PCCC`,
lưu bằng `localStorage`) về hệ thống này: **Postgres là nguồn sự thật duy nhất**,
dùng lại NextAuth/RBAC, AuditLog, exceljs, cây thiết bị `EquipmentNode`.

Trạng thái: **A–F đã xong** — schema, import từ Google Sheet, API `/api/pccc/*`,
trang `/pccc` 4 tab, xuất Excel phía server, chuẩn hoá cương vị theo danh mục chức
danh (mục 4b), giới hạn ghi/ký theo phạm vi cương vị (mục 4e), tự động chốt kỳ +
lưu trữ S3 + dọn DB (mục 6).

## 1. Mô hình dữ liệu

| Bảng | Nguồn trong Excel |
| --- | --- |
| `pccc_periods` | mỗi sheet-theo-tháng → 1 kỳ (`label` = `T08.2026`) |
| `pccc_extinguishers` | sheet `BÌNH CHỮA CHÁY - <kỳ>`, 20 cột, khoá `(kỳ, ma)` |
| `pccc_cabinets` | sheet `TỦ CHỮA CHÁY - <kỳ>`, 7 cột định danh + 4 cột cuối |
| `pccc_cabinet_components` | khối ô ☑/☐: 10 nhóm × 2–4 trạng thái = 28 cột/tủ |
| `pccc_bulks` | sheet `FOAM+CO2+DIESEL - <kỳ>`, khoá `(kỳ, ten)` (Excel không có mã) |
| `pccc_fm200_panels` | 2 bảng FM200 bố cục ngang (bình = cột), 1 bản ghi/bảng/kỳ |
| `pccc_signatures` | chữ ký — mỗi mục tiêu tối đa 1 chữ ký hiệu lực |

Trường **dẫn xuất** được lưu sẵn để dashboard/lọc không phải quét bảng con:
`denHanThayThe` (= `ngaySx` + `thoiGianSd` năm), `phanTramConLai`, `tinhTrang`
của FCD, `tinhTrangTongThe` của TCC. `%`/trạng thái FM200 **không** lưu — tính
từ `(giá trị − min)/(max − min)` khi đọc.

`deviceSeq` (trỏ `EquipmentNode.seq`) là tham chiếu **mềm, không FK**: mã PCCC
(`VH1/BCC/…`) hiện chưa có trong danh mục cây thiết bị nên phần lớn còn `null`.

## 2. Import dữ liệu

**Nguồn chuẩn hiện tại là Google Sheet** (bản mới nhất, xem mục 4):
`https://docs.google.com/spreadsheets/d/1SKUlBDkydprOoOF0FTpFbfLCECJuZzEAlyhC9_Rw6JQ`

```bash
npm run import:pccc -- --gsheet "1SKUlBDkydprOoOF0FTpFbfLCECJuZzEAlyhC9_Rw6JQ"
npm run import:pccc -- --file "C:/Users/Asus/Downloads/Web_Demo_PCCC/Quản lý BCC và TCC (1).xlsx"
```

`--gsheet` tải Sheet về `.xlsx` tạm qua endpoint `export?format=xlsx` rồi đọc như
file thường. Chỉ chạy được khi Sheet chia sẻ theo đường liên kết — endpoint export
không mang theo đăng nhập; nếu Sheet bị hạn chế, tải tay rồi dùng `--file`.

- **Tự dò kỳ** từ tên sheet theo regex `T<mm>.<yyyy>` — không còn phải sửa tay
  danh sách `MONTHS` như `export_web_data.py` (hạn chế ghi ở mục 6 README demo).
- Nhận cả hai cách đặt tên sheet FCD đang tồn tại: `FOAM+CO2+DIESEL - …` và
  `FOAM+CO2+DO+FM200 - …`.
- **Idempotent**: upsert theo `(kỳ, mã)`; chạy lại không nhân bản. Ô linh kiện của
  mỗi tủ được ghi lại toàn bộ mỗi lần chạy.
- Mặc định **không xoá gì**. Dòng có trong DB mà không còn trong file nguồn chỉ
  được *báo cáo*; thêm `--prune` mới xoá. `--dry-run` để xem số liệu trước.
- `--json <data.json>`: lấy phần **FM200** từ bản demo, vì file Excel đang dùng
  (`Quản lý BCC và TCC (1).xlsx`) **không có** bảng FM200 — nó chỉ có sheet
  `FOAM+CO2+DIESEL` với 3 dòng bồn.

## 3. Đối chiếu với sheet TỔNG QUAN (T08.2026) — đã khớp

BCC: 747 bình (MFZ 515 / CO2 161 / Foam 71), Khả dụng 384 · Cần theo dõi 213 ·
Bất khả dụng 150 — **khớp tuyệt đối** với dòng TỔNG CỘNG của sheet TỔNG QUAN.

TCC: cả 20 dòng linh kiện (10 nhóm × INDOOR/OUTDOOR) khớp từng con số. Ví dụ
Kính 176+38 = 214 bình thường, 37+3 = 40 hư hỏng hoàn toàn. Tổng theo nhóm có thể
> 254 tủ vì **1 nhóm được tích nhiều trạng thái cùng lúc** (vd chân đế 252 khả dụng
+ 7 gỉ sét = 259).

Quy tắc `tinhTrangTongThe` đã đối chiếu **đúng từng cột** với công thức ở cột ẩn
`AN` của sheet TCC (`=IF((I="☑")+(L="☑")+…>0,"Bất khả dụng",IF((K="☑")+(R="☑")+…>0,
"Cần theo dõi",…))`): cột đầu mỗi nhóm = khả dụng, cột cuối = bất khả dụng, giữa =
cần theo dõi.

## 3b. Ron chữa cháy — TÁI TẠO ĐƯỢC từ khối ô ☑

Hai dòng `Ron chữa cháy DN50` (619 / 4) và `DN65` (106 / 4) của sheet TỔNG QUAN **không
phải số nhập tay** như từng kết luận nhầm — bản web demo có sẵn công thức
(`ronCount()` trong `app.js`), và nó khớp TUYỆT ĐỐI:

- Mỗi tủ có **3 ron**, phân bổ **lăng phun 2 ron + ngàm 1 ron**.
  Cuộn ống **không** tính vào ron (sheet có dòng riêng "Cuộn ống chữa cháy DN50/DN65").
- `dayDu` = 2×(lăng phun tích "Khả dụng") + 1×(ngàm tích "Khả dụng")
- `thieuRon` = 2×(lăng phun tích "Thiếu ron") + 1×(ngàm tích "Thiếu ron")
- `DN50 ↔ tủ INDOOR`, `DN65 ↔ tủ OUTDOOR`

Kiểm chứng T09.2026: INDOOR 213 tủ → 639 vị trí, **619 đầy đủ / 4 thiếu**;
OUTDOOR 41 tủ → 123 vị trí, **106 / 4**. Đúng từng số của sheet.

Hằng số ở `RON_WEIGHTS` (`lib/pccc-status.ts`), tổng hợp ở `summarizeRon()`
(`lib/pccc-summary.ts`).

## 3c. "Quá hạn thay thế" cũng là số nhập tay

Cùng bản chất với dòng Ron: sheet ghi MFZ **117**, nhưng không mốc ngày nào tái tạo
được con số đó (CO2 91 và Foam 0 thì khớp mọi mốc). Áp cùng nguyên tắc — tính từ dữ
liệu: `denHanThayThe < ngày cuối của kỳ`, trong đó `denHanThayThe` = `ngaySx` +
`thoiGianSd` năm (đúng công thức `=EDATE(O5,P5*12)` ở cột 17 của sheet BCC).

Kết quả T08.2026: MFZ **110** · CO2 **91** · Foam **0** · tổng **201** (sheet: 117 /
91 / 0 / 208). Chênh 7 bình MFZ là do số nhập tay cũ — **có chủ đích**.

Bổ sung cột **"Sắp đến hạn"** (legend của sheet có nhãn này nhưng không có số):
đến hạn trong `SAP_DEN_HAN_DAYS = 90` ngày → T08.2026: MFZ 7 · CO2 10 · tổng 17.

Xem bảng tổng quan tính từ DB bất cứ lúc nào:

```bash
npm run check:pccc -- T08.2026
```

## 4. Điểm cần chốt / cảnh báo

1. **Ngưỡng % của FOAM/CO2/Diesel: đã chốt 90/70** theo công thức trong ô `I5` của
   sheet nguồn (`>=0.9` Đủ mức, `>=0.7` Cần theo dõi, còn lại Cần bổ sung gấp).
   Code bản demo dùng 75/50 là **sai** so với nguồn — bồn CO2 62% bị xếp "Cần theo
   dõi" trong khi sheet xếp "Cần bổ sung gấp". Import đã theo 90/70.
   Riêng **FM200 vẫn để 75/50** vì không có sheet nguồn để đối chiếu — cần chốt sau.
2. **DB dev đang lệch pha với `schema.prisma` từ trước** khi có module này:
   `prisma db push` sẽ **DROP 9 bảng** `ShiftSchedule*` / `*Rotation*` /
   `ShiftStaffing*` đang tồn tại trong DB nhưng không có trong schema, và bảng
   `oil_analysis_failures` thì có trong schema mà chưa có trong DB.
   → Vì vậy module PCCC được tạo bằng SQL riêng, chỉ CREATE:
   `npx prisma db execute --file scripts/sql/pccc_init.sql --schema prisma/schema.prisma`.
   Cần xử lý phần lệch pha kia riêng, đừng `db push` bừa.
3. **FM200: giữ trong phạm vi, nhập trực tiếp trên web (đã chốt).** Không file Excel
   nào trên máy còn bảng FM200 — Google Sheet và `Quản lý BCC và TCC (1).xlsx` chỉ có
   sheet `FOAM+CO2+DIESEL`; hai bản `Quan_ly_thiet_bi_PCCC.xlsx` trên
   `OneDrive/Desktop` thậm chí chỉ có 3 sheet (không có cả FCD). Vì vậy import **tạo
   sẵn khung** 2 bảng đúng cấu trúc cho mỗi kỳ (`FM200_DEFAULT_PANELS`): phòng kích
   từ 4 bình, nhà ĐKTT 16 bình `1A..8B`; mức 0–3 FT, áp 1670–2000 PSI.
   Khung này **chỉ được tạo khi chưa có** — chạy lại import không ghi đè số liệu
   người dùng đã nhập trên web. Không cần `--json` nữa.
   Ngưỡng % của FM200 vẫn tạm 75/50 (`FM200_THRESHOLDS`) vì không có sheet nguồn.

## 4b. Chuẩn hoá cương vị theo danh mục chức danh (đã làm)

Cương vị/cấp giám sát của PCCC nay chuẩn hoá về `POSITION_CATALOG`
(`lib/position-catalog.ts` — nguồn chuẩn duy nhất), theo quy ước:

| Quy ước | Chi tiết |
| --- | --- |
| Nhãn **không** hậu tố tổ máy | lưu `Lò phó`, không lưu `LÒ PHÓ S1` |
| Tổ máy là **trường riêng** | `machine` = `S1 \| S2 \| COMMON`, giống `EquipmentProfile.machine` |
| Phân quyền theo **mã** | `cuongViCode` (PositionCode); tổ máy chỉ là **bộ lọc xem** |
| Lưu cả mã và nhãn | đổi cách viết nhãn không làm sai quyền / lọc lịch sử |

Lý do bỏ qua tổ máy khi phân quyền: cùng một chức danh thực tế đi vận hành được cả
hai tổ máy, áp quyền riêng theo tổ máy sẽ chặn sai lúc cần cập nhật. Kiểm chứng:
chức danh `Lò phó` → 158 bình (S1 79 + S2 79), lọc tổ máy thu hẹp đúng 79/79.

24 giá trị thô → **17 chức danh chuẩn**. Các cách viết riêng của bảng PCCC đã được thêm vào
`aliases` của danh mục chung (không tạo nguồn chuẩn thứ hai): `TKLM`, `TKĐ`, `TBĐL&ĐK`,
`MNK - ND300M3`, `XLN HH`, `XLNT-ND5000M3`.

Bảng TỦ CHỮA CHÁY và FOAM+CO2+DIESEL còn dùng **cách viết đầy đủ** thay cho viết tắt, và
những giá trị này ban đầu KHÔNG khớp danh mục nên `cuongViCode` bị null — kéo theo hậu quả
thật: theo mục 4e, dòng không có mã cương vị thì mức `personal` **không sửa/ký được**. Đã
thêm 4 bí danh nữa và chuẩn hoá lại (46 dòng TCC + 4 dòng FCD):

| Giá trị trong bảng | Chuẩn về |
| --- | --- |
| `XỬ LÝ NƯỚC THẢI VÀ DẦU 5000M3` | `XLNT` (`WASTEWATER_TREATMENT`) |
| `NH3 VÀ LÒ HƠI PHỤ` | `NH3 - Lò hơi phụ` (`AUX_BOILER_NH3`) |
| `MÁY NÉN KHÍ VÀ DẦU 300M3` | `Khí nén - Nhà dầu` (`AIR_COMPRESSOR_OIL_HOUSE`) |
| `XỬ LÝ NƯỚC HỖN HỢP` | `XLN hỗn hợp` (`MIXED_WATER_TREATMENT`) |

Hiện **0 dòng BCC/TCC/FCD thiếu mã cương vị**. Riêng **2 bảng FM200 chưa gán cương vị** —
import chỉ tạo khung (`FM200_DEFAULT_PANELS`) chứ không có nguồn nào ghi ai phụ trách, nên
chưa ai ở mức `personal` ký được hai bảng đó. Cần nghiệp vụ chỉ định.

Cột **"Người giám sát" không phải tên người** mà là **cấp giám sát** — quan hệ khớp
đúng cây tổ chức: nhóm lò/máy → `TK Lò máy` (515 bình), nhóm điện/hoá → `Trưởng kíp
điện` (205), còn `TK Lò máy` và `Trạm bơm nước thô` → `Trưởng ca` (26). UI đổi tiêu đề
cột thành "Cấp giám sát".

```bash
npm run normalize:pccc              # DRY-RUN: in ra sẽ đổi gì, gộp theo phép đổi
npm run normalize:pccc -- --apply   # ghi thật
```

Idempotent: chạy lại ra 0 thay đổi. Lưu ý khi đọc code — `normalizePosition()` **phải**
được truyền tổ máy đang lưu; nếu chỉ suy từ nhãn thì sau lần chuẩn hoá đầu (nhãn đã bỏ
hậu tố) mọi dòng sẽ bị đưa về `COMMON`, mất tổ máy. Import cũng chuẩn hoá ngay lúc nạp
nên re-import không ghi đè lại giá trị thô.

Còn 1 bình `XLN hỗn hợp` **thiếu cấp giám sát** trong dữ liệu gốc — để trống, sửa trực
tiếp trên web (đề xuất: `Trưởng kíp điện`).

## 4c. Quy tắc Tình trạng ↔ Áp suất (bảng BCC)

Bê nguyên logic của bản web demo (`Web_Demo_PCCC/app.js`, vốn mô phỏng file Excel gốc),
đặt ở [`lib/pccc-status.ts`](../lib/pccc-status.ts) để **server và client dùng cùng một
bản** — client dựng danh sách chọn + tô màu, server **cưỡng chế khi ghi** (không tin
client vì có thể gọi API trực tiếp).

1. **Danh sách áp suất theo chủng loại**: bình CO2 → `Đúng theo khối lượng` /
   `KL hao hụt nhiều, cần nạp lại`; MFZ và Foam → `Đủ áp` / `1/4…4/4 mức đỏ` / `Hết áp`.
   Gán sai danh sách → API trả 400.
2. **Áp suất cảnh báo trở lên thì không được để "Khả dụng"** — ô tình trạng chỉ còn
   `Cần theo dõi` / `Bất khả dụng`.
3. **Đổi áp suất thì tình trạng tự nâng mức**: `Hết áp` → `Bất khả dụng`; mức cảnh báo
   → `Cần theo dõi` (giữ `Bất khả dụng` nếu đang nặng hơn). Response trả
   `autoAdjustedTinhTrang: true` để UI báo rõ vì sao ô khác cái vừa bấm.

Màu ba mức (`toneOf`) áp cho **cả hai** nhãn tình trạng và áp suất, đúng bảng chú giải
của sheet gốc. Cột "Đến hạn thay thế" tô đỏ khi quá hạn, vàng khi còn dưới
`HAN_THAY_THE_SOON_DAYS = 30` ngày.

Hai danh sách chọn khác cũng lấy đúng từ bản demo: `viTriHienTai` (Tại chỗ / Trả phòng
tập kết / Thất lạc) và `tinhTrangNgoai` (5 giá trị gỉ sét & hư hỏng). Ô select **luôn
chèn giá trị đang lưu nếu nó không nằm trong danh sách** — dữ liệu cũ có 1 dòng
`Hư hỏng khác, không còn chân giữ bình`, không chèn thì mở ô ra là mất.

Kiểm tra dữ liệu hiện có: **0 dòng vi phạm** quy tắc 2–3. Một dòng lệch chủng loại cần
sửa tay: `VH1/BCC/LP1/23/79` là **Bình CO2** nhưng áp suất ghi `Đủ áp` (giá trị của
bình MFZ) — ô vẫn hiện giá trị cũ, nhưng lần lưu tới bắt buộc chọn giá trị CO2 hợp lệ.

## 4d. Quy tắc ô ☑ của tủ chữa cháy

Ở [`lib/pccc-status.ts`](../lib/pccc-status.ts), dùng chung cho route và tổng hợp:

1. **Nhiều lỗi cùng lúc trong một nhóm là HỢP LỆ** (vd vừa "Thiếu ron" vừa "Gỉ sét") —
   quy tắc có chủ đích, đừng đổi thành chọn một.
2. **"Khả dụng" (cột đầu) và "Bất khả dụng"/"Hư hỏng nặng" (cột cuối) LOẠI TRỪ nhau** —
   tích ô này thì server tự bỏ tích ô kia (`applyTccToggle`). Các lỗi ở giữa không bị ảnh hưởng.
3. **Tình trạng tổng thể là DẪN XUẤT** (`deriveCabinetStatus`): có cột cuối → `Bất khả
   dụng`; có cột giữa → `Cần theo dõi`; chỉ có cột đầu → `Khả dụng`; không tích gì →
   `Cần theo dõi`. Khớp đúng công thức cột ẩn `AN` của sheet.

Dữ liệu nhập tay từ Excel có **6 tủ tích cả hai thái cực** ở nhóm CUỘN ỐNG (×3 kỳ = 18
ô): `A0SGA51BC090-TX/10/18`, `A0SGB01BC048-FGD1/01/05`, `A0SGB01BC052-ESP2/04/04`,
`A0SGB01BC062-NH3&LHP/02/03`, `A0SGF13BC004-XLNT&DAU5000/04/05`,
`A0SGF13BC005-XLNT&DAU5000/05/05`.

```bash
npm run normalize:tcc              # DRY-RUN
npm run normalize:tcc -- --apply   # bỏ tích "Khả dụng", giữ mức nặng hơn
```

**Chưa chạy `--apply`** vì nó làm số liệu lệch với sheet cũ: cuộn ống "bình thường"
giảm 6 (245 → 239 mỗi kỳ), tổng bình thường 2364 → 2358. Sheet đếm 6 tủ đó vào **cả
hai** cột nên tổng của sheet vốn đã tự mâu thuẫn; bản demo cũng normalize giống vậy khi
nạp dữ liệu. Cần nghiệp vụ xác nhận trước khi sửa dữ liệu.

## 4e. Giới hạn ghi/ký theo phạm vi cương vị (bước E — đã làm)

**XEM không giới hạn, GHI/KÝ mới thu hẹp.** Người trực cần thấy toàn cảnh nhà máy, nên
`pccc-view` vẫn cho xem cả bảng; chỉ đường ghi bị chặn. Thu hẹp dựa trên MỨC QUYỀN có
sẵn của hệ thống, không đẻ thêm bảng phân quyền riêng (`lib/pccc-service.ts`):

| `pccc-manage` | Ghi/ký được |
| --- | --- |
| `manage` / `full` | mọi cương vị (Trưởng ca, quản lý, ADMIN) |
| `personal` (mặc định TECHNICIAN) | chỉ dòng có `cuongViCode` trùng cương vị của mình |
| thấp hơn | không ghi được (403 như trước) |

Ba điểm đã chốt với nghiệp vụ (2026-08-07):

1. **Lấy TẤT CẢ cương vị được gán** — cương vị chính + 2 kiêm nhiệm + cương vị đang làm
   việc, không chỉ `currentPosition`: quên chuyển cương vị đang làm việc thì vẫn phải
   ghi được. Cùng tinh thần với việc bỏ qua tổ máy khi phân quyền (mục 4b).
2. **Cấp giám sát KHÔNG kèm quyền ghi** — chỉ so khớp `cuongViCode`, không so
   `nguoiGiamSatCode`. Giám sát muốn sửa thì nâng lên mức `manage`.
3. **Dòng chưa gán cương vị thì mức `personal` không đụng được** — buộc quản lý gán
   cương vị trước, tránh dòng vô chủ ai cũng sửa. (Hiện có 1 bình `XLN hỗn hợp` thiếu
   cấp giám sát — xem mục 4b.)

Thêm một rào nữa: mức `personal` **không chuyển được dòng sang cương vị khác**
(`pcccScopeMoveDenial`) — sửa ô "Cương vị quản lý" thành cương vị ngoài phạm vi là tự
đẩy dòng khỏi tầm với của mình, nên bị chặn.

Áp ở **cả 7 đường ghi**: PATCH của BCC/TCC/FCD/FM200, hai route lưu-theo-lượt
(`*/bulk`, báo lỗi **theo từng dòng** như các lỗi khác của lượt lưu) và POST chữ ký —
ký là chữ ký xác nhận của cương vị phụ trách nên phạm vi ký = phạm vi ghi. Huỷ ký vẫn
đòi `manage` như trước.

Phía web chỉ là lớp cho đỡ hụt công: các route GET trả thêm `meta.writeScope`, bảng
khoá sẵn ô của dòng ngoài phạm vi (kèm biểu tượng khoá cạnh mã thiết bị) và đầu trang
hiện huy hiệu "Chỉ sửa: <cương vị>". **Server vẫn kiểm lại toàn bộ khi ghi** vì client
gọi thẳng API được.

## 4f. Nút "Chỉnh sửa" — sửa bảng và ký tên (đã làm)

Hai tab Bình/Tủ chữa cháy gom hai tác vụ của một lượt đi kiểm tra vào **một cửa duy nhất**
(`Chỉnh sửa`), thay cho nút "Sửa bảng" đứng rời:

| Tác vụ | Việc xảy ra |
| --- | --- |
| **Sửa bảng** | Mở khoá ô, sửa nhiều dòng, bấm Lưu một lượt → **hộp thoại kết quả** ghi rõ số dòng đã lưu, số dòng bị quy tắc áp suất nâng mức, và nhắc chữ ký đã bị xoá |
| **Ký tên** | Hộp thoại xác nhận → ký **toàn bộ dòng thuộc cương vị quản lý** của người bấm |

Tab **Foam · CO2 · Diesel · FM200** cũng có nút **Chỉnh sửa → Sửa bảng**: bảng khoá theo
mặc định, mở khoá mới sửa, gom vào bản nháp rồi **Lưu một lượt** kèm hộp thoại kết quả —
giống hệt hai tab kia. Hai khác biệt có chủ đích:

- **Không có route lưu-một-lượt riêng.** Chỉ 3 bồn + 2 bảng FM200 nên `saveFcdEdits` gọi
  lại đúng các route PATCH từng mục đã có; dựng thêm một endpoint nữa không đáng.
- **Không có chống ghi đè theo `updatedAt`** như hai bảng nghìn dòng (bản ghi ở đây không
  mang mốc đó). Ít người sửa cùng lúc nên chấp nhận được, nhưng cần biết.

Khoá bản nháp: `bulk:<id>` / `panel:<id>`; ô số của FM200 nằm trong cùng bản nháp của bảng
với khoá `muc:<nhãn bình>` / `ap:<nhãn bình>`.

Ký ở tab này là **từng bồn / từng bảng FM200** (không ký theo cương vị), nhưng đi qua
**cùng một hộp thoại xác nhận** (`components/pccc/pccc-sign-dialog.tsx`) — kể cả lời nhắc
khi chưa có chữ ký số. Vì vậy menu Chỉnh sửa của tab này **không có mục "Ký tên"**: mục đó
ký theo cương vị cho bảng bình/tủ, để lọt vào đây là bấm một cái ký nhầm sang bảng bình
chữa cháy. Huỷ ký chỉ hỏi gọn bằng `confirm` vì nó chỉ xoá chữ ký, không ghi thêm gì.

Một lần ký ghi **ba thứ trong cùng một transaction** — thiếu thứ nào thì tháng sau không ai
biết ai đi kiểm tra và kiểm tra hôm nào:

1. bản ghi chữ ký (thẻ "Chữ ký": chưa ký → đã ký),
2. `nguoiKiemTra` = họ tên người bấm,
3. `ngayKiemTra` = ngày bấm xác nhận.

Áp cho **cả ký hàng loạt lẫn ký từng mục**. Bảng bồn Foam/CO2/Diesel gọi hai cột này là
**`nguoiChot` / `ngayChot`** nên ký một bồn thì điền hai cột đó; bảng FM200 và hai bảng
BCC/TCC dùng `nguoiKiemTra` / `ngayKiemTra`.

### Chữ ký là ẢNH chữ ký số của user, không phải cái tên gõ ra

Lấy từ hồ sơ cá nhân (`User.signatureKey` — trang **Tài khoản → Chữ ký số**, đã có sẵn
trong hệ thống và tự đẩy lên S3 khi lưu). Bản ghi chữ ký PCCC lưu `signature_key` **chốt
cứng tại thời điểm ký**, cùng lý do với `signerName`: user đổi hoặc xoá chữ ký về sau thì
bản ký cũ vẫn phải hiện đúng cái đã ký.

Chỉ nhận **S3 key**, không nhận `signatureUrl` dạng base64 của hồ sơ kiểu cũ: một chữ ký
base64 nặng ~20KB, nhân 747 dòng ký một lượt là chép 15MB chuỗi vào DB. Hồ sơ cũ chỉ cần
mở trang Tài khoản lưu lại một lần là có key.

**Chưa có chữ ký thì không ký được.** Chặn ở hai lớp: `preview` trả `hasSignature: false`
nên hộp thoại nhắc **trước** khi bấm và ẩn luôn nút "Xác nhận ký", đồng thời hiện đường
dẫn sang `/account` để thêm; nếu gọi thẳng API thì server trả 409. Lời nhắc nói rõ lý do —
chữ ký ở đây là bằng chứng ai đã đi kiểm tra, ghi mỗi cái tên thì không khác gì gõ tay.

Ảnh phục vụ qua proxy `/api/files/s3?key=…` (đã yêu cầu đăng nhập), **không nhúng base64
vào payload danh sách** — bảng 747 dòng mà mỗi dòng kèm ảnh base64 là payload hàng MB.
Hiển thị bằng `SignatureStamp` (ảnh + tên + ngày) trong khối chi tiết của BCC/TCC và trong
ô chữ ký của tab FCD; bản ký cũ chưa gắn ảnh thì rơi về hiện tên như trước.

### Ảnh chữ ký trong file Excel

Cả ba sheet BCC/TCC/FCD có thêm cột cuối **"Chữ ký"**, ảnh được **neo vào đúng ô** của
từng dòng (ngoài hai cột chữ "Người ký" / "Thời điểm ký" vẫn giữ nguyên). Áp cho **cả**
bản lưu trữ hằng tháng lẫn nút xuất tay trên web.

Ba điểm khiến chỗ này không phải chèn ảnh thẳng tuột:

1. **Mỗi ảnh chỉ nạp vào workbook MỘT LẦN** rồi neo lại nhiều chỗ (`imageIds`). Cả kỳ
   thường chỉ vài người ký; thêm ảnh theo từng dòng thì 747 dòng là 747 bản sao cùng một
   tấm ảnh nằm trong file.
2. **Tải theo key duy nhất**, không theo dòng (`loadSignatureImages`) — nếu không thì 747
   dòng là 747 lượt gọi S3 cho cùng một tấm ảnh.
3. **Giữ đúng tỉ lệ ảnh**: bề rộng tính từ kích thước thật đọc trong khối IHDR của PNG,
   cao cố định 24px, rộng tối đa 96px. Kéo giãn chữ ký cho vừa khung là làm méo chữ ký của
   người ta. Kiểm chứng bằng hai ảnh khác tỉ lệ (240×70 và 120×90) → hai kích thước neo
   khác nhau trong `drawing1.xml`: `82×24` và `32×24` px, đúng tỉ lệ gốc 3.43 và 1.33.

Ảnh hỏng/mất trên S3 **không** làm hỏng cả lần xuất file — bỏ qua ảnh đó, cột chữ ký vẫn
còn tên và thời điểm ký.

Cần chạy khi triển khai:

```bash
npx prisma db execute --file scripts/sql/pccc_signature_image.sql --schema prisma/schema.prisma
```

`POST /api/pccc/signatures/bulk` với `preview: true` **không ghi gì**, chỉ trả số liệu để
hộp thoại nói đúng sự thật (bao nhiêu dòng, cương vị nào, ai ký) — con số này lấy từ
server chứ không đoán ở client. Phạm vi ký = **phạm vi ghi** (mục 4e) giao với bộ lọc
cương vị/tổ máy đang đặt: mức `personal` bị chặn cứng theo mã cương vị của chính mình bất
kể client gửi gì lên; mức quản lý ký được mọi cương vị nên hộp thoại phải nêu rõ số dòng —
với tài khoản quản đốc, không lọc gì là **747 dòng** một lần bấm.

Kỳ đã chốt hoặc chưa tới tháng thì ký cũng bị chặn, dùng chung `periodWriteBlockReason`.

Lưu ý khi đọc code: hộp thoại được mở **hoãn một nhịp** (`setTimeout(…, 0)`) sau khi chọn
mục trong menu. Menu của Radix lúc đóng sẽ trả lại tiêu điểm, và chính cú trả tiêu điểm đó
bị hộp thoại hiểu là "bấm ra ngoài" nên đóng luôn hộp thoại vừa mở — bỏ dòng hoãn này là
bấm "Ký tên" không thấy gì hiện ra.

## 5. Điểm nối cho các module sau (chưa implement)

Quy ước dùng lại: **1 bảng "kỳ" + n bảng "chỉ số trong kỳ" + 1 bảng chữ ký**, chốt
kỳ để chuyển sang chỉ đọc, trường dẫn xuất lưu sẵn cho dashboard.

- **Chi tiêu QDU**: đã có công cụ rời `CongCu_Tinh_Qdd_Qdu_v1_0.zip` — port phần
  tính vào 1 route + 1 trang, kỳ = tháng như PCCC.
- **Hoá chất NH3 / HCl / NaOH hằng ngày**: kỳ = ngày (`label` dạng `2026-08-07`),
  mỗi hoá chất 1 dòng chỉ số + ngưỡng min/max như `pccc_fm200_panels`.
- **Đồng bộ Google Sheet (tuỳ chọn, nhập liệu hiện trường)**: tái dùng nguyên
  khung defect-sync — `docs/n8n-defect-sync/`, `app/api/integrations/n8n/…`, các
  bảng `DefectSync*` (run/batch/seen/outbox) — với Postgres vẫn là nguồn sự thật,
  Sheet chỉ là làn nhập phụ.

## 6. Tự động chuyển kỳ + lưu trữ S3 (bước F — đã làm)

Vòng đời một tháng, không ai phải bấm nút:

| Mốc | Việc xảy ra |
| --- | --- |
| Ngày **cuối tháng** | Xuất Excel kỳ hiện tại → đẩy lên S3 → **rồi mới** chốt kỳ (chuyển chỉ đọc) |
| Ngày **1 tháng sau** | Sinh kỳ mới, bê nguyên số liệu kỳ vừa chốt, xoá ngày/người kiểm tra + chữ ký |
| Sau khi chốt | DB **chỉ giữ 6 kỳ gần nhất**, kỳ cũ hơn bị xoá — file trên S3 vẫn còn |

Ví dụ: 31/08/2026 chốt `T08.2026` và ghi `pccc/archive/2026/PCCC-T08.2026.xlsx`;
01/09/2026 mở `T09.2026`. Chốt `T12.2026` thì DB còn `T07`–`T12`, xoá `T06` trở về trước.

**Bốn điều kiện an toàn** (`lib/pccc-rollover.ts`), vi phạm cái nào cũng là mất dữ liệu thật:

1. **Không chốt khi chưa upload xong.** Upload trước, ghi `archiveKey`, rồi mới đặt
   `isClosed`. Upload lỗi → dừng cả lượt, kỳ vẫn mở, lần chạy sau làm lại. Đã kiểm chứng:
   với S3 sai cấu hình, job trả lỗi `getaddrinfo ENOTFOUND` và kỳ **không** bị chốt.
2. **Không xoá kỳ chưa có bản lưu trữ.** Bộ dọn chỉ đụng kỳ đã `isClosed` **và** có
   `archiveKey`; thiếu thì giữ lại dù quá 6 kỳ, và báo ra ngoài.
3. **Chạy chồng nhau vẫn đúng.** Không dùng advisory lock của Postgres — lock đó bám theo
   *kết nối*, mà Prisma dùng pool nên lệnh mở khoá dễ rơi vào kết nối khác và treo khoá
   vĩnh viễn. Thay vào đó mọi bước để một bên thắng: `updateMany` kèm `isClosed: false`,
   ràng buộc UNIQUE của nhãn kỳ, `deleteMany`.
4. **Chạy lại được và tự bù.** Tắt máy chủ vài tháng thì lần chạy kế tiếp chốt lần lượt
   từng kỳ còn mở rồi sinh bù tới tháng hiện tại.

Mốc thời gian tính theo **giờ Việt Nam** (`lib/pccc-clock.ts` — dùng chung cho lớp nghiệp
vụ và job, tách riêng để hai bên khỏi import vòng), không theo giờ máy chủ: máy chủ chạy
UTC thì 23:30 ngày 31/08 giờ VN vẫn đang là 16:30 ngày 31/08 UTC — lệch múi giờ ở đây là
chốt nhầm tháng.

### Kỳ của tháng chưa tới — không được tồn tại, và không ghi được

Nút **"Sinh kỳ mới"** ngày trước lấy kỳ mới nhất + 1 tháng, **không chặn gì cả**: bấm bao
nhiêu lần thì chạy trước bấy nhiêu tháng. Nó đã đẻ ra `T09.2026` từ 07/08/2026 trong khi
tháng 8 còn chưa hết, khiến trang mặc định mở kỳ tháng 9 và người dùng ghi nhầm vào đó.
Đã bịt cả 5 đường:

1. `POST /api/pccc/periods` **từ chối** sinh kỳ vượt quá tháng hiện tại (409).
2. `periodWriteBlockReason` chặn **ghi và ký** vào kỳ chưa tới, y như kỳ đã chốt — áp cho
   PATCH từng dòng, hai route lưu-theo-lượt (báo lỗi theo dòng) và route chữ ký.
3. `resolvePeriod` khi không truyền nhãn thì lấy **kỳ của tháng hiện tại**, không lấy kỳ
   mới nhất.
4. Trang web mặc định vào kỳ tháng hiện tại; kỳ chưa tới hiện nhãn *"(chưa tới kỳ)"* trong
   ô chọn và huy hiệu **"Chưa tới kỳ — chỉ đọc"**.
5. Bộ dọn DB **không tính kỳ tương lai** vào 6 kỳ giữ lại — để nó chiếm chỗ thì mỗi kỳ
   sinh sớm lại đẩy một tháng thật ra khỏi DB sớm một tháng.

Hệ quả còn lại phải biết: nếu kỳ của tháng hiện tại **đã tồn tại sẵn** trước lúc kỳ trước
được chốt, job **không** sinh lại nó từ kỳ vừa chốt, nên nó không mang theo các sửa đổi
cuối cùng của tháng trước. Job trả về `warnings` nói đúng điều đó thay vì im lặng.

### Ba đường kích hoạt (cùng gọi một job)

- **Tự động lúc mở trang** — `GET /api/pccc/periods` gọi `ensurePcccRollover()`. Nhờ vậy
  hệ thống vẫn sang kỳ đúng hạn *kể cả khi chưa cài bộ hẹn giờ*; chỉ khác là việc chốt rơi
  vào lần đầu có người vào trang của tháng mới thay vì 23:xx đêm cuối tháng. Có chặn tần
  suất 5 phút + đường nhanh nên hầu hết lượt tải trang không chạm tới job.
- **Bộ hẹn giờ** (Task Scheduler / cron / n8n) — để việc chốt rơi đúng đêm cuối tháng:

```bash
npm run pccc:rollover -- --close-now   # 23:xx ngày CUỐI tháng: xuất S3 + chốt kỳ
npm run pccc:rollover                  # 00:xx ngày 01: sinh kỳ mới + dọn DB
npm run pccc:rollover -- --dry-run     # chỉ in ra sẽ làm gì
```

`--close-now` cố tình chỉ chạy được vào ngày cuối tháng: gõ nhầm giữa tháng là khoá mất
bảng đang dùng của cả phân xưởng.

- **Nút "Chuyển kỳ"** trên web (cần `pccc-close-period` mức manage/full) — chạy tay đúng
  job đó khi bộ hẹn giờ lỗi. **Thay cho hai nút "Sinh kỳ mới" + "Chốt kỳ" cũ**: hai việc
  ấy phải đi liền nhau, tách ra chỉ tạo cơ hội làm nửa vời (chốt mà quên sinh, hoặc sinh
  kỳ mới trong khi kỳ cũ chưa được lưu trữ). Nút tự biết hôm nay có phải ngày cuối tháng
  không (mốc do server tính) và hỏi xác nhận kèm đúng danh sách việc sẽ xảy ra.

### File Excel lưu trữ

Key: `pccc/archive/<năm>/PCCC-<kỳ>.xlsx` (đổi được bằng `PCCC_ARCHIVE_S3_PREFIX`).
Nội dung dựng bằng chính `buildPcccWorkbook` của nút xuất tay nên **giữ nguyên bố cục và
tên sheet của file gốc** (`BÌNH CHỮA CHÁY - T07.2026`…), khác hai điểm:

- lấy **toàn bộ** dữ liệu của kỳ, không áp bộ lọc cương vị/tổ máy;
- thêm sheet đầu **"CHỐT KỲ"**: kỳ, thời điểm chốt, ai/cái gì chốt, số bình/tủ/bồn/bảng
  FM200 và số chữ ký. File sống lâu hơn dữ liệu trong DB nên phải tự mang theo bằng chứng.

Nút **Xuất Excel** nay là một danh sách sổ xuống: kỳ đang xem (dựng từ DB, theo bộ lọc
hiện tại) và **12 tháng lưu trữ gần nhất đọc thẳng từ S3** — đây chính là chỗ tra lại
tháng đã bị dọn khỏi DB. File **không bao giờ bị xoá tự động**; muốn dọn thì đặt lifecycle
rule trên bucket.

### Cần làm khi triển khai

DB dev đang lệch pha với `schema.prisma` (mục 4.2) nên cột mới thêm bằng SQL riêng:

```bash
npx prisma db execute --file scripts/sql/pccc_archive.sql --schema prisma/schema.prisma
```

Và **phải điền S3 thật** trong `.env` (`S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY/S3_SECRET_KEY`).
Hiện `.env` còn là placeholder `s3.example.com`; khi thiếu cấu hình, `uploadS3Object` ghi
xuống `.local-storage/` ở môi trường dev nhưng **ném lỗi ở production** — nghĩa là kỳ sẽ
không bao giờ được chốt cho tới khi có S3 thật. Đó là hành vi mong muốn, nhưng phải biết
để không tưởng job hỏng.
