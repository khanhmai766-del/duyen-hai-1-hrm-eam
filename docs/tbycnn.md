# Module TBYCNN — Thiết bị yêu cầu nghiêm ngặt về ATLĐ

Đưa ứng dụng rời `QuanLyThietBi_project` (1 file `QuanLyThietBi.html` + `data.js`,
lưu bằng `localStorage`) về hệ thống này: **Postgres là nguồn sự thật duy nhất**,
dùng lại NextAuth/RBAC, AuditLog và exceljs như module PCCC.

Trạng thái: **pha 1 đã xong** — schema, import 709 thiết bị, API `/api/tbycnn/*`,
trang `/tbycnn`, xuất Excel phía server, phân quyền `tbycnn-view` / `tbycnn-manage`.
Đã bổ sung sau đó: **thêm thiết bị trên giao diện** sau một công tắc cấp kỳ
(`tbycnn-control-item-creation`, xem mục 4b) và xuất PDF.
**Pha 2 chưa làm**: chốt sổ theo kỳ + xem kỳ đã chốt, nút xoá thiết bị trên giao diện
(API đã có).

## 1. Mô hình dữ liệu

| Bảng | Nội dung |
| --- | --- |
| `tbycnn_periods` | kỳ (tháng), `label` = `2026-09`, giữ đúng định dạng kỳ của bản cũ |
| `tbycnn_equipments` | 1 dòng = 1 thiết bị trong kỳ, khoá upsert `(periodId, sourceId)` |

Hai điểm khác bản cũ, có chủ đích:

- **Ngày kiểm định lưu HAI trường.** Dữ liệu gốc có ~45% ô không phải ngày hợp lệ
  (`-`, `Không có`, `Tem bị mờ`, `06/26`…). `kdGanNhatText` / `kdTiepTheoText` giữ
  **nguyên văn** người dùng nhập; `kdGanNhat` / `kdTiepTheo` là bản đã parse, chỉ
  dùng để lọc và đếm quá hạn. Không parse được thì ngày = `null`, chữ vẫn còn.
  Giao diện hiển thị qua `displayKdDate()` — ưu tiên ngày, không có thì trả lại chữ.
- **Bỏ trường `nhomPhu`.** Cả 709 dòng nguồn đều rỗng; giữ lại chỉ làm rối bảng.

Cương vị quản lý được chuẩn hoá **ngay lúc nạp** theo `lib/position-catalog.ts`
giống PCCC: `khuVuc` giữ nhãn gốc có hậu tố tổ máy (`Máy nghiền S1` — dùng để nhóm
hiển thị), `cuongVi` là nhãn chuẩn không hậu tố, `cuongViCode` là `PositionCode`
(khoá phân quyền), `machine` = `S1|S2|COMMON`. Cả 21 cương vị của file gốc khớp
danh mục, không có giá trị lạ.

`deviceSeq` (trỏ `EquipmentNode.seq`) là tham chiếu **mềm, không FK** — chưa map,
để dành như bên PCCC.

## 2. Nạp dữ liệu

Nguồn: `scripts/data/tbycnn-equipment.json` — chính là `equipment_data.json` của app
cũ, tức bản **đã** chạy qua 11 migration làm sạch của nó (sửa số La Mã, chuẩn hoá tên
danh mục/cương vị, tách `tinhTrang` thành hai ô số…). Script import **không** lặp lại
các bước đó, chỉ chuyển kiểu và chuẩn hoá cương vị.

```bash
npm run import:tbycnn -- --dry-run     # xem trước, không ghi
npm run import:tbycnn                  # nạp vào kỳ của tháng hiện tại
npm run import:tbycnn -- --period 2026-09 --prune
npm run check:tbycnn                   # soát số liệu đã nạp (không cần đăng nhập)
```

Idempotent theo `(kỳ, sourceId)`; không xoá gì trừ khi có `--prune`.

Tạo bảng trên DB mới: **không** dùng `npm run db:push` (DB dev còn bảng ngoài schema
của nhánh khác, push sẽ đòi drop). Chạy SQL đã lọc sẵn:

```bash
npx prisma db execute --file prisma/sql/tbycnn-init.sql --schema prisma/schema.prisma
```

## 3. Quy tắc nghiệp vụ (`lib/tbycnn.ts` — client và server dùng chung)

| Quy tắc | Nội dung |
| --- | --- |
| `computeTinhTrang` | Tình trạng **suy ra** từ `soLuongKhaDung` / `soLuongKhongKhaDung`, không lưu chuỗi. Một dòng `soLuong > 1` có thể vừa có cái tốt vừa có cái hỏng → `"3 khả dụng, 2 không khả dụng"`. |
| `statusMatch` | Lọc theo tình trạng **không** so khớp nguyên văn: lọc "Khả dụng" bắt cả dòng hỗn hợp, nên dòng hỗn hợp xuất hiện ở cả hai kết quả lọc. |
| `kdStatus` | `overdue` / `soon` (≤ 90 ngày) / `ok`; không có ngày hợp lệ → `null` ("chưa có hạn"). |
| `computeDefaultKdTiepTheo` | Bỏ trống "KĐ tiếp theo" → tự tính = KĐ gần nhất + chu kỳ thử tính bằng **THÁNG**. Cuối tháng thì **kẹp** về ngày cuối tháng đích (31/01 + 1 tháng = 28/02, năm nhuận 29/02) chứ không để `Date` cuộn sang 03/03. Thiếu dữ liệu thì để trống, **không** ghi đè giá trị đặc biệt như "Không có". |
| `TBYCNN_EDITABLE_ON_EDIT` | Chỉ nhóm "vận hành" được sửa khi thiết bị đã có; thông tin gốc bị khoá. `maHieu`/`kks` cho bổ sung nếu đang trống. |
| `canDeleteEquipment` | Thiết bị gốc (`sourceId != null`) **không bao giờ** xoá được; thiết bị tự thêm chỉ xoá được trong 30 ngày. |

Quy tắc khoá trường và giới hạn xoá được **cưỡng chế ở API**, không chỉ ở giao diện —
người dùng gọi thẳng route được.

### Chu kỳ thử tính bằng THÁNG (đổi 2026-09-07)

`chuKyThu` trước đây là **năm**; hồ sơ có thiết bị chu kỳ 6 và 18 tháng nên đơn vị năm
không diễn tả được. Đổi bằng `prisma/manual/convert-tbycnn-chu-ky-thu-to-months.sql`
(nhân 12 — dữ liệu nguồn chỉ có 1/2/3 năm nên chính xác tuyệt đối). Tệp SQL **được ăn cả
ngã về không**: mệnh đề `NOT EXISTS (… chuKyThu > 6)` chốt điều kiện "cả bảng còn theo
năm", nên chạy lại lần hai không đổi dòng nào và không thể có trạng thái nửa năm nửa tháng.

Đổi kèm: nhãn cột ở bảng (`Chu kỳ (tháng)`), file Excel và bản in PDF (`Chu kỳ thử
(tháng)`), và `scripts/import-tbycnn.ts` (tệp nguồn vẫn ghi năm → nhân 12 lúc nạp, chạy
lại script không kéo dữ liệu về đơn vị cũ).

Trên biểu mẫu thêm thiết bị: **Kiểm định gần nhất** là ô lịch (`<input type="date">`,
đổi qua lại `yyyy-mm-dd` ↔ `dd/mm/yyyy` ngay trong hộp thoại), **Kiểm định tiếp theo** là
ô **chỉ đọc** hiện bản xem trước — biểu mẫu không gửi `kdTiepTheoText` nên server vẫn là
chỗ tính duy nhất. Ô chữ tự do cho các giá trị như "Tem bị mờ" chỉ còn ở chế độ **Sửa
bảng** dành cho thiết bị cũ.

## 4. API

| Route | Quyền | Ghi chú |
| --- | --- | --- |
| `GET /api/tbycnn?period=` | `tbycnn-view` ≥ read | Trả **toàn bộ** thiết bị của kỳ một lượt; giao diện lọc/nhóm tại chỗ như bản cũ |
| `POST /api/tbycnn` | phạm vi cương vị + công tắc kỳ | Thêm thiết bị (`sourceId = null`); trả **423** khi công tắc đang khoá |
| `POST /api/tbycnn/periods/[id]/item-creation` | `tbycnn-control-item-creation` ≥ manage | Bật/tắt công tắc thêm thiết bị của một kỳ |
| `PUT /api/tbycnn/[id]` | `tbycnn-manage` ≥ personal | Chỉ nhận trường **có mặt** trong body; bỏ qua mọi trường bị khoá |
| `DELETE /api/tbycnn/[id]` | `tbycnn-manage` ≥ personal | Chỉ thiết bị tự thêm, trong 30 ngày |
| `POST /api/tbycnn/bulk` | phạm vi cương vị | Lưu MỘT LƯỢT các dòng vừa sửa ở chế độ "Sửa bảng" — một transaction, toàn bộ hoặc không gì cả |
| `POST /api/tbycnn/signatures` | phạm vi cương vị | Ký hàng loạt; `preview: true` thì KHÔNG ghi gì, chỉ trả số liệu cho hộp thoại xác nhận |
| `DELETE /api/tbycnn/signatures` | phạm vi cương vị | Huỷ ký một dòng |
| `GET /api/tbycnn/export?period=&cuongViCode=&machine=` | `tbycnn-view` ≥ read | `.xlsx` thật (exceljs), thay bản `.xls` SpreadsheetML viết tay của app cũ |
| `GET /api/tbycnn/export-pdf?period=&cuongViCode=&machine=` | `tbycnn-view` ≥ read | Bản in A4 ngang (pdf-lib), xem mục 5b |

Mọi ô Excel ghi kiểu **chuỗi** kể cả ngày và số — dữ liệu gốc có `06/26`, `Không có`,
`-`; để Excel tự suy kiểu là đổi nghĩa.

Kỳ đã chốt (`isClosed`) chặn mọi ghi ở tầng API, sẵn cho pha 2.

### 4b. Công tắc "Thêm thiết bị" (cấp kỳ)

`TbycnnPeriod.allowItemCreation` — **mặc định khoá**, cùng luật với
`PcccPeriod.allowItemCreation`. Sổ này là danh mục thiết bị theo hồ sơ nhà máy và cũng là
thứ đem đi nộp; mở cửa thêm mới thường trực thì mỗi người thêm một dòng là hỏng bộ chuẩn.

- Cấp quản lý bật trong lúc bổ sung danh mục rồi tắt lại — công tắc nằm trong menu
  **Chỉnh sửa** của trang, dưới một vạch ngăn (hai mục trên tác động lên dòng đang xem,
  công tắc thì tác động lên **cả kỳ và mọi người**).
- Quyền `tbycnn-control-item-creation` chỉ điều khiển **công tắc**; người thêm thiết bị
  vẫn phải qua `resolveTbycnnWriteScope` và đúng cương vị của mình.
- Kỳ mới sinh ra luôn khoá: `lib/tbycnn-rollover.ts` không chép cờ này sang kỳ sau.
- Cột DB thêm bằng `prisma/manual/add-tbycnn-item-creation.sql` (idempotent).

Hộp thoại thêm (`components/tbycnn/TbycnnCreateDialog.tsx`) không cho gõ tự do ba khoá
gộp nhóm — `khuVuc`, `nhom`, và qua đó là `danhMuc`:

- **Cương vị** chọn từ `POSITION_CATALOG` (danh mục chức danh chuẩn của hệ thống) lọc
  theo phạm vi ghi, kèm ô **Tổ máy** riêng chỉ liệt kê tổ máy mà chức danh đó có mặt
  (`item.units`) — đúng khuôn `PcccCreateDialog`.
- **Danh mục** chọn từ đúng các giá trị của **cột "Danh mục"** trên bảng (bản rút gọn,
  hiện 7 giá trị), không phải chuỗi `nhom` có số La Mã.

Trang ghép lại hai khoá trước khi gọi API (`submitCreate`):

- `khuVuc` = **dùng lại đúng chuỗi đang có** của cặp (cương vị, tổ máy) trong kỳ; chưa có
  dòng nào thì mới ghép `"<nhãn> <tổ máy>"`. Ghép mù theo nhãn danh mục là hỏng: hồ sơ gốc
  có 1 ca viết khác danh mục (`Khí Nén – Nhà Dầu` gạch dài ≠ `Khí nén - Nhà dầu`), đủ để
  đẻ ra nhóm thứ hai trông y hệt nhóm cũ.
- `nhom` = chuỗi cũ nếu danh mục đó đã có ở cương vị này; nếu là danh mục mới thì
  `"<số La Mã kế tiếp của cương vị>. <danh mục>"` (`romanOf`, nghịch đảo `extractNhomSo`)
  — số La Mã đánh **riêng theo từng cương vị** nên đó là việc của máy, không hỏi người dùng.
- `tt` = max + 1 trong nhóm; thiếu STT thì dòng mới dồn lên đầu nhóm (xem `TBYCNN_ORDER_BY`).
- `chucDanhQuanLy` và `donViQuanLy` **không có trên biểu mẫu** — cả hai suy được từ ô
  Cương vị. Đơn vị luôn là `TBYCNN_DON_VI_QUAN_LY` = `PXVH1` (709/709 dòng nguồn);
  chức danh chép đúng chữ mà các dòng cùng cương vị đang dùng, vì một số cương vị ghi tắt
  trong sổ (`Trạm bơm tuần hoàn` → `TBTH`, `Trực phụ điện` → `TPĐ`, `XLN hỗn hợp` →
  `XLNHH`), hỏi người dùng là mỗi người gõ một kiểu. `identityData` cũng đặt hai giá trị
  này ở **server** để không dòng nào rỗng khi có chỗ gọi API mà quên gửi.

Đã đối chiếu toàn bộ 709 dòng của kỳ: ghép rồi cho `normalizePosition` tách lại ra đúng
`cuongViCode`/`machine` ở **100%** số dòng.

### Phạm vi ghi / ký theo cương vị

Cùng luật với PCCC (`lib/pccc-service.ts`), cài ở `lib/tbycnn-service.ts`:

- Quyền `tbycnn-manage` quyết định **có được ghi hay không**, KHÔNG quyết định phạm vi.
- Phạm vi luôn bó theo **chức danh đang làm việc** (`cuongViCode`), trừ Quản trị viên và
  cấp quản lý (Quản đốc / Phó QĐ / Kỹ thuật viên / Trưởng ca) thì ghi/ký toàn phân xưởng.
- Cố ý **không** mở "manage/full thì sửa tất cả": mặc định RBAC cho MANAGER/SUPERVISOR/
  TECHNICIAN đều là `manage`, mở cổng đó là ai cũng ký được cả 709 dòng.
- `GET /api/tbycnn` trả kèm cờ `canWrite` từng dòng để giao diện khoá sẵn ô ngoài phạm vi,
  thay vì để người dùng sửa xong mới ăn 403.

### Ký xác nhận

`tbycnn_signatures`: mỗi dòng nhiều nhất MỘT chữ ký hiệu lực (`equipmentId` là khoá duy
nhất) — ký lại là cập nhật chữ ký cũ, không đẻ bản ghi thứ hai.

Chữ ký là **ảnh chữ ký số** trong hồ sơ cá nhân (`User.signatureKey` trên S3), không phải
cái tên gõ ra — chặn cả ở server chứ không chỉ ở hộp thoại. Tên, cương vị và S3 key được
**chốt cứng lúc ký**: người ký đổi tên hoặc thay chữ ký trong hồ sơ về sau thì bản ký cũ
vẫn hiện đúng cái đã ký.

## 5. Giao diện `/tbycnn`

Bảng dùng CHUNG khuôn với PCCC — `PcccTableCard` + các hằng lớp ở
`components/pccc/pccc-table-card.tsx`: thanh công cụ (số dòng / ô tìm kiếm), đầu bảng
xanh EVN có sắp xếp, nút "+" mở chi tiết từng dòng, chân bảng đếm bản ghi + phân trang.
Khác PCCC ở chỗ lọc/sắp xếp/phân trang chạy Ở CLIENT: cả kỳ chỉ 709 dòng, API trả một
lượt nên đổi bộ lọc không phải chờ mạng.

Nút **"Chỉnh sửa"** (bên trái Bộ lọc) gom hai tác vụ của người đi kiểm tra, đúng khuôn
PCCC — hai việc này luôn đi cùng một lượt đi hiện trường:

- **Sửa bảng** — mở khoá các ô "vận hành" (chu kỳ thử, hai mốc kiểm định trong bảng; số
  BBKĐ, đơn vị KĐ, SL khả dụng/không khả dụng, khiếm khuyết, ghi chú trong khối chi tiết).
  Thay đổi giữ trong bản nháp ở client, ô sửa dở tô **vàng**, bấm Lưu mới ghi một lượt.
  Thông tin gốc theo hồ sơ nhà máy vẫn khoá, kể cả khi bảng đang mở.
- **Ký tên** — ký xác nhận toàn bộ dòng thuộc cương vị của mình, giao với bộ lọc đang đặt.
  Hộp thoại lấy số liệu từ SERVER (bản xem trước), cho tick chọn riêng từng dòng, và tự
  tick sẵn phần **chưa ký**.

### 5b. Xuất PDF

Thay nút "Xuất PDF" của bản cũ, vốn chỉ `window.open()` rồi `window.print()` (README bản
cũ mục 6.9). Dựng Ở SERVER bằng `lib/tbycnn-pdf.ts` trên nền `lib/pccc-pdf-kit.ts`:

- **A4 NGANG**, 17 cột (16 cột của bản cũ + cột **Chữ ký xác nhận**), gộp theo
  `cương vị — danh mục La Mã`, đầu bảng vẽ lại ở MỖI trang (bản in đóng thành tập, lật
  giữa chừng phải tra được cột), đánh số `Trang k/n` ở chân mỗi trang bảng.
- **Cùng bộ lọc với nút Excel** (`cuongViCode` + `machine`) để hai nút luôn in ra cùng một
  phạm vi.
- Trình bày cho hội đồng kiểm tra: đầu bảng và dòng nhóm có nền đậm hơn, thân bảng kẻ sọc
  rất nhạt (`ZEBRA_FILL`) để mắt lần theo hàng ngang giữa 17 cột.

**HAI LOẠI CHỮ KÝ, đừng gộp lại:**

| | Ở đâu | Nội dung |
| --- | --- | --- |
| **Chữ ký xác nhận** | cột cuối của TỪNG DÒNG | ảnh chữ ký + họ tên của cương vị quản lý đã ký xác nhận dòng đó (`TbycnnSignature`). Dòng chưa ký để **trống** cho ký tay — in sẵn tên vào dòng chưa kiểm tra là chứng nhận khống. |
| **Người lập biểu** | khối cuối sổ | người TỔNG HỢP và in quyển sổ. **Luôn để trống** cho ký tay. |

Trước 2026-09-07 khối "Người lập biểu" tự đóng chữ ký của người ký xác nhận khi cả phạm vi
in do một người ký — hai vai trò khác hẳn nhau, đóng nhầm là biến người đi kiểm tra thành
người lập biểu. Đã bỏ.

Hai con số phải giữ khi sửa lại bố cục:

1. **Bề rộng 17 cột cộng lại đúng `CONTENT_W` = 762pt** — nay có `COLS_W` tự kiểm ngay lúc
   nạp module và ném lỗi nếu lệch, thay vì để đường kẻ dọc cuối bảng lặng lẽ rơi ra ngoài lề.
2. **`MAX_LINES = 24`.** `wrap()` vượt trần là CẮT chữ và chèn "…", mà mục 6.9 của bản cũ
   nói rõ PDF "luôn in đầy đủ nội dung" — mất chữ ở đây là mất dữ liệu hồ sơ kiểm định.
   Ô dài nhất trong 709 dòng cần 22 dòng (một ô Ghi chú); đo bằng chính phông sẽ in chứ
   không ước lượng theo số ký tự. Đổi bề rộng cột là phải đo lại.

Quy mô thực đo: một cương vị (15 dòng) ra 4 trang; toàn phân xưởng 709 dòng ra 89 trang,
719 KB, dựng mất ~6 giây.

### Năm thẻ KPI vừa là thống kê vừa là bộ lọc

Bấm một thẻ → bảng còn **đúng** chừng ấy dòng; bấm lại thẻ đang bật → bỏ lọc. Ba điều
kiện để việc này không nói dối, đừng phá khi sửa lại:

1. **Thẻ đếm bằng đúng vị từ mà bộ lọc dùng** (`statusMatch` / `kdMatch`), không phải một
   công thức riêng. Hệ quả có chủ đích: một dòng hỗn hợp ("3 khả dụng, 2 không khả dụng")
   được tính vào CẢ HAI thẻ *Khả dụng* và *Có thiết bị hỏng* — nó vừa có cái dùng được
   vừa có cái hỏng, giấu ở thẻ nào cũng sai. Vì vậy tổng năm thẻ KHÔNG bằng 709.
2. **Thẻ tính trên `scoped`, không phải `filtered`** — tức đã lọc cương vị/tổ máy/danh
   mục/tìm kiếm nhưng CHƯA lọc tình trạng và hạn kiểm định. Tính trên `filtered` thì bấm
   "Quá hạn" xong, thẻ "Khả dụng" tụt về số của riêng phần quá hạn, mất điểm tựa để bấm
   sang thẻ khác.
3. **Bấm thẻ luôn reset cả hai ô** tình trạng và hạn kiểm định trước khi đặt ô của mình;
   không reset thì bấm "Quá hạn" trong lúc đang lọc "Khả dụng" ra giao của hai thứ, không
   khớp con số vừa bấm.

Năm ô lọc (cương vị / **tổ máy** / danh mục / tình trạng / hạn kiểm định) gom vào MỘT
nút **"Bộ lọc"** đặt cạnh "Xuất Excel" ở đầu trang, bấm mới sổ bảng chọn — cùng khuôn với
PCCC và Danh mục vật tư. Huy hiệu trên nút đếm số ô đang bật để biết bảng đang bị cắt bớt
mà không phải mở ra xem; ô TÌM KIẾM không tính vào con số đó vì nó nằm ngay trên thanh
công cụ, người dùng luôn nhìn thấy chữ mình vừa gõ.

### Cương vị và tổ máy là HAI chiều tách rời

Theo đúng quy ước của `lib/pccc-position.ts` (mục 1):

- Cột **Cương vị quản lý** hiện `cuongVi` — nhãn CHUẨN theo `lib/position-catalog.ts`,
  không hậu tố tổ máy ("ESP", "Lò phó", "Khí nén - Nhà dầu"). 21 nhãn thô trong file gốc
  gom lại còn **14 chức danh**.
- Cột **Tổ máy** riêng, hiện `machine` = S1 / S2 / Common.
- Ô lọc cương vị lọc theo **`cuongViCode`** (PositionCode) chứ không theo nhãn: đổi cách
  viết nhãn về sau không làm hỏng bộ lọc hay link xuất Excel. Dòng không khớp danh mục
  chức danh (`cuongViCode` null) lấy nhãn gốc làm khoá dự phòng nên vẫn lọc được.
- `GET /api/tbycnn/export` nhận `cuongViCode` + `machine` (không còn `khuVuc`).

Trường `khuVuc` (nhãn thô "ESP S1") vẫn giữ nguyên trong DB và **vẫn là cột đầu + dòng
tiêu đề gộp của file Excel xuất ra** — file đó phải bám đúng bố cục hồ sơ gốc của nhà
máy, đừng đổi theo giao diện.

Nhờ khối chi tiết mà bảng chỉ còn **11 cột** (kể cả nút "+") thay vì 17.
KHÔNG có cột nút sửa từng dòng: sửa đi qua "Chỉnh sửa → Sửa bảng", để hai lối sửa khỏi
tồn tại song song với hai bộ quy tắc phải giữ đồng bộ. Các cột chuyển vào khối chi
tiết: Vị trí, Chức danh quản lý, Đơn vị quản lý, Số lượng, Số BBKĐ, Đơn vị kiểm định,
Thông số kỹ thuật, Khiếm khuyết, Ghi chú và **Chữ ký**.

Khối chi tiết xếp 3 cột, thứ tự có chủ đích chứ không phải liệt kê ngẫu nhiên:

```
Vị trí            │ Đơn vị quản lý  │ Số lượng
Đơn vị kiểm định  │ Không khả dụng  │ Khả dụng
Số BBKĐ           │ Chữ ký (2 cột)
Thông số kỹ thuật (cả hàng)
Khiếm khuyết (2 cột)               │ Ghi chú
```

- **Số lượng** đứng ngay TRÊN *Khả dụng* (cùng cột 3) để soi nhanh ràng buộc
  khả dụng + không khả dụng = số lượng mà server kiểm khi lưu.
- **Số BBKĐ và Chữ ký** cùng hàng: cùng là dấu vết xác nhận của lượt kiểm định — số biên
  bản do đơn vị kiểm định cấp, chữ ký do cương vị phụ trách đóng sau khi đi kiểm tra. Cột `Tên TBYCNN` đóng băng khi cuộn ngang (vai trò của
"Mã thiết bị" bên PCCC — mất nó thì cuộn xong không biết đang đọc dòng nào).

**Đã BỎ dòng tiêu đề gộp theo danh mục** của bản cũ. Có phân trang và sắp xếp thì dòng
gộp không còn đúng (mỗi trang cắt ngang một nhóm); danh mục nay là MỘT CỘT sắp xếp và
lọc được, tra cứu nhanh hơn hẳn cách cuộn tìm khối.

Hai chi tiết dễ làm sai khi sửa lại bảng:

- **Ô trống luôn xuống cuối** khi sắp xếp, bất kể chiều: đảo chúng lên đầu thì sắp giảm
  dần chỉ toàn dòng chưa nhập, không đọc được gì.
- **Sắp xếp mặc định là thứ tự hồ sơ gốc** (cương vị → số La Mã → STT) do server trả
  sẵn, không phải một cột nào cả — khoá `__source__`. Nút "Về thứ tự hồ sơ gốc" đưa lại
  trạng thái này sau khi người dùng đã bấm sắp xếp theo cột.

Bố cục mobile do CSS chung `.pccc-mobile-table` lo: mỗi dòng thành một thẻ, cột 1 là nút
"+", cột 2 làm tiêu đề, cột 3–4 làm dòng phụ, còn lại ẩn. Vì vậy **thứ tự cột đầu bảng
phải giữ nguyên**: nút "+" → Tên TBYCNN → Cương vị → Danh mục. Cột Tổ máy cố ý đặt ở vị
trí 5 (ngay sau Danh mục) để trên điện thoại nó rơi vào phần bị ẩn — hai dòng phụ của thẻ
dành cho cương vị và danh mục.

## 5c. Ba bảng dụng cụ ATLĐ tách riêng

Sổ này thực chất chứa HAI loại hồ sơ: thiết bị áp lực / nâng hạ (KKS, số BBKĐ, đơn vị
kiểm định) và **dụng cụ ATLĐ** (kết quả thử tải, đo cách điện). Hai loại có biểu mẫu khác
hẳn nhau nên để chung một bảng thì dòng nào cũng thiếu quá nửa số cột của biểu mẫu nó
thuộc về, mà năm thẻ thống kê lại gộp hai thứ không so sánh được với nhau.

Vì vậy trang có **tầng chọn bảng**: `Sổ chính · Thang di động · Dây đai an toàn · Dụng cụ
điện cầm tay`. Cấu hình ở `TBYCNN_TOOL_TABS` (lib/tbycnn.ts), khoá phân biệt là `danhMuc`
— không thêm cột phân loại nào.

- **Một dòng chỉ thuộc ĐÚNG MỘT tab.** Sổ chính LOẠI ba danh mục dụng cụ
  (`isTbycnnToolDanhMuc`), nên không có chuyện đếm hai lần.
- Đổi tab là đổi cả bộ dòng, **bộ cột**, năm thẻ thống kê và **phạm vi nút Xuất File**
  (`?bang=` của cả hai route xuất). Bấm Xuất File ở tab Thang mà nhận về cả quyển sổ thì
  nút đó nói dối.
- Ô lọc **Danh mục** ẩn ở ba tab dụng cụ: mỗi bảng đúng một danh mục nên ô đó chỉ có một
  lựa chọn. Ngược lại, hộp **Thêm thiết bị** vẫn liệt kê đủ danh mục của cả sổ
  (`danhMucListForCreate`) — lấy theo tab thì đứng ở sổ chính không bao giờ thêm được
  một cái thang.

### Cột riêng, lưu thành cột thật

Bảy cột thêm bằng `prisma/manual/add-tbycnn-tool-columns.sql` (additive, idempotent):
`taiTrongThuKg`, `thoiGianThuPhut`, `tinhTrangSuDung`, `kiemTraBangMat`, `cachDienMOhm`,
`ketQuaThu`, `nghiemThuSauSuaChua`.

- **`tinhTrangSuDung` ("Qua sử dụng" / "Dây mới") KHÁC cột `tinhTrang`** suy từ
  `soLuongKhaDung`/`soLuongKhongKhaDung`. Đừng gộp hai thứ này.
- `ketQuaThu` dùng chung cho cột "Kết quả" (thang, dây đai) và "Đánh giá" (dụng cụ điện) —
  cùng một ý nghĩa.
- Ba cột số phải có nhánh riêng trong `sortValue`, nếu không sắp xếp theo chuỗi và 1050
  đứng trước 600.

Trước đó các giá trị này bị ghép chuỗi vào `thongSoKyThuat` / `ghiChu`: không lọc, không
sắp xếp, không đối chiếu được với bản giấy.

### Bảy cột mới sửa được ở "Sửa bảng"

Cả bảy đều nằm trong `TBYCNN_EDITABLE_ON_EDIT`: chúng là số liệu ghi lại MỖI LƯỢT đi kiểm
tra (thử tải, đo cách điện, kết quả), không phải thông tin gốc theo hồ sơ nhà máy.

**Đổi `ketQuaThu` thì server tự chỉnh `soLuongKhaDung`/`soLuongKhongKhaDung`** cho khớp
(`suyKhaDungTuKetQua`, cài ở CẢ `PUT /api/tbycnn/[id]` lẫn `POST /api/tbycnn/bulk`). Hai
chỗ này nói cùng một sự thật — dụng cụ còn dùng được hay không — nên để chúng tự do lệch
nhau thì huy hiệu Tình trạng trên bảng, năm thẻ thống kê và con số "đã kiểm tra N đạt"
trên biên bản sẽ nói ba kiểu khác nhau về cùng một cái thang.

Hai ngoại lệ KHÔNG suy, giữ nguyên giá trị đang có:

- Người dùng tự đặt `soLuongKhaDung`/`soLuongKhongKhaDung` trong CÙNG lượt sửa — giá trị
  gõ tay luôn thắng.
- Dòng có `soLuong` khác 1: một chữ "Đạt" không chia được cho nhiều cái.

### Bản in của ba bảng

`colsFor(tab)` ở `lib/tbycnn-pdf.ts` trả bộ cột theo bảng; `fitWidths` kéo bề rộng cho tổng
bằng đúng `CONTENT_W` (762pt) và **ném lỗi nếu lệch** — cùng chốt kiểm với `MAIN_COLS`.
Chênh lệch sau khi làm tròn dồn vào cột rộng nhất, không rải vào cột hẹp (TT, Chu kỳ) vì
nhìn ra ngay là bảng bị lệch.

Đã **đo lại** số dòng gói chữ như mục 5b yêu cầu: ô dài nhất của cả ba bảng cần **5 dòng**
(cột Ghi chú của bảng dụng cụ điện), còn xa trần `MAX_LINES = 24`. Đổi bề rộng cột là phải
đo lại.

## 5d. Biên bản kiểm tra định kỳ (BBKT) — xuất Word

Ba bảng dụng cụ, ba biểu mẫu biên bản riêng, bám đúng bản mẫu của phân xưởng:

| Bảng | Mẫu | Đặc thù |
| --- | --- | --- |
| Thang di động | `templates/bbkt-thang-di-dong.docx` | thử tải tĩnh; phụ lục 10 cột |
| Dây đeo an toàn | `templates/bbkt-day-dai-an-toan.docx` | thử tải tĩnh + động; 9 cột; có trang ảnh |
| Dụng cụ điện cầm tay | `templates/bbkt-dung-cu-dien-cam-tay.docx` | đo cách điện; 11 cột, đầu bảng HAI TẦNG; có trang ảnh |

Khuôn giống hệt BBNT/BBTHVT của module vật tư: `scripts/build-tbycnn-bbkt-templates.mjs`
sinh mẫu `.docx` có token `{{...}}`, `lib/tbycnn-bbkt-doc.ts` điền bằng docxtemplater,
`POST /api/tbycnn/export-bbkt` trả tệp về. Phần chữ đổi theo đợt (thành phần kiểm tra,
giờ, địa điểm) hỏi qua hộp thoại, điền sẵn theo `BBKT_FORMS` ở `lib/tbycnn-bbkt.ts`.

Những điểm dễ làm sai khi sửa lại:

- **Bảng phụ lục KHÔNG chép cứng** — dựng lại từ sổ ở mỗi lượt xuất. Đó là cả mục đích:
  sửa số liệu trên web rồi xuất lại là biên bản khớp ngay.
- **Mỗi tệp có HAI section**: phần chữ khổ dọc, phụ lục khổ ngang. Nhét chung một section
  dọc thì bảng 10-11 cột bị bóp lại không đọc nổi. Section đầu khai trong `<w:p><w:pPr>`
  cuối phần chữ, section cuối khai ở cuối `<w:body>`.
- **Thành phần kiểm tra nở theo HÀNG BẢNG**: hai thẻ `{{#thanhPhan}}` / `{{/thanhPhan}}`
  đặt ở hai ô KHÁC NHAU của cùng một hàng, docxtemplater nhận ra đó là vòng lặp hàng.
  Gom cả hai vào một ô thì 4 người dồn vào một dòng.
- **`POST` chứ không phải `GET`** như hai nút xuất kia: biên bản mang theo cả danh sách
  thành phần kiểm tra, nhét vào query string vừa dài vừa bẩn nhật ký. Dùng `apiDownloadPost`.
- **Không có bước xem trước.** Đã thử dựng bản nháp .docx ngay trong trình duyệt bằng
  `docx-preview` (nạp động) nhưng chunk không tải được ở môi trường dev, nên đã gỡ cả thư
  viện lẫn luồng hai bước — nút bấm là tải thẳng. Muốn làm lại thì hướng khả dĩ là dựng
  bản xem trước bằng PDF ở SERVER trên nền `lib/pccc-pdf-kit.ts` (đã dùng cho sổ chính),
  chứ đừng vẽ lại một bản HTML riêng: sửa mẫu Word mà quên sửa bản HTML là người dùng
  duyệt một đằng, nộp một nẻo.
- **Biên bản không nhận bộ lọc cương vị/tổ máy**: đây là văn bản pháp lý cho TOÀN đợt
  kiểm tra, xuất một phần theo bộ lọc đang đặt là ra biên bản thiếu thiết bị.
- **Cột Ghi chú của bảng dụng cụ điện được IN THẲNG vào biên bản.** Đừng dùng nó để ghi
  chú nội bộ của lượt nhập liệu — đã một lần lọt câu "KĐ gần nhất suy ra từ…" lên văn bản
  nộp lên, phải gỡ ra.
- **Số biên bản và ngày ban hành để TRỐNG** theo bản mẫu (`Số:        /VH1`,
  "ngày …… tháng …… năm ………") cho văn thư cấp số khi phát hành.

Hai chỗ **cố ý sửa khác bản mẫu** vì đây là văn bản báo cáo — muốn giữ nguyên lỗi gốc thì
sửa hằng trong script dựng mẫu:

- "KIỂM TRA ĐÌNH KỲ" → "KIỂM TRA **ĐỊNH** KỲ" (bản thang và dây đai gõ nhầm)
- "KT. TRƯỞNG **PHONG** KTAT" → "KT. TRƯỞNG **PHÒNG** KTAT" (cả ba bản gõ nhầm)

## 6. Việc còn để ngỏ (pha 2)

- Chốt sổ theo kỳ + màn hình xem kỳ đã chốt (`TbycnnPeriod.isClosed` đã sẵn ở schema
  và API; thiếu route `rollover` và bộ chọn kỳ trên giao diện).
- Nút **xoá** thiết bị trên giao diện — API đã có, chưa gắn nút (thêm thì đã xong, mục 4b).
- Xuất PDF khổ A4 ngang có khối ký tên (bản cũ in bằng `window.print()`); nếu làm nên
  dùng `lib/pccc-pdf-kit.ts` thay vì in từ trình duyệt.
- Map `deviceSeq` sang cây thiết bị `EquipmentNode`.
