/**
 * In một tài liệu HTML hoàn chỉnh (PDF/giấy) mà KHÔNG mở cửa sổ/tab mới.
 *
 * Cách cũ dùng `window.open(...)` bị popup blocker chặn trên production (đặc biệt khi
 * kèm `noopener` thì trả về `null` → tưởng nhầm là bị chặn). Thay vào đó render nội dung
 * vào một iframe ẩn cùng trang rồi gọi `print()` của iframe — không tạo popup nên không
 * bị chặn, vẫn cho phép "Lưu thành PDF" trong hộp thoại in.
 *
 * @returns true nếu đã khởi tạo iframe in được; false nếu môi trường không hỗ trợ.
 */
export function printHtmlReport(html: string): boolean {
  if (typeof document === "undefined") return false;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
    visibility: "hidden",
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    iframe.remove();
    return false;
  }

  let done = false;
  const runPrint = () => {
    if (done) return;
    done = true;
    try {
      win.focus();
      win.print();
    } catch {
      /* bỏ qua lỗi in */
    }
    // Giữ iframe đủ lâu để hộp thoại in xử lý xong rồi mới gỡ.
    window.setTimeout(() => iframe.remove(), 60_000);
  };

  // In sau khi nội dung tải xong; kèm fallback vì vài trình duyệt không bắn 'load'
  // sau document.write.
  iframe.addEventListener("load", runPrint);
  doc.open();
  doc.write(html);
  doc.close();
  window.setTimeout(runPrint, 700);

  return true;
}
