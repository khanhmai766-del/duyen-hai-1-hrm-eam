# Chatbox AI tra cứu Vận hành 1

Workflow chỉ đọc dữ liệu mà người đang đăng nhập được phép xem. Website xác thực
NextAuth, phát capability token sống 2 phút; n8n dùng token đó khi gọi bốn API tool.
Gemini không được kết nối trực tiếp PostgreSQL. Theo phương án đã chọn, nội dung câu
hỏi, tối đa 10 tin nhắn gần nhất và các trường văn bản tối thiểu do tool trả về sẽ được
gửi qua n8n tới Google Gemini API. Ảnh, avatar, tệp đính kèm và toàn bộ bảng dữ liệu
không được gửi đi.

## 1. Tạo bí mật

Người vận hành tự tạo ba chuỗi khác nhau, mỗi chuỗi tối thiểu 32 byte:

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
```

Không gửi các giá trị này qua chat và không commit vào Git.

Website cần:

```dotenv
N8N_AI_CHAT_WEBHOOK_URL=https://n8n.example.com/webhook/ai-chat-dh1
N8N_AI_CHAT_TOKEN=<token-webhook>
N8N_AI_TOOL_TOKEN=<token-tool>
AI_CAPABILITY_SECRET=<secret-ky-capability>
AI_CHAT_TIMEOUT_MS=45000
```

n8n dùng **hai credential Header Auth**, không đọc `$env`:

| Tên credential | Header Name | Header Value | Node sử dụng |
| --- | --- | --- | --- |
| DH1 AI Webhook Auth | Authorization | `Bearer <token-webhook>` | Webhook AI Chat |
| DH1 AI Tool Auth | Authorization | `Bearer <token-tool>` | Bốn API tool và Xóa hội thoại quá 14 ngày |

Phải có một dấu cách sau `Bearer`; thay phần `<...>` bằng token thật khớp website.
Header Auth là loại credential `httpHeaderAuth`. Với Webhook chọn Authentication =
Header Auth. Với các node HTTP chọn Authentication = Generic Credential Type,
Generic Auth Type = Header Auth, rồi chọn DH1 AI Tool Auth.

`AI_CAPABILITY_SECRET` chỉ nằm trên website. Không ghi token vào Code node, header
thường hoặc file workflow. URL đích được đặt cố định `https://duyenhai1.vn` trong các
node HTTP; nếu đổi tên miền, cập nhật cả năm URL. Mô hình không được chọn host đích.

Không cần các biến chatbox trong container n8n hoặc thay đổi
`N8N_BLOCK_ENV_ACCESS_IN_NODE`. Có thể giữ nguyên các biến đã thêm nhưng workflow mới
không dùng chúng. Không cần nạp lại container n8n cho thay đổi workflow này.

## 2. Đồng bộ schema

Áp dụng đúng migration sau theo quy trình database của môi trường đích:

```text
prisma/migrations/20260914120000_add_ai_chat/migration.sql
```

Migration chỉ tạo `AiConversation`, `AiMessage`, index và khóa ngoại. Không sửa dữ liệu
nghiệp vụ hiện có. Hội thoại được gia hạn 14 ngày sau mỗi câu trả lời thành công và
workflow dọn chạy lúc 02:10 mỗi ngày.

## 3. Import workflow

1. Import `workflow-production.json` bằng **Import from File**.
2. Chọn DH1 AI Webhook Auth cho Webhook; chọn DH1 AI Tool Auth cho bốn tool và node
   dọn hội thoại. Mở node **Google Gemini Chat Model**, chọn credential Gemini API
   đã tạo trên n8n và model đang sử dụng. Không tạo lại hoặc xóa credential Gemini cũ.
3. Chọn model Gemini đang được credential cho phép. Bản mẫu dùng
   `models/gemini-2.5-flash`; có thể đổi model mà không sửa website.
4. Kiểm tra từ n8n truy cập được `https://duyenhai1.vn` qua HTTPS.
5. Khi thay workflow cũ, giữ bản cũ để quay lui. Chuẩn bị đủ credential cho bản mới,
   rồi unpublish bản cũ trước khi Publish bản mới để không trùng POST webhook path.
   Thử câu hỏi từ website. Test URL chỉ dùng khi website được cấu hình URL kiểm thử;
   mở URL trực tiếp trên trình duyệt không phải kiểm thử vì request cần POST và token.
6. Sao chép Production URL vào `N8N_AI_CHAT_WEBHOOK_URL` của website.

Workflow được giao ở trạng thái `active: false`; import không tự chạy và không có
credential thật trong JSON.

Settings của bản mẫu không lưu dữ liệu execution thành công, thất bại, thủ công
hoặc tiến trình. Chỉ website lưu hội thoại thành công trong 14 ngày. Bản mới không
tự xóa các execution của bản cũ; không xóa dữ liệu lịch sử nếu chưa được phê duyệt.

### Trả lỗi dịch vụ AI

Các node Xác thực và chuẩn hóa, Trợ lý AI VH1 và Chuẩn hóa câu trả lời dùng
On Error = Continue (using error output). Output lỗi nối vào Chuẩn hóa lỗi AI,
rồi Trả lỗi JSON về website. Nhánh thành công giữ nguyên.

Nhánh lỗi chỉ trả mã và thông báo an toàn: `AI_PROVIDER_UNAVAILABLE` (HTTP 503),
`AI_PROVIDER_RATE_LIMITED` (HTTP 429) hoặc `AI_WORKFLOW_FAILED` (HTTP 502). Không trả
câu hỏi, capability, key hay lỗi thô. Website kiểm tra lỗi trước transaction lưu
hội thoại, kể cả webhook trả nhầm HTTP 200 với body lỗi. Lỗi 503 không còn hiển thị
thành lỗi JSON không hợp lệ. Việc này không khắc phục tình trạng quá tải của Google.

Để sửa workflow đang chạy mà giữ credential/model đã chọn, cập nhật prompt theo
bản mẫu, thêm hai node xử lý lỗi và các kết nối error output nêu trên rồi Publish
lại. Phần API website cũng cần được triển khai mới theo quy trình đã phê duyệt;
chỉ Publish workflow không cập nhật mã nguồn website.

## 4. API tool

Các request tool bắt buộc có cả hai header:

```http
Authorization: Bearer N8N_AI_TOOL_TOKEN
X-AI-Capability: <token-do-website-ky>
```

Endpoint:

- `POST /api/integrations/n8n/ai/tools/search-devices`
- `POST /api/integrations/n8n/ai/tools/search-defects`
- `POST /api/integrations/n8n/ai/tools/device-history`
- `POST /api/integrations/n8n/ai/tools/material-replacements`
- `POST /api/integrations/n8n/ai/cleanup` — chỉ cần Bearer token.

Mỗi API tính lại quyền cương vị/cây thiết bị từ database, không tin role hoặc phạm vi
do mô hình gửi. Kết quả tối đa 20 dòng và không trả ảnh/avatar/tệp đính kèm.

## 5. Kiểm thử chấp nhận

- Tài khoản bị tắt quyền `ai-chat` không thấy nút và API trả 403.
- Người dùng chỉ nhận dữ liệu trong phạm vi cây thiết bị và cương vị của mình.
- ADMIN tắt chế độ quản trị vẫn dùng đúng vai trò hiệu lực tại lúc đặt câu hỏi.
- Tên thiết bị mơ hồ làm AI hỏi lại, không tự chọn.
- Tool không trả dữ liệu thì AI nói rõ không tìm thấy.
- Webhook thiếu/sai token bị từ chối trước khi chạy Code hoặc Gemini.
- Toàn bộ workflow không còn `$env`; không cần mở quyền đọc biến môi trường.
- Câu lỗi/timeout không xuất hiện trong lịch sử.
- Citation chỉ chứa đường dẫn nội bộ hợp lệ.
- Hội thoại quá hạn bị xóa bởi lịch 02:10.

## 6. Quyền RBAC

Quyền mới là `ai-chat`, mặc định `read` cho mọi vai trò. Quản trị viên có thể đổi về
`none` theo vai trò hoặc ghi đè cho từng tài khoản tại trang ma trận phân quyền.
