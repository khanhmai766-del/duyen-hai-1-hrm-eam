// Chuyển yêu cầu từ trang NKVH sang API sổ PCT của PXVH1.
//
// Trang NKVH (http, khác nguồn) không gọi thẳng duyenhai1.vn được; service worker của tiện ích có
// quyền host nên gọi hộ, kèm cookie đăng nhập duyenhai1.vn sẵn có trên trình duyệt. Tiện ích KHÔNG
// đọc, lưu hay chuyển mật khẩu/cookie đi đâu: cookie do chính trình duyệt gắn vào yêu cầu.
const SERVERS = {
  production: "https://duyenhai1.vn",
  local3030: "http://localhost:3030",
  local3000: "http://localhost:3000",
};

async function serverBase() {
  try {
    const { server } = await chrome.storage.local.get("server");
    const base = SERVERS[server];
    // Bản nộp kho bỏ quyền localhost: chỉ dùng máy chủ mà manifest còn quyền truy cập.
    return base && chrome.runtime.getManifest().host_permissions.includes(`${base}/*`) ? base : SERVERS.production;
  } catch {
    return SERVERS.production;
  }
}

async function callApi({ method, path, body }) {
  if (typeof path !== "string" || !path.startsWith("/api/work-permits/nkvh-claim")) {
    return { ok: false, message: "Yêu cầu không hợp lệ" };
  }
  const base = await serverBase();
  let response;
  try {
    response = await fetch(base + path, {
      method: method === "POST" ? "POST" : "GET",
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { ok: false, message: `Không kết nối được ${base}. Kiểm tra mạng rồi thử lại.` };
  }
  // Chưa đăng nhập: proxy.ts chuyển hướng API sang /login (fetch tự theo, nhận trang HTML 200).
  const toLogin = response.redirected && new URL(response.url).pathname.startsWith("/login");
  if (response.status === 401 || toLogin) {
    return { ok: false, status: 401, message: `Chưa đăng nhập ${base.replace(/^https?:\/\//, "")} trên trình duyệt này. Hãy mở trang, đăng nhập rồi bấm lại.` };
  }
  let json = null;
  try { json = await response.json(); } catch { /* phản hồi không phải JSON */ }
  if (!response.ok || !json || json.error) {
    return { ok: false, status: response.status, message: json?.error || `Máy chủ trả lỗi ${response.status}` };
  }
  return { ok: true, data: json.data };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "NKVH_PCT_API") return false;
  callApi(message).then(sendResponse, (error) => sendResponse({ ok: false, message: String(error?.message || error) }));
  return true;
});
