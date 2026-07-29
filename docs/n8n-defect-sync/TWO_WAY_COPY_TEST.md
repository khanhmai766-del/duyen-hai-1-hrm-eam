# Kiểm thử ghi ngược khiếm khuyết trên Sheet bản sao

## Phạm vi an toàn

Workflow tối ưu `workflow-two-way-batch-copy-localhost.json` chỉ chứa hai
Spreadsheet ID bản sao:

- Cơ: `17Jn2j18UOqfY-1rj65HLfYUtBD9euYFkagkaorjnpYo`, sheet ID `1173248266`.
- Điện: `1x-EqgwKHCshEgXQVo7RrmK7Wqecpo7F7-czDS_ZqYqo`, sheet ID `434218714`.

Không thay hai ID này bằng ID production trong giai đoạn thử nghiệm. Workflow mặc định
không active và Schedule Trigger cũng bị tắt.

## Chuẩn bị localhost

0. Trước khi kiểm thử ghi ngược, import và chạy một lần
   `workflow-pull-copy-localhost.json` để database localhost có cùng snapshot với
   hai Sheet bản sao. Workflow pull này mặc định inactive và chỉ gọi
   `http://127.0.0.1:3000`.
1. Chạy các SQL mới trong `prisma/manual`:

   - `add-defect-common-sub-unit.sql`
   - `add-defect-reminder-log.sql`
   - `add-defect-two-way-sync-setting.sql`
   - `add-defect-request-sequence.sql`
   - `migrate-defect-request-sequence-by-type.sql` nếu database đã từng dùng bộ
     đếm chỉ theo năm
   - `add-defect-sync-outbox.sql`

2. Đặt `N8N_DEFECT_TWO_WAY_SYNC_TOKEN` trong `.env`. Header Auth của n8n phải gửi
   `Authorization: Bearer <token-cùng-giá-trị>`.
3. Chạy website tại cổng 3000. n8n local chạy trực tiếp bằng Node và workflow gọi
   `http://127.0.0.1:3000`.
4. Đảm bảo Google Sheets credential trong n8n có quyền sửa hai bản sao.
5. Tắt workflow ghi ngược cũ trước khi import
   `workflow-two-way-batch-copy-localhost.json`. Chỉ được để một workflow lấy
   hàng đợi ghi ngược.
6. Import workflow mới và giữ nguyên trạng thái inactive trong lúc chạy thử thủ
   công.

## Cơ chế xử lý theo lô

- Mỗi lần chạy claim tối đa 50 sự kiện và dùng khóa độc quyền. Nếu lượt trước
  chưa ACK xong, lượt lịch kế tiếp nhận danh sách rỗng thay vì chạy chồng.
- Các sự kiện được gom theo Sheet Cơ và Sheet Điện. Vì vậy một lượt chỉ đọc toàn
  bộ vùng `A6:O` tối đa hai lần, thay vì đọc lại cho từng phiếu.
- Backend lập kế hoạch tuần tự trên một ảnh chụp Sheet trong bộ nhớ. Nhiều phiếu
  tạo mới trong cùng lô không thể chọn trùng một hàng trống.
- Mỗi Sheet chỉ gọi một `values:batchUpdate`, sau đó ACK toàn bộ sự kiện của
  Sheet đó.
- Nếu Google Sheets hoặc bước lập kế hoạch lỗi, lô không được ACK. Backend thu
  hồi sự kiện `PROCESSING` sau 15 phút để chạy lại an toàn.

Khi chạy thử, số item sau node `Gom sự kiện theo Sheet` phải tối đa là 2 dù hàng
đợi có hàng chục sự kiện. Các node đọc, lập kế hoạch, ghi và ACK cũng chỉ chạy
tối đa hai item.

### Credential cho workflow pull bản sao

- Các node Google Sheets dùng cùng credential Google Sheets OAuth2 đã cấp quyền
  trên hai bản sao.
- Các node HTTP dùng Header Auth:
  `Authorization: Bearer <N8N_DEFECT_SYNC_TOKEN>`. Trong local, nếu chưa đặt
  token pull riêng, backend cho phép tạm dùng
  `N8N_DEFECT_TWO_WAY_SYNC_TOKEN`.
- Chạy node `Chạy thủ công` và chỉ tiếp tục khi node `Hoàn tất run` trả
  `SUCCESS`.
- Hai biến local phải trỏ đúng bản sao:

  - `N8N_DEFECT_CO_SPREADSHEET_ID=17Jn2j18UOqfY-1rj65HLfYUtBD9euYFkagkaorjnpYo`
  - `N8N_DEFECT_DIEN_SPREADSHEET_ID=1x-EqgwKHCshEgXQVo7RrmK7Wqecpo7F7-czDS_ZqYqo`

Production phải bỏ hai override này để backend quay về khóa cứng hai Sheet
chính thức.

## Thứ tự kiểm thử

1. Bật cờ hai chiều trên localhost.
2. Xác nhận số kế tiếp của Cơ và Điện theo từng Sheet; hai loại dùng hai dãy STT
   độc lập nhưng đều reset về 1 khi sang năm mới.
3. Tạo một phiếu Cơ có ngày phát hiện trong năm hiện tại.
4. Chạy workflow thủ công một lần và kiểm tra đúng Sheet Cơ có đúng một hàng mới.
5. Chạy lại workflow khi hàng đợi rỗng; Sheet không được thay đổi.
6. Sửa phiếu, chạy workflow và kiểm tra đúng hàng gốc được cập nhật.
7. Bấm nhắc lại, chạy workflow:

   - chỉ cột H của hàng gốc được cập nhật;
   - dòng đầu có dạng `Số lần nhắc lại: 1`, mỗi lần nhắc nằm trên một dòng riêng bên dưới;
   - nhắc nhiều lần phải nối đủ lịch sử theo thứ tự;
   - không copy hoặc chèn thêm bất kỳ hàng nào.

8. Chạy lại cùng event sau tình huống giả lập mất ACK; nội dung cột H không được
   lặp và Sheet không được thêm hàng.
9. Lặp lại toàn bộ với phiếu Điện.
10. Tạo đồng thời 10–20 phiếu thử, chạy workflow một lần và xác nhận:

    - tất cả sự kiện được ACK;
    - mỗi phiếu chỉ xuất hiện một lần;
    - không có hai phiếu dùng chung một hàng;
    - thời gian không còn tăng tuyến tính do đọc toàn bộ Sheet cho từng phiếu.

## Chuyển sang production

Chỉ import `workflow-two-way-batch-production.json` sau khi backend chứa các API
`outbox/batch/plan`, `outbox/batch/ack` và `outbox/batch/fail` đã được triển khai
lên server. Workflow production được import ở trạng thái chưa active; chọn lại
hai credential rồi chạy thử thủ công trước khi bật lịch mỗi phút. Không bật lại
workflow ghi từng sự kiện cũ.

## Điều kiện dừng

Dừng thử nghiệm và không ACK event nếu:

- tìm thấy nhiều hơn một hàng gốc cùng số yêu cầu trong đúng Sheet đích;
- không tìm thấy hàng gốc cho sự kiện sửa/nhắc;
- tên tab không phải `DH1`;
- Google trả lỗi quyền, quota hoặc validation;
- Sheet đích không phải một trong hai ID bản sao nêu trên.

Event ở trạng thái `PROCESSING` sẽ được backend thu hồi sau 15 phút và retry. Không
tạo lại phiếu trên website để xử lý lỗi tích hợp.
