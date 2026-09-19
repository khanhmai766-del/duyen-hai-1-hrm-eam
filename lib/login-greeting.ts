/**
 * DẤU "VỪA ĐĂNG NHẬP" — trang đăng nhập đặt, mascot trợ lý đọc để chào thay cho thông báo toast
 * "Đăng nhập thành công" (xem components/ai/ai-chatbox.tsx). Lưu trong sessionStorage: chỉ sống trong
 * tab vừa đăng nhập, đóng tab là hết, không lọt sang lần mở trang sau.
 *
 * Tách đọc (`peek`) và xoá (`clear`): React StrictMode ở dev gọi hàm khởi tạo state hai lần, đọc-kèm-xoá
 * trong đó thì lần gọi thứ hai thấy rỗng và mascot chào nhầm lời thường.
 */
const KEY = "pp:just-logged-in";

export function markJustLoggedIn() {
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* Web storage không khả dụng — mất lời chào, không mất đăng nhập */
  }
}

export function peekJustLoggedIn() {
  try {
    return sessionStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export function clearJustLoggedIn() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* bỏ qua */
  }
}
