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
- Workflow AI chạy lúc 03:00 và xử lý batch 1 file để giới hạn RAM. Các lần sau chỉ tải
  lại tài liệu có checksum hoặc ngày sửa đổi mới.
- Nếu một PDF lỗi, thông báo được lưu vào `aiIndexError`; workflow tiếp tục tài liệu kế tiếp.

## Rollback

Các cột mới đều nullable và `documentUrl` không bị thay đổi. Tắt workflow là website
quay về sử dụng link cũ; không cần xoá dữ liệu.

Dữ liệu AI sinh từ danh mục có `sourcePath` bắt đầu bằng `digital-document:` nên có thể
nhận diện và xóa riêng khi cần rollback phần AI.
