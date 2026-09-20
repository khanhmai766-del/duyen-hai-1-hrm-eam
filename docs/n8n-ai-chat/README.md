# Chatbox AI tra cứu Vận hành 1 (DH1 OPS INSIGHT)

Workflow chỉ đọc dữ liệu mà người đang đăng nhập được phép xem. Website xác thực
NextAuth, phát capability token sống 2 phút; n8n dùng token đó khi gọi bảy API tool.
Mô hình không được kết nối trực tiếp PostgreSQL. Nội dung câu hỏi, tối đa 6 tin nhắn
gần nhất (mỗi tin tối đa 400 ký tự) và các trường văn bản tối thiểu do tool trả về được gửi qua n8n tới
**VietAPI** (`api.vietapi.tech`, tầng 1 GLM và tầng 2 DeepSeek) và **Google Gemini API** (tầng 3,
khi VietAPI hỏng). Ảnh, avatar, tệp đính kèm và toàn bộ bảng dữ liệu không được gửi đi.

> VietAPI là bên trung gian bán lại (hộ kinh doanh, không SLA, không công bố nguồn model, log API
> giữ tối đa 24 giờ). Chọn ngày 17/09/2026 vì giá; cần ATTT duyệt vì MỌI câu hỏi thường ngày đi qua
> đây, không chỉ lúc sự cố. Tầng 3 Gemini chính hãng là lớp giữ chatbox khi VietAPI ngừng.

## 0. Luồng một câu hỏi

```text
Trình duyệt ──POST /api/ai/chat──▶ Website ──webhook (streaming)──▶ n8n Agent ──▶ GLM (dự phòng: DeepSeek → Gemini)
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
- **Ba tầng model**: `glm-5.2` (VietAPI) là model chính; lỗi thì Agent tự chuyển sang
  `deepseek-v4.1-flash` (VietAPI, Enable Fallback Model). Agent của n8n chỉ nhận MỘT model dự phòng,
  nên tầng 3 là Agent thứ hai chạy Gemini miễn phí — xem "Ba tầng model" ở mục 3.
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
  6 tin gần nhất, mỗi tin 400 ký tự. Mức này đặt từ thời Groq dự phòng (8.000 token/phút); giữ lại
  vì mỗi ký tự bị gửi lại ở mọi vòng suy luận — tức bị tính tiền nhiều lần ở VietAPI.
- **Tự thử lại**: nhà cung cấp AI báo 429/503 hoặc không kết nối được n8n mà CHƯA phát chữ nào
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
# Tra cứu tài liệu (RAG, mục 10) — key Gemini riêng cho embedding, KHÔNG dùng GEMINI_API_KEY (TCMS):
AI_KB_EMBEDDING_GEMINI_API_KEY=<key-google-ai-studio>
```

`AI_CHAT_TIMEOUT_MS` nay là thời gian **im lặng** tối đa (n8n phát keepalive mỗi 30 giây khi
streaming), không còn là thời gian của cả câu. Cả lượt hỏi, kể cả thử lại, bị chặn ở 110 giây —
dưới hạn 120 giây của capability.

n8n dùng credential, không đọc `$env`:

| Credential | Loại | Giá trị | Node sử dụng |
| --- | --- | --- | --- |
| DH1 AI Webhook Auth | Header Auth | `Authorization: Bearer <token-webhook>` | Webhook AI Chat |
| DH1 AI Tool Auth | Header Auth | `Authorization: Bearer <token-tool>` | 16 công cụ tra cứu và Xóa hội thoại quá 14 ngày |
| VietAPI - DH1 Chatbox | OpenAI | API key vietapi.tech, **Base URL** `https://api.vietapi.tech/v1`, Allowed domains chỉ `api.vietapi.tech` | GLM chính, DeepSeek dự phòng |
| Gemini - DH1 Chatbox | Google Gemini (PaLM) API | API key Google AI Studio (gói miễn phí) | Gemini tầng 3 |

URL đích được đặt cố định `https://duyenhai1.vn` trong các node HTTP; mô hình không được chọn
host đích. Nếu đổi tên miền, cập nhật toàn bộ URL công cụ trong workflow.

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

1. Tạo credential **VietAPI - DH1 Chatbox** (Credentials → Add → **OpenAI**): dán key, **Base URL**
   `https://api.vietapi.tech/v1`, **Allowed HTTP Request Domains** chỉ `api.vietapi.tech`. Không dán
   key vào chat hay file.
2. Import `workflow-production.json` bằng **Import from File** thành workflow mới.
3. Chọn credential cho: Webhook AI Chat, BẢY tool, Xóa hội thoại quá 14 ngày, **GLM chính** và
   **DeepSeek dự phòng** (VietAPI), **Gemini tầng 3** (Gemini). Kiểm tra model Gemini đúng model
   credential được phép dùng (bản mẫu `models/gemini-3.8-flash`).
4. Unpublish workflow cũ rồi Publish workflow mới (không để hai workflow trùng path
   `ai-chat-dh1`). Giữ bản cũ ở trạng thái tắt để quay lui.
5. Hỏi thử trên website: chữ phải hiện dần, có dòng trạng thái khi tra cứu, nguồn đối chiếu
   hiện dưới câu trả lời.

### Ba tầng model

| Tầng | Node | Model | Nguồn | Giá |
| --- | --- | --- | --- | --- |
| 1 | GLM chính | `glm-5.2` | VietAPI | 0,3 credit / 1 triệu token (1 credit = 1.000đ) |
| 2 | DeepSeek dự phòng | `deepseek-v4.1-flash` | VietAPI | 0,8 credit / 1 triệu token |
| 3 | Gemini tầng 3 | `models/gemini-3.8-flash` | Google, gói miễn phí | 0 |

Đã thử trong n8n ngày 17/09/2026 (workflow thử có công cụ giả, đi hết vòng gọi công cụ → trả lời):
`glm-5.2`, `deepseek-v4.1-flash`, `deepseek-v4-flash` đều gọi đúng công cụ và trả đúng mã. Cả GLM-5.x
lẫn DeepSeek V4 là model SUY NGHĨ và theo tài liệu hãng phải được gửi lại `reasoning_content` khi gọi
tool — Agent của n8n không gửi (issue n8n #29119: DeepSeek chính hãng báo 400). Qua VietAPI thì chạy;
nếu một ngày tầng 1–2 bắt đầu lỗi 400 nhắc `reasoning_content`, nguyên nhân ở đây. Phần suy nghĩ tính
vào `maxTokens`, nên hai node đặt 4.096 (Groq cũ 1.500 sẽ cắt cụt câu trả lời).

Luồng: Agent chính (GLM → DeepSeek) hỏng → `Chuẩn hóa lỗi AI` → cổng **Còn tầng 3?**: Agent chính ĐÃ
chạy và tầng 3 CHƯA chạy → **Lấy lại câu hỏi** (nhánh lỗi chỉ còn mã lỗi; node này lấy lại đầu vào đã
chuẩn hóa) → **Trợ lý AI VH1 - tầng 3**. Tầng 3 cũng lỗi thì quay về `Chuẩn hóa lỗi AI`, cổng thấy tầng
3 đã chạy nên trả lỗi thẳng về website. Lỗi ở bước `Xác thực và chuẩn hóa` (Agent chính chưa chạy)
không chuyển tầng.

Vì sao rẽ theo NGUỒN lỗi chứ không theo mã 429/503: tầng 1 và 2 cùng đi qua VietAPI. VietAPI sập, khoá
key (401), hết credit (402) hay lỗi 5xx đều ra `AI_WORKFLOW_FAILED` — rẽ theo mã thì đúng lúc cần nhất,
Gemini không bao giờ được gọi.

Giới hạn cần biết:

- **Hỏng im lặng**: tầng 3 trả lời bình thường nên người dùng và trang `/admin/ai` không thấy VietAPI
  đang hỏng. Theo dõi số dư và trạng thái ở trang VietAPI; câu trả lời chậm/khác giọng thường ngày là
  dấu hiệu đang chạy Gemini.
- **Gemini miễn phí ~10 lượt gọi/phút**: tầng 3 đỡ được chatbox lúc sự cố, không gánh nổi giờ cao điểm.
- Tầng 3 dùng CHUNG ngân sách 6 lần gọi tool của lượt hỏi: Agent chính đã tra vài lần rồi mới hỏng
  thì tầng 3 còn ít lượt hơn.
- Agent chính hỏng GIỮA LÚC đang phát chữ (hiếm) thì câu trả lời tầng 3 nối tiếp sau phần chữ dở.
- Hai Agent phải giống hệt nhau trừ `needsFallback`: sửa system message/prompt thì sửa CẢ HAI, thêm
  tool thì nối vào CẢ HAI — `tests/ai/n8n-workflow.test.ts` đỏ nếu lệch.
- Bộ chấm `npm run ai:eval` mới gọi được Gemini REST nên đang đo **tầng 3**, chưa đo GLM/DeepSeek.

Settings không lưu dữ liệu execution thành công, thất bại, thủ công hoặc tiến trình.

### Nhánh lỗi

`Xác thực và chuẩn hóa`, `Trợ lý AI VH1` và `Trợ lý AI VH1 - tầng 3` dùng On Error = Continue
(using error output) → `Chuẩn hóa lỗi AI` → `Còn tầng 3?` (xem Ba tầng model ở trên) → `Trả lỗi về website` (Respond to Webhook 1.5, bật streaming). Nhánh lỗi chỉ
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
- `POST /api/integrations/n8n/ai/tools/search-production-orders` — chỉ tra mệnh lệnh sản xuất, mặc định còn hiệu lực.
- `POST /api/integrations/n8n/ai/tools/search-users` — danh bạ nhân sự đang hoạt động, chỉ trả trường liên hệ cơ bản.
- `POST /api/integrations/n8n/ai/tools/search-knowledge-base` — tra tài liệu hướng dẫn (mục 10).
- `POST /api/integrations/n8n/ai/tools/search-work-permits`
- `POST /api/integrations/n8n/ai/tools/safety-registers`
- `POST /api/integrations/n8n/ai/tools/search-materials`
- `POST /api/integrations/n8n/ai/tools/material-tickets`
- `POST /api/integrations/n8n/ai/tools/material-plans`
- `POST /api/integrations/n8n/ai/tools/chemical-inventory`
- `POST /api/integrations/n8n/ai/tools/search-archive`
- `POST /api/integrations/n8n/ai/cleanup` — chỉ cần Bearer token.

Hai công cụ thêm ngày 16/09/2026 lấy phạm vi bằng ĐÚNG màn hình tương ứng, không rào thêm và
cũng không nới ra:

| Công cụ | Phạm vi | Cố ý KHÔNG trả |
| --- | --- | --- |
| `shift-schedule` | như `GET /api/shifts`: mọi tài khoản đăng nhập xem được sơ đồ ca trực | điện thoại, ảnh, chữ ký, dữ liệu điểm danh |
| `search-announcements` | như `GET /api/announcements`: mọi tài khoản đăng nhập đọc được | mệnh lệnh đã hết hiệu lực, trừ khi hỏi rõ |
| `search-production-orders` | như `search-announcements` nhưng luôn giới hạn loại mệnh lệnh sản xuất | mệnh lệnh đã hết hiệu lực, trừ khi hỏi rõ |
| `search-users` | danh bạ tài khoản đang hoạt động; tài khoản chỉ-tra-khiếm-khuyết bị chặn ở cổng chung | mật khẩu, quyền, trạng thái khoá, ảnh, chữ ký và dữ liệu xác thực |

Bảy công cụ thêm ngày 17/09/2026 phủ phân hệ **Quản lý thiết bị** và **Quản lý vật tư**
(`lib/ai-tools-ops.ts`). Gộp theo nhóm nghiệp vụ thay vì một công cụ mỗi trang — mỗi công cụ thêm là
thêm mô tả vào prompt của mọi lượt hỏi và thêm cơ hội mô hình chọn nhầm. Phạm vi gọi lại CHÍNH hàm
quyền của route trang tương ứng; tài khoản `DEFECT_READ_ONLY` bị từ chối ở cả bảy (proxy.ts cũng chặn
các API đó). Dashboard thiết bị cố ý không có công cụ — số liệu của nó là tổng hợp khiếm khuyết.

| Công cụ | Trang | Phạm vi (giống route) |
| --- | --- | --- |
| `search-work-permits` | Sổ cấp PCT | như `GET /api/work-permits`: mọi tài khoản đăng nhập; mặc định bỏ phiếu đã hủy |
| `safety-registers` (`register` = PCCC / TBYCNN / GROUNDING) | `/pccc`, `/tbycnn`, `/grounding-lightning` | `pccc-view` + `resolvePcccViewScope` (ba kiểu phạm vi bình/tủ/bồn như `summary`), `tbycnn-view` + `resolveTbycnnViewScope`, `grounding-lightning-view` + `groundingScopeWithPermissions`. Không có `query`/`attention` thì chỉ trả số lượng |
| `search-materials` (`source` = MATERIAL / ERP) | Danh mục VH1, Vật tư theo ERP | `material-manage` (tồn theo lô như `stock-lots`), `erp-material-manage` |
| `material-tickets` | Theo dõi vật tư | như `GET /api/material-tickets`: mọi tài khoản đăng nhập |
| `material-plans` | Kế hoạch năm, Nhu cầu tháng | `material-manage`; có `period` thì đọc biểu tháng |
| `chemical-inventory` | Tịnh kho hóa chất | `chemical-inventory-manage`, cùng `getMonthlyGrid` |
| `search-archive` | Thư mục lưu trữ | quyền `archive-*` từng nhóm; Dữ liệu vòi dầu chặn theo chức vụ (`assertOilSootAccess`) |

⚠️ `scopeWhere` của PCCC trả `{ OR: [...] }` khi người xem là cấp giám sát — mọi điều kiện lọc thêm phải
ghép bằng `AND: [...]`, spread một khoá `OR` khác vào cùng object là âm thầm GHI ĐÈ phạm vi (đã suýt lọt
khi viết bộ lọc `attention`).

Danh sách người trực đi trong `facts.staff` dưới dạng MẢNG chứ không phải chuỗi: `compactAiFacts`
cắt mọi chuỗi còn 200 ký tự, một kíp 15 người sẽ mất nửa cuối.

Mỗi API tính lại quyền cương vị/cây thiết bị từ database, không tin role hoặc phạm vi do mô
hình gửi. Kết quả tối đa 20 dòng và ~4.500 ký tự, mỗi dòng gồm `sourceType, sourceId, title,
occurredAt, facts` (không có URL, ảnh, avatar hay tệp đính kèm); cắt bớt dòng thì kèm `omitted`. Quá 6 lần gọi trong một câu
hỏi thì tool trả danh sách rỗng kèm lời nhắc trả lời bằng dữ liệu đã có.

## 5. Thử trên máy dev không cần n8n

```bash
node scripts/ai/mock-n8n-ai-chat.mjs
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

54 câu hỏi ở `tests/ai/eval/questions.json` chấm **hành vi** của trợ lý — gọi đúng công cụ nào,
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

Cách hoạt động — `scripts/ai/eval/`: đọc model, system message, prompt, 6 công cụ và trần số vòng
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

## 10. Tra cứu tài liệu (RAG)

Công cụ thứ bảy `search-knowledge-base` (node **Tra cứu tài liệu**, nối vào CẢ HAI Agent) trả lời câu hỏi
CÁCH LÀM / QUY TRÌNH / cách dùng web từ kho tài liệu đã nạp — quy tắc 12 trong system message.

| Nhóm | Quyền | Nguồn |
| --- | --- | --- |
| `vat-tu` Quy trình vật tư | `ai-chat-tailieu-vat-tu` | `public/material-procedures/*.pdf` (khai trong `ai-knowledge-source/sources.json`) |
| `pccc` Sổ thiết bị PCCC | `ai-chat-tailieu-pccc` | `ai-knowledge-source/pccc/` |
| `tbycnn` Sổ thiết bị TBYCNN | `ai-chat-tailieu-tbycnn` | `ai-knowledge-source/tbycnn/` |
| `an-toan` Sổ cấp phiếu công tác | `ai-chat-tailieu-an-toan` | `ai-knowledge-source/an-toan/` |
| `thiet-bi` Quản lý thiết bị | `ai-chat-tailieu-thiet-bi` | `ai-knowledge-source/thiet-bi/` |

Quyền mặc định: mọi vai trò trừ VIEWER; chỉnh ở màn hình phân quyền, nhóm **Trợ lý AI**. Công cụ tính
lại quyền mỗi lần gọi và lọc nhóm TRƯỚC khi xếp hạng, nên đoạn ngoài quyền không bao giờ tới mô hình.
Nguồn đối chiếu trỏ `/tai-lieu/<id>` — trang kiểm cùng quyền, không có quyền thì 404.

**Nội dung các tệp `.md` trong `ai-knowledge-source/` là hỏi – đáp MÔ TẢ CÁCH DÙNG WEB** (soạn
17/09/2026), không phải phương án chữa cháy, quy trình kiểm định hay quy định an toàn lao động chính
thức — đầu mỗi tệp ghi rõ điều này. Không có tài liệu quy trình vận hành thiết bị: không soạn thay vì
không có nguồn thật. Mỗi câu trả lời đã đối chiếu với CODE chứ không chép từ `docs/*.md`: docs lệch code ở
nhiều chỗ (vd `docs/pccc.md` còn ghi "xem không giới hạn" và "manage/full ghi mọi cương vị"; `docs/tbycnn.md`
còn ghi "chưa chốt kỳ" và "ghi cần `tbycnn-manage`" — code đều đã đổi). Đổi luật trên web thì sửa luôn
tệp hỏi – đáp tương ứng rồi nạp lại, nếu không trợ lý trả lời theo luật cũ.

Cách hoạt động:

- **Code chưa dùng pgvector.** Production đã cài extension `vector` 0.8.6 trong `dh1db` từ 17/09/2026
  (gói `postgresql-16-pgvector`, không khởi động lại PostgreSQL), nhưng Postgres dev (embedded) không
  có nên đổi sang phải giữ đường dự phòng. Hiện vector `gemini-embedding-001` 768 chiều lưu
  `DOUBLE PRECISION[]` (`AiKnowledgeChunk`), website tải toàn bộ vào bộ nhớ (cache 5 phút) và so cosine
  trong Node: 128 đoạn, dưới 5 ms. Kho lên vài nghìn đoạn mới đáng chuyển truy vấn sang pgvector.
- Chia đoạn ~900 ký tự (trần 1.400), mang tiêu đề mục markdown, chồng mép 150 ký tự trong cùng mục.
  Đoạn trích gửi mô hình tối đa 1.000 ký tự, tối đa 4 đoạn và 2 đoạn mỗi tài liệu, điểm cosine ≥ 0,69
  (đo lại 17/09/2026 trên 128 đoạn: câu có đáp án 0,71–0,83, câu không liên quan 0,58–0,67, câu bẫy an
  toàn 0,59–0,66; ngưỡng cũ 0,66 đo trên 61 đoạn để lọt câu không liên quan — kho lớn thì điểm nền tăng,
  nạp thêm tài liệu thì đo lại `AI_KNOWLEDGE_MIN_SCORE`).
- Thiếu `AI_KB_EMBEDDING_GEMINI_API_KEY` thì công cụ trả lời "chưa được cấu hình", không lỗi 500.

Nạp tài liệu (sau khi áp `prisma/migrations/20260917100000_add_ai_knowledge/migration.sql`):

```bash
npm run ai:knowledge-ingest -- --dry-run   # đọc + chia đoạn, không gọi Gemini, không ghi DB
npm run ai:knowledge-ingest                # nạp tài liệu mới/đã đổi (DB không phải localhost thì thêm --yes)
npm run ai:knowledge-ingest -- --prune     # xoá tài liệu không còn tệp nguồn
```

Nạp lại chỉ gọi Gemini cho tài liệu đổi nội dung (băm nội dung + model + phiên bản bộ chia đoạn).
Thêm tài liệu: thả `.md`/`.txt`/`.pdf` vào `ai-knowledge-source/<nhóm>/` rồi chạy lại. PDF scan không
có lớp chữ sẽ bị bỏ qua (chưa OCR). Nhóm mới phải thêm vào `AI_KNOWLEDGE_CATEGORIES`
(`lib/ai-knowledge.ts`), `lib/rbac-defaults.ts` và màn hình phân quyền.
