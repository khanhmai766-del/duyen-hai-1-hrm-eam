# Tiện ích Cấp số PCT NKVH – PXVH1

Lấy số PCT **nội bộ điện tử** từ sổ PCT của PXVH1 (duyenhai1.vn) ngay trên trang phiếu NKVH,
thay cho việc chạy qua duyenhai1.vn lấy số rồi quay lại NKVH gõ tay.

Tiện ích này tách riêng khỏi tiện ích *Đồng bộ QLVT & LIMS* và chỉ xin quyền vào NKVH và duyenhai1.vn.
Phiếu nhà thầu (PCT giấy) vẫn lấy số trên sổ duyenhai1.vn như cũ.

## Luồng sử dụng

1. Trên NKVH: tạo PCT từ ĐKCT, mở phiếu ở bước **B1**. NKVH đã điền sẵn nội dung theo ĐKCT.
2. Dưới ô **Số phiếu** có dòng *Sổ PXVH1*. Bấm **Lấy số PCT**, chọn **Tổ máy** (đã chọn sẵn theo
   địa điểm hoặc mã KKS) và **Cương vị**, rồi bấm **Lấy số & điền**.
3. Sổ PXVH1 cấp số tiếp theo của đúng sổ Cơ/Điện và ghi phiếu vào sổ kèm liên kết NKVH.
   Tiện ích điền số vào ô Số phiếu.
4. VHV kiểm tra rồi **tự bấm Lưu trên NKVH**. Tiện ích không bao giờ tự lưu.
5. Nếu sửa nội dung trên NKVH hoặc khai thêm CHTT, phạm vi…, bấm **Đồng bộ về sổ** (ở bước B1).

CHTT, số nhân viên hoặc SYC còn thiếu thì phiếu hiện nhãn **Cần bổ sung** trên sổ. Khi sửa phiếu
trên sổ, các mục này bắt buộc khai đủ như phiếu tạo tay.

**Không gõ tay số vào NKVH nữa.** Số gõ tay thì sổ không biết là đã dùng, và phiếu giấy lấy sau có
thể bị cấp trùng số.

## Quy tắc số

- Tiện ích dùng chung đường giữ số với nút "Lấy số PCT" trên sổ (`reservePermitNumber`), nên phiếu
  giấy lấy sau luôn nhảy qua số đã cấp cho NKVH.
- Một phiếu NKVH (`id_pct` trên địa chỉ trang) chỉ nhận **một** số. Bấm lại hoặc tải lại trang thì
  nhận lại đúng số cũ. Hàng rào chống trùng là khoá dãy số của sổ; `nkvhPctId` không có chỉ mục duy nhất.
- Ô Số phiếu trên NKVH đã có chữ thì tiện ích không ghi đè.
- Đơn vị công tác trên NKVH là đơn vị ngoài (mã dạng UUID, ví dụ *Thiết bị Sài Gòn*) thì tiện ích từ
  chối lấy số.

## Phiếu ra sai: báo hủy về sổ, số bị bỏ

Mở trang phiếu đã hủy trên NKVH → thanh công cụ hiện **Báo hủy về sổ**. Phiếu trên sổ chuyển Hủy, lý
do ghi "Hủy trên NKVH: <lý do NKVH>". Trang đã hủy không bao giờ hiện Lấy số hay Đồng bộ.

**Số đã hủy bị bỏ luôn, không cấp lại** — cho cả sổ (phiếu giấy lẫn điện tử). Phiếu tạo lại trên NKVH
bấm Lấy số PCT như mọi phiếu khác và nhận số tiếp theo.

Trang đã hủy nhận ra qua dòng `<span style="color:red">Phiếu đã hủy. Lý do: …</span>` phía trên ô Số
phiếu. Trên trang đã ký/đã hủy, CHTT in thành chữ (`1052 - Nguyễn Quốc Thái`) thay cho ô chọn; tiện ích
đọc chữ của ô khi không có ô chọn.

## Cách tiện ích đọc trang NKVH

NKVH là ứng dụng JSF/PrimeFaces, không có API. Tiện ích đọc DOM của trang đang mở:

| Dữ liệu | Cách tìm |
| --- | --- |
| Số phiếu | `#formContent:txtSoPhieu` (id do lập trình viên NKVH đặt, ổn định) |
| Phân loại | radio `name="formContent:city2"` → `PLCT.PL.001/002/003` |
| Chuyên môn (T-C-N-H) | các ô tick trong `#formContent:pngLoaiPhieu` |
| Thời gian | `#formContent:id_endDateKH_input` và ô lịch cùng hàng |
| Số ĐKCT, Đơn vị công tác, CHTT, Lãnh đạo, Số NV, Người cấp | theo **nhãn chữ** của ô bên trái |
| Địa điểm, Nội dung, Phạm vi | ô `textarea` đầu tiên sau dòng nhãn |

- Id tự sinh dạng `j_idtNNN` **khác nhau** giữa sổ Điện và sổ T-C-N-H, và có thể đổi khi NKVH sửa
  trang, nên không bao giờ dùng. Nhãn được so sau khi bỏ dấu và đổi `đ`→`d`.
- Các ô nằm trong hộp thoại (`.ui-dialog`, ví dụ hộp chọn nhân viên cũng có nhãn "Đơn vị công tác:") bị bỏ qua.
- Trang chỉ vẽ nội dung của bước đang xem, nên lấy số và đồng bộ chỉ chạy ở **B1**.
- Khi chuyển bước, PrimeFaces vẽ lại `formContent`; thanh công cụ được gắn lại qua MutationObserver.

## Cài đặt thử

1. `chrome://extensions` → bật **Developer mode** → **Load unpacked** → chọn thư mục `chrome-extension/nkvh-pct`.
2. Đăng nhập duyenhai1.vn trên cùng trình duyệt.
3. Bấm biểu tượng tiện ích để chọn sổ lấy số: **localhost:3030** khi thử (không tốn số thật),
   **duyenhai1.vn** khi dùng chính thức.

Service worker gọi API `/api/work-permits/nkvh-claim` kèm cookie đăng nhập duyenhai1.vn của trình
duyệt, dựa vào quyền host để cookie SameSite=Lax được gửi. Nếu báo "Chưa đăng nhập" dù đã đăng nhập,
kiểm tra điểm này trước.

## Đóng gói và phát hành

- `node chrome-extension/scripts/package-nkvh-pct.mjs` → `chrome-extension/dist/nkvh-pct-store-v<version>.zip`.
  Bản trong gói đã bỏ quyền localhost, nên ô chọn máy chủ trong cửa sổ tiện ích chỉ còn duyenhai1.vn.
- **Thêm tệp JS mới thì phải thêm vào danh sách `FILES` trong kịch bản**, kẻo gói nộp kho thiếu tệp.
- Nội dung nộp kho Edge Add-ons: `chrome-extension/store-listing/nkvh-pct/`.
  Logo 300×300: `chrome-extension/store-assets/nkvh-pct/`.
  Trang chính sách: `app/public/nkvh-pct-privacy`.

## Kiểm tra phía server

`npx tsx scripts/verify/thu-nkvh-claim.ts` chạy thử lấy số, bấm lại, đồng bộ và phiếu giấy lấy sau
trong một giao dịch rồi hoàn tác. Không để lại dữ liệu.
