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

n8n container cần:

```dotenv
DH1_APP_URL=https://duyenhai1.vn
N8N_AI_CHAT_TOKEN=<cùng token-webhook>
N8N_AI_TOOL_TOKEN=<cùng token-tool>
```

Sau khi thay đổi biến môi trường n8n, áp dụng cấu hình theo quy trình vận hành đã được
phê duyệt. Không ghi token vào từng node hoặc file workflow.

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
2. Mở node **Google Gemini Chat Model** và chọn credential Gemini API đã tạo trên n8n.
3. Chọn model Gemini đang được credential cho phép. Bản mẫu dùng
   `models/gemini-2.5-flash`; có thể đổi model mà không sửa website.
4. Kiểm tra `DH1_APP_URL` từ n8n truy cập được website qua HTTPS.
5. Chạy thử bằng Test URL; sau khi đạt kiểm thử mới bật Active.
6. Sao chép Production URL vào `N8N_AI_CHAT_WEBHOOK_URL` của website.

Workflow được giao ở trạng thái `active: false`; import không tự chạy và không có
credential thật trong JSON.

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
- Câu lỗi/timeout không xuất hiện trong lịch sử.
- Citation chỉ chứa đường dẫn nội bộ hợp lệ.
- Hội thoại quá hạn bị xóa bởi lịch 02:10.

## 6. Quyền RBAC

Quyền mới là `ai-chat`, mặc định `read` cho mọi vai trò. Quản trị viên có thể đổi về
`none` theo vai trò hoặc ghi đè cho từng tài khoản tại trang ma trận phân quyền.
