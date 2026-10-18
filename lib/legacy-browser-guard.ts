/**
 * Script chặn "màn hình trắng" trên trình duyệt quá cũ — chèn NGUYÊN VĂN vào <head> của layout gốc,
 * chạy TRƯỚC các tệp JS của Next.
 *
 * Bối cảnh (18/10/2026): lên Next 16 (13/09) thì mặc định chỉ hỗ trợ Safari ≥ 16.4; iPhone iOS 16.2,
 * 16.1, 15.x tải được HTML + CSS (thấy nền xám) nhưng JS chết vì `SyntaxError: Unexpected token '{'`
 * (khối `static {}` trong class) → trắng trang, không một lời giải thích. `browserslist` trong
 * package.json nay hạ mục tiêu xuống Safari/iOS 15.4 (mọi máy iOS 15 đều lên được 15.8). Script này lo
 * phần còn lại:
 *
 * 1. Máy dưới mốc hỗ trợ (thiếu `Array.prototype.at` / `structuredClone` — đều có từ Safari 15.4):
 *    hiện ngay hướng dẫn cập nhật iOS thay cho trang trắng.
 * 2. Lưới an toàn: tệp JS của app lỗi cú pháp hoặc tải hỏng (vd đúng lúc máy chủ nạp lại khi deploy)
 *    mà sau vài giây app vẫn chưa chạy (`data-app-ready` do Providers gắn) → hiện nút "Tải lại trang".
 *
 * PHẢI viết bằng ES5 (var, function, không arrow / template literal) — chính nó phải chạy được trên
 * trình duyệt cũ. Không phụ thuộc React; nội dung tiếng Việt viết thẳng trong chuỗi.
 */
export const LEGACY_BROWSER_GUARD_SCRIPT = `(function () {
  var d = document, w = window, shown = false, appError = null;
  var MIN = "15.4";
  function iosVersion() {
    var m = /(?:iPhone|iPad|iPod)[^)]*? OS (\\d+)_(\\d+)/.exec(navigator.userAgent || "");
    return m ? m[1] + "." + m[2] : null;
  }
  function tooOld() {
    try {
      return typeof Array.prototype.at !== "function" || typeof w.structuredClone !== "function"
        || typeof w.Promise !== "function" || typeof w.fetch !== "function";
    } catch (e) { return true; }
  }
  function show(kind) {
    if (shown || !d.body) return;
    shown = true;
    var ios = iosVersion();
    var box = d.createElement("div");
    box.id = "dh1-legacy-browser";
    box.setAttribute("role", "alert");
    box.style.cssText = "position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483647;background:#F8F7F4;color:#1f2937;"
      + "display:flex;align-items:center;justify-content:center;padding:24px 16px;"
      + "font:16px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;overflow:auto";
    var title, body;
    if (kind === "old") {
      title = "Trình duyệt chưa được hỗ trợ";
      body = (ios
          ? "iPhone này đang chạy <b>iOS " + ios + "</b>. Hệ thống cần <b>iOS " + MIN + " trở lên</b>."
          : "Trình duyệt này quá cũ để chạy hệ thống.")
        + "<br><br><b>Cách khắc phục:</b> vào <b>Cài đặt → Cài đặt chung → Cập nhật phần mềm</b>, "
        + "cập nhật lên bản mới nhất máy cho phép, rồi mở lại trang."
        + (ios ? "" : " Trên máy tính/Android: cập nhật Chrome, Edge hoặc Firefox.");
    } else {
      title = "Chưa tải được ứng dụng";
      body = "Trang chưa tải xong, có thể do mạng chập chờn hoặc hệ thống vừa cập nhật. Vui lòng tải lại trang."
        + (ios ? "<br><br>Nếu vẫn không được, hãy cập nhật iOS (máy đang chạy iOS " + ios + ")." : "");
    }
    box.innerHTML = '<div style="max-width:420px;width:100%;background:#fff;border:1px solid #e5e2da;'
      + 'border-radius:16px;padding:22px 20px;box-shadow:0 6px 24px rgba(0,0,0,.06)">'
      + '<img src="/brand/4.png" alt="" width="48" height="48" style="display:block;margin:0 0 12px">'
      + '<div style="font-size:19px;font-weight:700;margin:0 0 8px">' + title + '</div>'
      + '<div style="color:#4b5563">' + body + '</div>'
      + '<button type="button" style="margin-top:18px;width:100%;min-height:46px;border:0;border-radius:12px;'
      + 'background:#1e3a5f;color:#fff;font-family:inherit;font-size:16px;font-weight:600;cursor:pointer">Tải lại trang</button>'
      + '<div style="margin-top:12px;font-size:12px;color:#9ca3af;word-break:break-word">'
      + (appError ? "Chi tiết: " + String(appError).slice(0, 140).replace(/[<>&]/g, "") : "")
      + '</div></div>';
    box.setAttribute("data-kind", kind);
    box.getElementsByTagName("button")[0].onclick = function () { w.location.reload(); };
    d.body.appendChild(box);
    // Máy quá cũ: React (nếu chạy được phần nào) có thể dựng lại <body> và xoá khung → gắn lại liên tục.
    if (kind === "old") setInterval(function () { if (!box.parentNode && d.body) d.body.appendChild(box); }, 500);
  }
  function whenBody(fn) {
    if (d.body) fn(); else d.addEventListener("DOMContentLoaded", fn);
  }
  if (tooOld()) { whenBody(function () { show("old"); }); return; }
  w.addEventListener("error", function (e) {
    var t = e && e.target;
    if (t && t.tagName === "SCRIPT" && t.src && t.src.indexOf("/_next/") !== -1) appError = "Không tải được " + t.src.split("/").pop();
    else if (e && e.error && e.error.name === "SyntaxError") appError = e.error.name + ": " + e.error.message;
  }, true);
  w.addEventListener("load", function () {
    setTimeout(function () {
      if (appError && !d.documentElement.hasAttribute("data-app-ready")) show("broken");
    }, 4000);
  });
})();`;
