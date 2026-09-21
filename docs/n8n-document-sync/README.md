# Đồng bộ danh mục quy trình từ Google Drive và lập chỉ mục AI

Workflow `workflow-production.json` chỉ đồng bộ metadata; không lưu PDF vào lịch sử n8n.
File gốc tiếp tục nằm trên Google Drive, website giữ `folderId`, `fileId`, tên file,
MIME, thời gian sửa và trạng thái đồng bộ.

Workflow `workflow-ai-index-production.json` chạy sau đó để tải tuần tự từng PDF đã
thay đổi, trích nội dung và cập nhật kho tra cứu AI. Website không tạo bản sao PDF trên ổ đĩa.

## Chuẩn bị

1. Chạy SQL `prisma/manual/20260918_document_drive_sync.sql` trên database website.
2. Đặt `N8N_DOCUMENT_SYNC_TOKEN` cho website bằng một chuỗi ngẫu nhiên riêng.
3. Trong n8n tạo Header Auth:
   - Header: `Authorization`
   - Value: `Bearer <N8N_DOCUMENT_SYNC_TOKEN>`
4. Tạo Google Drive OAuth2 credential bằng tài khoản có quyền đọc các thư mục quy trình.
5. Import workflow và gán hai credential nói trên vào các HTTP Request tương ứng.
6. Đặt `AI_KB_EMBEDDING_GEMINI_API_KEY` trên website trước khi chạy workflow AI.

Workflow không chứa token, Client Secret hoặc ID credential. Không ghi các bí mật này
trực tiếp vào JSON workflow.

## Quy tắc chọn PDF

- Thư mục có đúng một PDF: chọn tự động.
- Nhiều PDF nhưng chỉ một file khớp phần số của số quyết định: chọn file đó.
- Nếu không, chỉ một file có nhãn `CHINH_THUC` hoặc `HIEU_LUC`: chọn file đó.
- Các trường hợp còn lại chuyển `NEEDS_REVIEW`, không chọn theo file mới nhất để tránh
  đưa nhầm bản dự thảo/phụ lục vào AI.
- Với `NEEDS_REVIEW`, workflow lưu danh sách PDF ứng viên. Người có quyền quản lý quy
  trình bấm `Cần chọn PDF` trên website, xem trước và xác nhận file chính. Lựa chọn thủ
  công được giữ ở các lần đối soát sau; nếu file bị chuyển/xóa, trạng thái quay lại
  `NEEDS_REVIEW` để chọn lại.

## API

```http
GET /api/integrations/n8n/documents?limit=500
Authorization: Bearer <N8N_DOCUMENT_SYNC_TOKEN>
```

Lập chỉ mục một PDF đã đồng bộ:

```http
POST /api/integrations/n8n/documents/index?documentId=<id>&fileId=<driveFileId>
Authorization: Bearer <N8N_DOCUMENT_SYNC_TOKEN>
Content-Type: application/pdf
```

API nhận tối đa 25 MB/PDF. PDF có lớp chữ được đọc trực tiếp; PDF scan sẽ OCR tiếng
Việt và tiếng Anh. Nội dung trích xuất và vector được lưu trong PostgreSQL dưới nhóm
quyền `ai-chat-tailieu-quy-trinh`.

```http
POST /api/integrations/n8n/documents
Authorization: Bearer <N8N_DOCUMENT_SYNC_TOKEN>
Content-Type: application/json

{"documents":[{"documentId":"...","driveFolderId":"...","driveFileId":"...","driveFileName":"...pdf","driveMimeType":"application/pdf","driveModifiedTime":"2026-09-18T00:00:00.000Z","driveChecksum":"...","syncStatus":"SYNCED"}]}
```

## Lịch và vận hành

- Đối soát toàn bộ lúc 02:15 mỗi ngày, timezone `Asia/Ho_Chi_Minh`.
- Có thể chạy thủ công sau khi thêm/sửa nhiều tài liệu.
- HTTP lỗi được retry ba lần.
- Execution thành công không lưu dữ liệu để tránh tăng ổ cứng.
- Nếu danh mục vượt 500 bản ghi, workflow dừng rõ ràng thay vì âm thầm bỏ sót;
  khi đó cần nâng workflow sang vòng phân trang.
- Workflow AI xử lý tối đa 20 PDF/ngày từ 14:05 đến 15:40, mỗi PDF cách nhau 5 phút để
  giữ an toàn cho quota Gemini. Tài liệu chưa từng lỗi được ưu tiên trước; các lần sau
  chỉ tải lại tài liệu có checksum hoặc ngày sửa đổi mới.
- Nếu một PDF lỗi, thông báo được lưu vào `aiIndexError`; workflow tiếp tục tài liệu kế tiếp.

## Đối chiếu tài liệu ↔ vector

```bash
npm run check:document-ai              # bảng tổng hợp + danh sách cần nạp lại
npm run check:document-ai -- --json    # JSON để nạp ngược vào n8n
npm run check:document-ai -- --chi-tiet
```

**Chạy trên server.** DB thật nằm trong mạng nội bộ; chạy ở máy dev sẽ trỏ vào Postgres
nhúng cổng 5433 và ra 0 dòng — đó không có nghĩa là không có vấn đề.

Script **chỉ đọc**, không nạp lại giúp: mỗi tài liệu là một lượt gọi embedding Gemini, nên
việc bấm nút để bạn quyết. Nó in sẵn câu `UPDATE ... SET "aiIndexVersion" = NULL` để lần
chạy workflow kế tiếp coi các tài liệu đó là mới.

Các nhóm nó phân loại:

| Nhóm | Nghĩa |
|---|---|
| `OCR_HONG` | PDF quét, trích xuất ra rỗng — xem mục dưới |
| `LOI_KHAC` | Có `aiIndexError` vì lý do khác |
| `CHUA_NAP` | Chưa có bản ghi tri thức nào |
| `RONG` | Có bản ghi nhưng 0 đoạn |
| `VECTOR_HONG` | Có đoạn nhưng vector rỗng |
| `LECH_PHIEN_BAN` | File Drive đã đổi sau lần nạp |
| `CHUA_DONG_BO` | Chưa đồng bộ được PDF — chưa tới lượt nạp AI |

Nó cũng cảnh báo **bản ghi tri thức mồ côi**: `sourcePath` trỏ tới tài liệu đã bị xoá.
Chatbot vẫn trích dẫn được từ chúng nhưng người dùng bấm vào thì không mở ra gì.

### Vì sao cần đối chiếu (9/2026)

OCR cho PDF quét **chưa bao giờ chạy được** trên production: tesseract.js 7.0.0 lấy dữ
liệu làm tên ngôn ngữ (chi tiết trong `lib/tcms/server/pdf/pdf-preview.ts`). Mọi PDF
không có lớp text đều trích ra rỗng nên **không sinh vector nào**, và mỗi lần lỗi còn
bơm ~5,8 MB vào log. Sau khi bản vá lên, những tài liệu đó cần nạp lại — script này chỉ
ra đúng chúng.

Nhớ nhịp **20 PDF/ngày** ở trên: xoá dấu phiên bản cho 100 tài liệu thì mất 5 ngày, không
phải workflow bị treo.

## Rollback

Các cột mới đều nullable và `documentUrl` không bị thay đổi. Tắt workflow là website
quay về sử dụng link cũ; không cần xoá dữ liệu.

Dữ liệu AI sinh từ danh mục có `sourcePath` bắt đầu bằng `digital-document:` nên có thể
nhận diện và xóa riêng khi cần rollback phần AI.
