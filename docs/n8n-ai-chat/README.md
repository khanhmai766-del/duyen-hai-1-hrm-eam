# Chatbox AI tra cứu Vận hành 1 (DH1 OPS INSIGHT)

Workflow chỉ đọc dữ liệu mà người đang đăng nhập được phép xem. Website xác thực
NextAuth, phát capability token sống 2 phút; n8n dùng token đó khi gọi sáu API tool.
Gemini không được kết nối trực tiếp PostgreSQL. Nội dung câu hỏi, tối đa 6 tin nhắn
gần nhất (mỗi tin tối đa 400 ký tự) và các trường văn bản tối thiểu do tool trả về được gửi qua n8n tới Google
Gemini API (và Groq khi Gemini lỗi). Ảnh, avatar, tệp đính kèm và toàn bộ bảng dữ liệu
không được gửi đi.

## 0. Luồng một câu hỏi

```text
Trình duyệt ──POST /api/ai/chat──▶ Website ──webhook (streaming)──▶ n8n Agent ──▶ Gemini (dự phòng: Groq)
     ▲  NDJSON: status/tool/delta/done/error      │                        │
     └────────────────────────────────────────────┘◀── json-lines ────────┘
                                                   ▲
                      n8n gọi tool ───────────────▶│ /api/integrations/n8n/ai/tools/*
```

- **Streaming**: webhook ở chế độ `streaming`, Agent bật `enableStreaming`; website chuyển
  từng đoạn chữ về trình duyệt ngay khi mô hình sinh ra.
- **Tiến trình thật**: capability mang mã lượt hỏi (`rid`). Khi n8n gọi tool, website biết
  ngay và hiện "Đang tìm thiết bị…", "Đang tra cứu khiếm khuyết…".
- **Nguồn đối chiếu do website tự gom** từ kết quả tool đã trả về — mô hình không phải chép
  lại URL/chữ ký nữa (bản cũ hay chép sai nên mất nguồn). Tối đa 8 nguồn mỗi câu.
- **Ghép hai gói miễn phí**: Gemini miễn phí là model chính; khi Gemini báo lỗi/hết lượt,
  Agent tự chuyển sang Groq miễn phí (Enable Fallback Model).
- **Ngữ cảnh trang**: nút "Hỏi AI" trên trang thiết bị / phiếu khiếm khuyết gửi kèm
  `page = { path, entityType, entityId, label }`. Mô hình dùng thẳng `entityId` làm `deviceSeq`
  nên BỚT HẲN một lượt gọi "Tìm thiết bị" cho mỗi câu — vừa nhanh hơn vừa hết cảnh trả lời
  nhầm thiết bị trùng tên. Xem `lib/ai-ask.ts` và `components/ai/ask-ai-button.tsx`.
- **Đo chất lượng**: mỗi lượt hỏi ghi một dòng `AiTurnLog` (kể cả lượt lỗi và lượt bị bấm Dừng),
  người dùng chấm hữu ích / chưa đúng ngay dưới câu trả lời. Xem mục 8.
- **Hàng đợi**: 3 câu hỏi chạy cùng lúc, tối đa 8 câu bắt đầu mỗi phút; ai tới sau chờ theo thứ
  tự (được báo "còn N người phía trước"), tối đa 60 giây, thay vì nhận lỗi 429.
- **Ngân sách token**: tối đa 6 lần gọi tool mỗi câu hỏi; mỗi kết quả tool chỉ gửi `facts` đã bỏ
  trường rỗng, chuỗi cắt còn 200 ký tự, cả kết quả không quá ~4.500 ký tự (≈ 1.500–1.800 token) —
  dư thì cắt bớt dòng và dặn mô hình đề nghị người dùng lọc hẹp hơn. Lịch sử hội thoại gửi kèm chỉ
  6 tin gần nhất, mỗi tin 400 ký tự. Mức này đặt theo trần 8.000 token/phút (cộng dồn mọi lượt gọi)
  của model dự phòng Groq miễn phí.
- **Tự thử lại**: Gemini/Groq báo 429/503 hoặc không kết nối được n8n mà CHƯA phát chữ nào
  thì website tự thử lại sau 2 giây rồi 5 giây. Đã hiện chữ thì không thử lại.
- Website vẫn hiểu phản hồi JSON kiểu cũ (`{answer, citations, suggestions}`), nên có thể
  triển khai website trước rồi mới đổi workflow.

## 1. Bí mật và biến môi trường

Người vận hành tự tạo ba chuỗi khác nhau, mỗi chuỗi tối thiểu 32 byte:

```bash
openssl rand -hex 32
```

Không gửi các giá trị này qua chat và không commit vào Git.

Website cần:

```dotenv
N8N_AI_CHAT_WEBHOOK_URL=https://n8n.example.com/webhook/ai-chat-dh1
N8N_AI_CHAT_TOKEN=<token-webhook>
N8N_AI_TOOL_TOKEN=<token-tool>
AI_CAPABILITY_SECRET=<secret-ky-capability>
# Tuỳ chọn:
AI_CHAT_TIMEOUT_MS=45000        # không nhận được byte nào từ n8n quá lâu thì dừng (35–90 giây)
AI_CHAT_MAX_CONCURRENT=3        # số câu hỏi gọi n8n cùng lúc (1–10)
AI_CHAT_MAX_PER_MINUTE=8        # số câu hỏi được bắt đầu mỗi phút (1–60)
```

`AI_CHAT_TIMEOUT_MS` nay là thời gian **im lặng** tối đa (n8n phát keepalive mỗi 30 giây khi
streaming), không còn là thời gian của cả câu. Cả lượt hỏi, kể cả thử lại, bị chặn ở 110 giây —
dưới hạn 120 giây của capability.

n8n dùng credential, không đọc `$env`:

| Credential | Loại | Giá trị | Node sử dụng |
| --- | --- | --- | --- |
| DH1 AI Webhook Auth | Header Auth | `Authorization: Bearer <token-webhook>` | Webhook AI Chat |
| DH1 AI Tool Auth | Header Auth | `Authorization: Bearer <token-tool>` | Sáu tool và Xóa hội thoại quá 14 ngày |
| Gemini - DH1 Chatbox | Google Gemini (PaLM) API | API key Google AI Studio | Google Gemini Chat Model |
| Groq - DH1 Chatbox | Groq API | API key tạo tại console.groq.com (gói miễn phí) | Groq dự phòng |

URL đích được đặt cố định `https://duyenhai1.vn` trong các node HTTP; mô hình không được chọn
host đích. Nếu đổi tên miền, cập nhật cả bảy URL.

### DNS trong container n8n

Container n8n từng lỗi phân giải `duyenhai1.vn` từng lúc (tool báo `EAI_AGAIN`, mô hình trả lời
"không tìm thấy dữ liệu"). Cách sửa là trỏ tên miền về máy chủ ngay trong container, trong
`/opt/n8n/compose.yml` dưới service n8n:

```yaml
    extra_hosts:
      - "duyenhai1.vn:host-gateway"
```

Rồi `docker compose -f /opt/n8n/compose.yml up -d n8n` ngoài giờ cao điểm. nginx của website
nghe `0.0.0.0:443` nên chứng chỉ TLS vẫn hợp lệ khi đi qua địa chỉ gateway.

## 2. Đồng bộ schema

```text
prisma/migrations/20260914120000_add_ai_chat/migration.sql
```

Migration chỉ tạo `AiConversation`, `AiMessage`, index và khóa ngoại. Hội thoại được gia hạn
14 ngày sau mỗi câu trả lời thành công; workflow dọn chạy lúc 02:10 mỗi ngày.

## 3. Nâng cấp workflow

Thứ tự bắt buộc: **triển khai website trước**, rồi mới đổi workflow. Website mới hiểu cả JSON
kiểu cũ lẫn streaming; website cũ không hiểu streaming.

1. Tạo credential **Groq - DH1 Chatbox** (Credentials → Add → Groq API) bằng key miễn phí từ
   console.groq.com. Không dán key vào chat hay file. Model dự phòng là `openai/gpt-oss-120b`
   (theo trang console.groq.com/settings/limits ngày 15/09/2026: 30 lượt/phút, 1.000 lượt/ngày,
   8.000 token/phút, 200.000 token/ngày). Không chọn `groq/compound*` (chỉ chạy công cụ có sẵn
   của Groq, không gọi được tool của website), `allam-2-7b`, `*prompt-guard*`, `*safeguard*`.
   Thay thế được: `qwen/qwen3.8-27b` (cùng hạn mức) nếu gpt-oss-120b bị gỡ.
2. Import `workflow-production.json` bằng **Import from File** thành workflow mới.
3. Chọn credential cho: Webhook AI Chat, SÁU tool (gồm hai tool mới **Lịch trực ca** và
   **Thông báo, mệnh lệnh**), Xóa hội thoại quá 14 ngày, Google Gemini Chat Model, Groq dự
   phòng. Kiểm tra model Gemini đúng model credential được phép dùng (bản mẫu
   `models/gemini-3.8-flash`).
4. Unpublish workflow cũ rồi Publish workflow mới (không để hai workflow trùng path
   `ai-chat-dh1`). Giữ bản cũ ở trạng thái tắt để quay lui.
5. Hỏi thử trên website: chữ phải hiện dần, có dòng trạng thái khi tra cứu, nguồn đối chiếu
   hiện dưới câu trả lời.

Chưa có key Groq: xoá node **Groq dự phòng** và tắt **Enable Fallback Model** trong Agent, phần
còn lại vẫn chạy (chỉ mất lớp dự phòng).

Settings không lưu dữ liệu execution thành công, thất bại, thủ công hoặc tiến trình.

### Nhánh lỗi

`Xác thực và chuẩn hóa` và `Trợ lý AI VH1` dùng On Error = Continue (using error output) →
`Chuẩn hóa lỗi AI` → `Trả lỗi về website` (Respond to Webhook 1.5, bật streaming). Nhánh lỗi chỉ
trả mã: `AI_PROVIDER_UNAVAILABLE`, `AI_PROVIDER_RATE_LIMITED` hoặc `AI_WORKFLOW_FAILED`. Mô tả
lỗi thô n8n tự phát trong luồng chỉ được website dùng để phân loại, không hiển thị, không ghi log.

Lỗi của MỘT lần gọi tool (mạng, hết hạn capability) không làm hỏng câu hỏi: mô hình vẫn trả
lời tiếp với dữ liệu còn lại.

## 4. API tool

```http
Authorization: Bearer N8N_AI_TOOL_TOKEN
X-AI-Capability: <token-do-website-ky>
```

- `POST /api/integrations/n8n/ai/tools/search-devices`
- `POST /api/integrations/n8n/ai/tools/search-defects`
- `POST /api/integrations/n8n/ai/tools/device-history`
- `POST /api/integrations/n8n/ai/tools/material-replacements`
- `POST /api/integrations/n8n/ai/tools/shift-schedule`
- `POST /api/integrations/n8n/ai/tools/search-announcements`
- `POST /api/integrations/n8n/ai/cleanup` — chỉ cần Bearer token.

Hai công cụ thêm ngày 16/09/2026 lấy phạm vi bằng ĐÚNG màn hình tương ứng, không rào thêm và
cũng không nới ra:

| Công cụ | Phạm vi | Cố ý KHÔNG trả |
| --- | --- | --- |
| `shift-schedule` | như `GET /api/shifts`: mọi tài khoản đăng nhập xem được sơ đồ ca trực | điện thoại, ảnh, chữ ký, dữ liệu điểm danh |
| `search-announcements` | như `GET /api/announcements`: mọi tài khoản đăng nhập đọc được | mệnh lệnh đã hết hiệu lực, trừ khi hỏi rõ |

Danh sách người trực đi trong `facts.staff` dưới dạng MẢNG chứ không phải chuỗi: `compactAiFacts`
cắt mọi chuỗi còn 200 ký tự, một kíp 15 người sẽ mất nửa cuối.

Mỗi API tính lại quyền cương vị/cây thiết bị từ database, không tin role hoặc phạm vi do mô
hình gửi. Kết quả tối đa 20 dòng và ~4.500 ký tự, mỗi dòng gồm `sourceType, sourceId, title,
occurredAt, facts` (không có URL, ảnh, avatar hay tệp đính kèm); cắt bớt dòng thì kèm `omitted`. Quá 6 lần gọi trong một câu
hỏi thì tool trả danh sách rỗng kèm lời nhắc trả lời bằng dữ liệu đã có.

## 5. Thử trên máy dev không cần n8n

```bash
node scripts/mock-n8n-ai-chat.mjs
# terminal khác (giá trị giả, chỉ dùng cho dev):
N8N_AI_CHAT_WEBHOOK_URL=http://127.0.0.1:5679/webhook/ai-chat-dh1 N8N_AI_CHAT_TOKEN=dev-webhook-token \
N8N_AI_TOOL_TOKEN=dev-tool-token AI_CAPABILITY_SECRET=dev-capability-secret-0123456789abcdef \
npm run dev -- -p 3030
```

n8n giả lập nói đúng giao thức streaming và gọi thật tool "Tìm thiết bị". Câu hỏi có
"lỗi 429"/"lỗi 503" giả lập nhà cung cấp AI báo lỗi để xem tự thử lại và thông báo lỗi.

Kiểm thử tự động: `npx tsx --test tests/ai/*.test.ts`.

## 6. Kiểm thử chấp nhận

- Tài khoản bị tắt quyền `ai-chat` không thấy nút và API trả 403.
- Người dùng chỉ nhận dữ liệu trong phạm vi cây thiết bị và cương vị của mình.
- Tên thiết bị mơ hồ làm AI hỏi lại, không tự chọn.
- Tool không trả dữ liệu thì AI nói rõ không tìm thấy.
- Webhook thiếu/sai token bị từ chối trước khi chạy Code hoặc Gemini.
- Chữ hiện dần; bấm Dừng thì dừng ngay, câu dở dang không được lưu.
- Câu lỗi/timeout không xuất hiện trong lịch sử; trên màn hình câu hỏi vẫn còn, kèm Thử lại.
- Nguồn đối chiếu chỉ chứa đường dẫn nội bộ hợp lệ.
- Hội thoại quá hạn bị xóa bởi lịch 02:10.
- Mở một thiết bị rồi bấm "Hỏi AI": trợ lý trả lời đúng thiết bị đó mà KHÔNG hiện bước
  "Đang tìm thiết bị".
- Hỏi "hôm nay ai trực ca": trả đủ kíp, có nguồn đối chiếu trỏ về `/hr`.
- Hỏi mệnh lệnh sản xuất: không nhắc tới mệnh lệnh đã đánh dấu hết hiệu lực.
- Câu trả lời không tra được dữ liệu nào hiện dòng cảnh báo "không kèm nguồn đối chiếu".
- Bấm hữu ích / chưa đúng rồi mở lại hội thoại từ lịch sử: nút vẫn giữ trạng thái đã chấm.
- Tài khoản `ai-chat` mức `read` vào `/admin/ai` bị chặn; mức `manage` thì xem được.

## 7. Quyền RBAC

Quyền `ai-chat`, mặc định `read` cho mọi vai trò. Quản trị viên có thể đổi về `none` theo vai
trò hoặc ghi đè cho từng tài khoản tại trang ma trận phân quyền.

Mức `manage`/`full` của cùng quyền đó mở thêm trang số liệu `/admin/ai`.

## 8. Đo chất lượng

Hội thoại tự xoá sau 14 ngày và lượt hỏi lỗi thì không sinh `AiMessage` nào, nên số liệu nằm ở
bảng riêng `AiTurnLog` — FK-free như `DefectHistory`, sống 180 ngày, **không lưu nội dung câu
hỏi**, chỉ lưu độ dài, độ trễ, số lượt tra cứu, số nguồn, mã lỗi và đường dẫn trang (đã bỏ query
string). Đồng bộ schema:

```text
prisma/migrations/20260916090000_add_ai_chat_metrics/migration.sql
```

- **Người dùng chấm** hữu ích / chưa đúng ngay dưới câu trả lời (`PUT /api/ai/messages/:id/rating`).
  Đánh giá ghi cả vào `AiMessage.rating` (để nút giữ trạng thái khi mở lại hội thoại) lẫn
  `AiTurnLog.rating` (để số liệu còn sau khi hội thoại hết hạn).
- **Bấm "Chưa đúng" là chia sẻ cặp hỏi–đáp đó cho quản trị** — chatbox nói rõ điều này ngay dưới
  nút. Trang `/admin/ai` chỉ hiện những cặp đã bị chấm chưa đúng, không hiện hội thoại nào khác.
- **Câu trả lời không có nguồn đối chiếu** được đánh dấu ngay trong chatbox và đếm riêng trên
  trang số liệu: đó là chỉ số quan trọng nhất, vì nó đo đúng cái khó thấy nhất — trợ lý trả lời
  chay chứ không dựa trên bản ghi nào của nhà máy.
- Dọn số liệu quá 180 ngày: `cleanupExpiredAiTurnLogs()` trong `lib/ai-chat.ts`.

## 9. Chấm bộ câu hỏi chuẩn

49 câu hỏi ở `tests/ai/eval/questions.json` chấm **hành vi** của trợ lý — gọi đúng công cụ nào,
có/không có nguồn, trả lời / hỏi lại / từ chối — chứ không chấm nội dung, nên chạy trên DB dev vẫn có
nghĩa. Mỗi câu ghi rõ nó kiểm gì trong trường `why`. Cấu trúc file được khoá bằng
`tests/ai/eval-questions.test.ts`.

```bash
npm run ai:eval -- --dry-run                        # KHÔNG gọi Gemini: kiểm cấu hình + chạy thử 1 công cụ
npm run ai:eval                                     # chạy cả bộ
npm run ai:eval -- --only shift,page-context-001    # chỉ nhóm / câu này
npm run ai:eval -- --email lotruong.s1@powerplant.vn  # đo đúng phạm vi một cương vị
```

**Cần một key Gemini RIÊNG**: tạo ở Google AI Studio trong một project khác project của chatbox
production, rồi thêm `AI_EVAL_GEMINI_API_KEY=...` vào `.env` máy dev. Script từ chối chạy nếu không
có key này, và từ chối nếu nó trùng `GEMINI_API_KEY` — để lượt chấm không ăn hạn mức của người dùng
thật. Gói miễn phí vẫn chạy được: gặp 429 script tự chờ và thử lại, hết lượt thử thì đánh dấu câu đó
"không chấm" chứ không tính là trượt. Mặc định nghỉ 4 giây giữa các câu (`--delay-ms`).

Cách hoạt động — `scripts/ai-eval/`: đọc model, system message, prompt, 6 công cụ và trần số vòng
**thẳng từ `workflow-production.json`** (sửa workflow là bộ chấm tự theo), gọi Gemini REST, còn công
cụ chạy ngay trong tiến trình bằng đúng các hàm website dùng (`runAiTool` — cùng phân quyền, cùng
ngân sách token, cùng cách gom nguồn). Không đi qua n8n vì các node công cụ gọi cứng
`https://duyenhai1.vn`, chạy từ dev sẽ đọc dữ liệu production.

Rào an toàn: chỉ chạy với DB dev local (`scripts/verify/_safety.mjs`, đúng điều B.3 chính sách
ATTT); dừng nếu tài khoản chấm **không thấy thiết bị nào** — trên DB dev hiện các cương vị
*Trưởng kíp Lò - Máy* và *Vận hành viên* thấy 0 thiết bị vì thiếu cấu hình phạm vi, chấm bằng tài
khoản đó sẽ ra "trượt" hàng loạt mà không nói gì về chất lượng. Mặc định dùng tài khoản ADMIN ở chế
độ quản trị (thấy toàn bộ).

Đọc kết quả:

- **Điểm hiện tại** chỉ tính câu `targetPhase: 0`. Năm câu hỏi cách dùng web (`targetPhase: 2`) là
  khoảng trống đã biết, báo riêng.
- **Hành vi** (trả lời / hỏi lại / từ chối) chỉ là đoán bằng heuristic — người phải soát lại trong
  file chi tiết `reports/verify/ai-eval-*.json` (thư mục đã gitignore; có kèm câu trả lời, tức có dữ
  liệu từ DB dev).
- Bộ chấm đo **model + prompt**, không phải bản sao từng byte của n8n: n8n bọc thêm lời dẫn của agent
  LangChain quanh system message. Mỗi câu hỏi độc lập, không mang lịch sử hội thoại.
- Dòng chi phí là ước theo giá trả phí Gemini 3.8 Flash; chạy gói miễn phí thì không mất tiền, nhưng
  số token đo được là thật.
