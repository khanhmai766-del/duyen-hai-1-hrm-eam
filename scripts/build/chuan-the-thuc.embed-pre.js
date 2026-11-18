// Bản nhúng: dùng khoá Gemini chung qua máy chủ web. Khoá KHÔNG bao giờ xuống trình duyệt.
// Ai tự nhập khoá riêng trong "Cài đặt AI" thì vẫn gọi thẳng Google như bản độc lập.
// scripts/build/chuan-the-thuc.mjs chèn đoạn này vào app.js, ngay trước mã giao diện.
(function () {
  // Chuẩn mặc định của web chính là NĐDH. Lần đầu sau đợt phát hành này (chưa có khóa "standard-default-nddh-v1") ép về NĐDH kể cả trình duyệt đã lưu lựa chọn cũ;
  // sau đó lựa chọn tự chọn của người dùng (app.js lưu ở localStorage "standard") được giữ nguyên.
  try {
    var std = document.getElementById("standard");
    try {
      if (!localStorage.getItem("standard-default-nddh-v1")) {
        localStorage.setItem("standard", "nddh");
        localStorage.setItem("standard-default-nddh-v1", "1");
        if (std) std.value = "nddh";
      }
    } catch (e1) { if (std) std.value = "nddh"; /* không ghi được localStorage: vẫn dùng NĐDH */ }
    try { if (std && !localStorage.getItem("standard")) std.value = "nddh"; } catch (e2) { if (std) std.value = "nddh"; }
  } catch (e) { /* không có DOM */ }
  var localFetch = globalThis.fetch.bind(globalThis);
  var SHARED_API = "/api/chuan-the-thuc/ai";
  function reply(status, body) {
    return new Response(JSON.stringify(body), { status: status, headers: { "Content-Type": "application/json" } });
  }
  async function config(input, init) {
    var local = await (await localFetch(input, init)).json();
    try {
      var shared = (await (await localFetch(SHARED_API, { cache: "no-store" })).json()).data;
      if (shared && shared.enabled) return reply(200, { hasServerKey: true, model: shared.model, standalone: false });
    } catch (e) { /* không đọc được cấu hình chung: người dùng vẫn nhập được khoá riêng */ }
    return reply(200, local);
  }
  async function review(input, init) {
    var body = JSON.parse((init && init.body) || "{}");
    if (body.apiKey || (body.apiKeys && body.apiKeys.length)) return localFetch(input, init);
    var response = await localFetch(SHARED_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paragraphs: body.paragraphs, passes: body.passes, kind: body.kind, standard: body.standard }),
    });
    var result;
    try { result = JSON.parse(await response.text()); } catch (e) { result = { error: "Máy chủ không phản hồi." }; }
    return result.error || !response.ok ? reply(400, { error: result.error || "Không rà soát được." }) : reply(200, result.data);
  }
  globalThis.fetch = function (input, init) {
    var url = typeof input === "string" ? input : input.url;
    if (url === "/api/config") return config(input, init);
    if (url === "/api/ai") return review(input, init);
    return localFetch(input, init);
  };
})();
