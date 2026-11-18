// Bản nhúng: thu nhỏ trang Word trong khung xem trước cho vừa chiều ngang (không phóng to quá 100%).
// scripts/build/chuan-the-thuc.mjs chép tệp này thành public/apps/chuan-the-thuc/embed.js, nạp sau app.js.
(function () {
  var box = document.getElementById("preview");
  if (!box) return;
  function fit() {
    var wrap = box.querySelector(".docx-wrapper");
    var page = wrap && wrap.querySelector("section.docx");
    if (!page) return;
    wrap.style.zoom = "";
    var scale = Math.min(1, (box.clientWidth - 28) / page.offsetWidth);
    if (scale > 0) wrap.style.zoom = String(scale);
    // Trang đã vừa khung: phần lề khung còn dư sau khi thu nhỏ không đáng có thanh cuộn ngang
    box.style.overflowX = scale < 1 ? "hidden" : "";
  }
  new ResizeObserver(fit).observe(box);
  // docx-preview chèn khung trước rồi mới chèn từng trang, nên phải theo dõi cả cây con.
  new MutationObserver(fit).observe(box, { childList: true, subtree: true });
})();
