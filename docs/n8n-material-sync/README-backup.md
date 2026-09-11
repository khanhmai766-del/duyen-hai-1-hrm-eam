# Đồng bộ dự phòng mỗi giờ

File đích: [Dự phòng vật tư và hóa chất](https://docs.google.com/spreadsheets/d/1wamJN787FowPLI3zU-383CME5R-EkI72EP5qLrhj5J4/edit).
Bố cục được đối chiếu với file này ngày 09/09/2026. Dòng dữ liệu bắt đầu ở dòng 3.

## Một workflow gồm ba nhánh

Chỉ import **`workflow-backup-all.json`** một lần.

| Nhánh | Tab đích | Lịch mỗi giờ, giờ Việt Nam | Cron 6 trường |
| --- | --- | --- | --- |
| Vật tư | `VH1_VTDONGBO` | HH:12:17 | `17 12 * * * *` |
| Phiếu hóa chất | `VH1_HOACHAT_DONGBO` | HH:16:29 | `29 16 * * * *` |
| Nhập hóa chất | `NHAP_HOA_CHAT` | HH:19:47 | `47 19 * * * *` |

Các giây 17, 29, 47 tách khỏi giây 40 của đồng bộ vật tư cũ, giây 10 của
đồng bộ hóa chất cũ và các lịch theo phút trong workflow khiếm khuyết lưu trong repo.
Chưa đối chiếu lịch tùy chỉnh khác trên n8n đang chạy.

`TINH_KHO_MONTH` và `Trang tính5` không có luồng ghi. Các workflow chính hiện có
vẫn giữ file đích và lịch cũ.

## Điều kiện chạy và cách import

File được tạo cục bộ, chưa import hoặc kích hoạt trên n8n và chưa ghi Google Sheet.

1. Website cần có API `GET /api/integrations/n8n/material-backup?mode=incremental&scope=materials|chemicals|receipts`.
   Cần đưa phần mã website lên server theo quy trình triển khai riêng trước khi chạy workflow.
   Không cần sửa schema hoặc cơ sở dữ liệu. API dùng biến `N8N_MATERIAL_SYNC_TOKEN` hiện có.
2. Import `workflow-backup-all.json` qua **Import from File** trong n8n. Workflow mặc định `active: false`. Nếu đã import ba bản riêng trước đó, tắt lịch của các bản dự phòng riêng để tránh chạy trùng; giữ nguyên workflow đồng bộ chính.
3. Trong mỗi nhánh, node **Đọc thay đổi website · tên tab**: chọn credential **Header Auth** đang dùng cho vật tư.
   Header `Authorization`, giá trị `Bearer <N8N_MATERIAL_SYNC_TOKEN>`. Không ghi token vào JSON.
4. Trong mỗi nhánh, ba node **Đọc cấu trúc tab**, **Đọc dữ liệu dự phòng**, **Ghi bản dự phòng** (có hậu tố tên tab):
   chọn credential **Google Sheets OAuth2 API**. Tài khoản này phải có quyền chỉnh sửa file mới.
5. Nút **Chạy thủ công cả 3 tab** chạy ba nhánh. Lần đầu lấy toàn bộ để tạo mốc. Kiểm tra cột dữ liệu và ba node **Kết quả**, sau đó bật workflow. Mỗi lịch tự động chỉ chạy nhánh tương ứng. Không chạy thủ công chồng lên lượt tự động.

Node HTTP dùng credential riêng cho website và Google; phần ghi chia gói, mỗi gói
cách nhau 1,2 giây. Xem [tài liệu HTTP Request của n8n](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/).

## Nội dung và cột dữ liệu

| Tab | Nội dung nghiệp vụ | Khóa | Cập nhật nguồn | Trạng thái nghiệp vụ | Đồng bộ lúc | Cột bổ sung |
| --- | --- | --- | --- | --- | --- | --- |
| `VH1_VTDONGBO` | A:AB | AC | AD | AE | AF | AG:AH |
| `VH1_HOACHAT_DONGBO` | A:M | N | O | P | Q | R:S |
| `NHAP_HOA_CHAT` | A:G | H | I | J | K | L:M |

Mapping vật tư giữ đúng mẫu rút gọn: N là ngày lãnh, O là lượng lãnh, P là người
lãnh, Q là hình thức lãnh; R:W là thông tin sử dụng; X là thu hồi; Y:Z là BBNT;
AA là số BBNT D-Office. AB là số biên bản thu hồi; sau khi kho xác nhận đã ký trả
lại, cột này nối thêm thời điểm theo mẫu
`3/2026 · Kho ký trả lại: 09/09/2026 12:00:00`.

Phiếu hóa chất: E:G là thông tin đề xuất, H tên vật tư, I lượng đề xuất, J mục đích,
K người xác nhận, L lịch giao, M thông tin lãnh thực tế. Giữ cách thể hiện số lượng
kèm đơn vị của mapper hiện có.

`NHAP_HOA_CHAT` lấy mỗi chuyến từ `ChemicalReceipt`, bao gồm chuyến nhập từ phiếu
vật tư, nhật ký ngày, nhập trực tiếp và dữ liệu đã import. Không lấy tổng đề xuất
trên phiếu làm lượng đã nhập. A ngày nhập; B tên hóa chất kèm đơn vị gốc; C biển số;
D cân nhà máy; E cân nhà thầu; F lượng công nhận; G cương vị quản lý.
D:F giữ kiểu số và tối đa bốn chữ số thập phân, không đổi tấn thành kg.
J là `Đã ghi nhận` vì chuyến nhập không có trạng thái quy trình riêng.

Giống luồng cũ, Vật tư khác chỉ đưa nhóm Chai Khí vào tab vật tư.

## Sửa phiếu và hồ sơ không còn trên website

Lần đầu workflow lấy toàn bộ dữ liệu. Sau khi ghi Sheet thành công, workflow mới lưu
watermark. Mỗi giờ sau chỉ API đọc các phiếu/chuyến có `updatedAt` mới hơn watermark,
cùng nhật ký xóa phát sinh trong khoảng đó. Có khoảng giao 60 giây nên dữ liệu sát
ranh giới được đọc lặp an toàn; upsert bằng `SYNC_KEY` không tạo dòng trùng.

Nếu lượt ghi Google Sheets lỗi, watermark không đổi và lượt sau sẽ lấy lại thay đổi.
Nếu không có thay đổi, workflow lưu watermark mới rồi kết thúc, không gọi API Google
Sheets và không đọc tab. Mỗi ngày, lượt đầu tiên chỉ đối chiếu danh sách ID/SYNC_KEY
hiện có để phát hiện hồ sơ bị tiến trình dọn theo kỳ xóa; không tải lại nội dung mọi phiếu.

API đọc trong transaction `RepeatableRead`. Mỗi lượt thay đổi hoặc đối chiếu giới hạn
10.000 bản ghi; vượt ngưỡng thì báo lỗi và không cập nhật watermark.

Workflow thêm hai cột cuối:

- **Tình trạng trên website**: `Đang lưu trên website` (ô xanh), `Không còn trên website`
  (ô xám), hoặc `Dòng vật tư đã thay đổi hoặc ngoài phạm vi` (ô xám).
- **Phát hiện không còn lúc**: thời điểm lượt đồng bộ đầu tiên phát hiện thiếu,
  giữ nguyên ở những lượt sau. Đây không phải ngày xóa thực tế.

Giữ dòng dự phòng của cả phiếu hoàn tất và phiếu dang dở khi không còn trên website.
Trạng thái nghiệp vụ cũ như `HOAN_TAT` và dữ liệu A:AF/A:Q/A:K vẫn còn để tra cứu.
Không suy đoán người xóa hoặc nguyên nhân: hệ thống có cả xóa thủ công lẫn dọn hồ sơ theo kỳ.
Phiếu đã mất trước lần dự phòng đầu tiên không thể tự khôi phục từ website; muốn đưa
các hồ sơ đó vào bản mới phải lấy từ bản Sheet cũ hoặc nguồn lưu trữ khác.

Khi sửa làm đổi item ID, trường hợp một dòng cũ và một dòng mới của cùng ID phiếu
được cập nhật ngay tại vị trí cũ. Trường hợp nhiều dòng không xác định được quan hệ
1–1 thì giữ dòng cũ với nhãn thay đổi và thêm dòng mới; không tự ghép nhầm vật tư.
Khi bản ghi xuất hiện trở lại hoặc được sửa, nhãn chuyển xanh và xóa thời điểm phát hiện thiếu.

Phần định dạng `NHAP_HOA_CHAT` cũng nằm trong workflow: số nguyên hiện `22.590`,
số lẻ mới hiện phần thập phân. Không còn dấu phẩy dư ở cuối số nguyên.

Nếu thiếu tab, sai tiêu đề kỹ thuật, khóa trùng, dòng có dữ liệu nhưng thiếu khóa,
API lỗi hoặc dữ liệu thay đổi không đầy đủ, workflow dừng trước khi ghi. Không xóa dòng Sheet.
Ghi theo vị trí tuyệt đối và chỉ cập nhật giá trị/định dạng cần thiết; chạy lại sau
một gói bị lỗi có thể tiếp tục đối chiếu từ dữ liệu đã ghi. Xem
[Google Sheets batchUpdate](https://developers.google.com/workspace/sheets/api/guides/batchupdate).

## Kiểm tra cục bộ

```bash
node scripts/generate-material-backup-workflows.mjs
npx tsx scripts/check-material-backup-sync.ts
```

Script kiểm tra dùng dữ liệu mô phỏng, không truy cập DB/n8n/Google Sheet. Kiểm tra
mapping ba tab, sửa/đổi item, đánh dấu thiếu, khôi phục, dữ liệu lỗi, hơn 200 dòng,
mở rộng lưới, chia gói và cấu trúc JSON. Chưa thay thế lượt chạy thử thật trên n8n.
